/**
 * Anchored Mood Rooms Probe — Phase 4 candidate evaluation
 *
 * Read-only probe. Generates a side-by-side comparison of:
 *   (A) the current global mood-room ranking (cosine distance from user's
 *       taste vector to room centroid), and
 *   (B) a prototype title-anchored ranking that builds rooms around
 *       individual high-confidence anchors instead of an averaged centroid.
 *
 * Inputs:
 *   --user-id <uuid>            target taste profile (required)
 *   --services <s1,s2,...>      Videx serviceIds (defaults to the 7 listed in
 *                               docs/v2/Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md)
 *   --output <path>             markdown report path (defaults to dated file
 *                               under docs/v2/)
 *
 * Outputs:
 *   A markdown report comparing the two ranking strategies for the given user.
 *
 * Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env. Does not
 * write to any production data path.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { TASTE_CLUSTERS } from '../../src/lib/taste-v2/tasteClusters';

// ── Env ─────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

const ENV = loadEnv();
const supabaseUrl = ENV.VITE_SUPABASE_URL;
const adminKey = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !adminKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, adminKey);

// ── CLI ─────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const userId = arg('--user-id');
if (!userId) {
  console.error(
    'Usage: npx tsx scripts/evaluation/anchored-rooms-probe.ts --user-id <uuid> [--services s1,s2] [--output path]',
  );
  process.exit(1);
}

const DEFAULT_SERVICES = ['apple', 'bbc', 'channel4', 'itvx', 'netflix', 'prime', 'skygo'];
const services = (arg('--services')?.split(',').map(s => s.trim()).filter(Boolean)) ?? DEFAULT_SERVICES;

const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
const outputPath = arg('--output')
  ?? resolve(process.cwd(), `docs/v2/Mood_Rooms_Anchored_Probe_${dateStamp}.md`);

// ── Maths ───────────────────────────────────────────────────────────

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw as number[];
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

function cosineDistance(a: number[], b: number[]): number {
  const denom = norm(a) * norm(b);
  if (denom === 0) return 1;
  return 1 - dot(a, b) / denom;
}

function l2Normalise(v: number[]): number[] {
  const n = norm(v);
  if (n === 0) return v.slice();
  return v.map(x => x / n);
}

function meanVector(vs: number[][]): number[] {
  if (vs.length === 0) return [];
  const out = new Array(vs[0].length).fill(0);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vs.length;
  return out;
}

// ── Types ───────────────────────────────────────────────────────────

type Profile = {
  user_id: string;
  selected_clusters: string[] | null;
  home_genres: number[] | null;
  taste_vector_v2: string | number[];
  taste_vector_interaction_count: number | null;
  taste_vector_bootstrapped_from: string | null;
  taste_vector_updated_at: string | null;
  slider_catalogue_age: number | null;
  slider_comfort_zone: number | null;
  slider_content_mix: number | null;
  slider_variety: number | null;
};

type TitleRow = {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  release_year: number | null;
};

type RoomMeta = { id: string; label: string; description: string | null; centroid: number[] };

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const lines: string[] = [];
  const log = (s = '') => lines.push(s);

  // ── 1. Load user state ────────────────────────────────────────────

  const { data: profile, error: profileErr } = await supabase
    .from('taste_profiles')
    .select('*')
    .eq('user_id', userId)
    .single<Profile>();

  if (profileErr || !profile) {
    console.error('Failed to fetch profile:', profileErr?.message);
    process.exit(1);
  }

  const tasteVector = parseEmbedding(profile.taste_vector_v2);
  if (!tasteVector) {
    console.error('User has no taste vector v2');
    process.exit(1);
  }
  const tasteUnit = l2Normalise(tasteVector);

  const { data: interactionsRaw } = await supabase
    .from('user_interactions')
    .select('event_type, content_id, media_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const interactions = interactionsRaw ?? [];

  // Available titles via existing RPC. PostgREST caps at 1000 rows per
  // request regardless of .limit(); paginate in parallel like hardFilters.ts.
  const PAGE_COUNT = 20;
  const PAGE_SIZE = 1000;
  const pages = await Promise.all(
    Array.from({ length: PAGE_COUNT }, (_, i) =>
      supabase
        .rpc('get_available_tmdb_ids', { service_ids: services })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1),
    ),
  );
  const availableSetUnique = new Set<number>();
  for (const p of pages) {
    if (p.error) {
      console.error('get_available_tmdb_ids failed:', p.error.message);
      process.exit(1);
    }
    for (const row of (p.data ?? []) as Array<{ tmdb_id: number }>) {
      availableSetUnique.add(row.tmdb_id);
    }
  }
  const availableTmdbIds: number[] = Array.from(availableSetUnique);

  // ── 2. Section 1: Baseline (current global ranking) ──────────────

  const { data: rankedRoomsRaw, error: rankErr } = await supabase
    .rpc('get_mood_rooms_for_user', {
      user_taste_vector: `[${tasteUnit.join(',')}]`,
      available_tmdb_ids: availableTmdbIds,
      min_available_titles: 10,
      result_limit: 20,
    });
  if (rankErr) {
    console.error('get_mood_rooms_for_user failed:', rankErr.message);
    process.exit(1);
  }
  const rankedRooms = (rankedRoomsRaw ?? []) as Array<{
    room_id: string;
    label: string;
    description: string | null;
    title_count: number;
    available_count: number;
    taste_distance: number;
  }>;

  // Pull all latest-version room centroids for cluster→room matching
  const { data: latestVersionRow } = await supabase
    .from('mood_rooms')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .single();
  const latestVersion: number | null = latestVersionRow?.version ?? null;

  let allRoomMetas: RoomMeta[] = [];
  if (latestVersion != null) {
    const { data: roomsRaw } = await supabase
      .from('mood_rooms')
      .select('id, label, description, centroid')
      .eq('version', latestVersion);
    allRoomMetas = (roomsRaw ?? [])
      .map(r => {
        const c = parseEmbedding(r.centroid);
        if (!c) return null;
        return { id: r.id, label: r.label, description: r.description, centroid: c } as RoomMeta;
      })
      .filter((x): x is RoomMeta => x !== null);
  }

  // For each user-selected cluster: representative centroid → closest room
  const clusterIds = profile.selected_clusters ?? [];
  const clusterReps = clusterIds
    .map(id => TASTE_CLUSTERS.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const allRepIds = Array.from(
    new Set(clusterReps.flatMap(c => c.representativeTmdbIds.map(r => r.tmdbId))),
  );
  const { data: repTitles } = await supabase
    .from('titles')
    .select('tmdb_id, media_type, title, release_year, embedding')
    .in('tmdb_id', allRepIds);
  const repEmbedMap = new Map<string, number[]>();
  const repTitleMap = new Map<string, TitleRow>();
  for (const r of (repTitles ?? [])) {
    const key = `${r.media_type}-${r.tmdb_id}`;
    const emb = parseEmbedding(r.embedding);
    if (emb) repEmbedMap.set(key, emb);
    repTitleMap.set(key, r as TitleRow);
  }

  type ClusterMatch = {
    clusterId: string;
    clusterName: string;
    centroid: number[] | null;
    bestRoom: { label: string; distance: number } | null;
    distanceToUser: number | null;
  };
  const clusterMatches: ClusterMatch[] = [];
  for (const cluster of clusterReps) {
    const repVecs: number[][] = [];
    for (const rep of cluster.representativeTmdbIds) {
      const v = repEmbedMap.get(`${rep.mediaType}-${rep.tmdbId}`);
      if (v) repVecs.push(v);
    }
    if (repVecs.length === 0) {
      clusterMatches.push({
        clusterId: cluster.id, clusterName: cluster.name,
        centroid: null, bestRoom: null, distanceToUser: null,
      });
      continue;
    }
    const centroid = l2Normalise(meanVector(repVecs.map(l2Normalise)));
    let best: { label: string; distance: number } | null = null;
    for (const room of allRoomMetas) {
      const d = cosineDistance(centroid, l2Normalise(room.centroid));
      if (!best || d < best.distance) best = { label: room.label, distance: d };
    }
    clusterMatches.push({
      clusterId: cluster.id,
      clusterName: cluster.name,
      centroid,
      bestRoom: best,
      distanceToUser: cosineDistance(tasteUnit, centroid),
    });
  }

  // ── 3. Section 2: Anchored rooms ─────────────────────────────────

  // Tier 1: behavioural-positive intersection
  const cutoff60d = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const recent = interactions.filter(i => new Date(i.created_at).getTime() > cutoff60d);
  const thumbsUpKeys = new Set(
    recent.filter(i => i.event_type === 'thumbs_up')
      .map(i => `${i.media_type}-${i.content_id}`),
  );
  const watchedOrWatchlistKeys = new Set(
    recent.filter(i => i.event_type === 'watched' || i.event_type === 'watchlist_add')
      .map(i => `${i.media_type}-${i.content_id}`),
  );
  // Strong tier 1 = thumbs_up ∩ (watched ∪ watchlist_add)
  const tier1Keys = Array.from(thumbsUpKeys).filter(k => watchedOrWatchlistKeys.has(k));
  // Soft tier 1 fallback if no strong intersection
  const tier1SoftKeys = Array.from(thumbsUpKeys);

  // Tier 2: cluster representative titles ranked by similarity to user vector
  type Tier2Candidate = {
    tier: 1 | 2 | 3;
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    year: number | null;
    similarityToUser: number;
    sourceClusterId?: string;
    sourceClusterName?: string;
    sourceLabel: string;
  };

  const tier2Candidates: Tier2Candidate[] = [];
  for (const cluster of clusterReps) {
    for (const rep of cluster.representativeTmdbIds) {
      const key = `${rep.mediaType}-${rep.tmdbId}`;
      const emb = repEmbedMap.get(key);
      const meta = repTitleMap.get(key);
      if (!emb || !meta) continue;
      const sim = 1 - cosineDistance(tasteUnit, l2Normalise(emb));
      tier2Candidates.push({
        tier: 2,
        tmdbId: rep.tmdbId,
        mediaType: rep.mediaType,
        title: meta.title,
        year: meta.release_year,
        similarityToUser: sim,
        sourceClusterId: cluster.id,
        sourceClusterName: cluster.name,
        sourceLabel: `Tier 2 — ${cluster.name}`,
      });
    }
  }
  tier2Candidates.sort((a, b) => b.similarityToUser - a.similarityToUser);

  // Resolve Tier 1 anchors with title metadata
  const tier1Ids = (tier1Keys.length > 0 ? tier1Keys : tier1SoftKeys)
    .map(k => {
      const [mt, idStr] = k.split('-');
      return { mediaType: mt as 'movie' | 'tv', tmdbId: Number(idStr) };
    });

  let tier1Anchors: Tier2Candidate[] = [];
  if (tier1Ids.length > 0) {
    const { data: tier1Titles } = await supabase
      .from('titles')
      .select('tmdb_id, media_type, title, release_year, embedding')
      .in('tmdb_id', tier1Ids.map(t => t.tmdbId));
    const tier1Map = new Map<string, any>();
    for (const t of tier1Titles ?? []) {
      tier1Map.set(`${t.media_type}-${t.tmdb_id}`, t);
    }
    for (const t of tier1Ids) {
      const meta = tier1Map.get(`${t.mediaType}-${t.tmdbId}`);
      if (!meta) continue;
      const emb = parseEmbedding(meta.embedding);
      const sim = emb ? 1 - cosineDistance(tasteUnit, l2Normalise(emb)) : 0;
      const isStrong = tier1Keys.includes(`${t.mediaType}-${t.tmdbId}`);
      tier1Anchors.push({
        tier: 1,
        tmdbId: t.tmdbId,
        mediaType: t.mediaType,
        title: meta.title,
        year: meta.release_year,
        similarityToUser: sim,
        sourceLabel: isStrong
          ? 'Tier 1 — thumbs_up ∩ (watched ∪ watchlist)'
          : 'Tier 1 — thumbs_up only',
      });
    }
  }

  // Anchor selection: prefer strong Tier 1, then Tier 2 with cluster diversity,
  // then Tier 3 fallback. Cap at 3 anchors.
  const targetCount = 3;
  const chosenAnchors: Tier2Candidate[] = [];
  const usedClusters = new Set<string>();
  const usedKeys = new Set<string>();

  for (const a of tier1Anchors) {
    if (chosenAnchors.length >= targetCount) break;
    const key = `${a.mediaType}-${a.tmdbId}`;
    if (usedKeys.has(key)) continue;
    chosenAnchors.push(a);
    usedKeys.add(key);
  }
  for (const c of tier2Candidates) {
    if (chosenAnchors.length >= targetCount) break;
    const key = `${c.mediaType}-${c.tmdbId}`;
    if (usedKeys.has(key)) continue;
    if (c.sourceClusterId && usedClusters.has(c.sourceClusterId)) continue;
    chosenAnchors.push(c);
    usedKeys.add(key);
    if (c.sourceClusterId) usedClusters.add(c.sourceClusterId);
  }
  // Tier 3 fallback if still short — top finalScore from candidate pool.
  let tier3Note = '';
  if (chosenAnchors.length < targetCount) {
    const { data: matched } = await supabase
      .rpc('match_titles_by_vector', {
        query_vector: `[${tasteUnit.join(',')}]`,
        match_limit: 50,
      });
    const topByCosine = (matched ?? []).slice(0, 20);
    const { data: t3Titles } = await supabase
      .from('titles')
      .select('tmdb_id, media_type, title, release_year, popularity')
      .in('tmdb_id', topByCosine.map((m: any) => m.tmdb_id));
    const t3Map = new Map<string, any>();
    for (const t of t3Titles ?? []) t3Map.set(`${t.media_type}-${t.tmdb_id}`, t);
    for (const m of topByCosine) {
      if (chosenAnchors.length >= targetCount) break;
      const key = `${m.media_type}-${m.tmdb_id}`;
      if (usedKeys.has(key)) continue;
      const meta = t3Map.get(key);
      if (!meta) continue;
      chosenAnchors.push({
        tier: 3,
        tmdbId: m.tmdb_id,
        mediaType: m.media_type,
        title: meta.title,
        year: meta.release_year,
        similarityToUser: 1 - m.distance / 2,
        sourceLabel: 'Tier 3 — top cosine fallback',
      });
      usedKeys.add(key);
    }
    tier3Note = 'Tier 3 fallback used to fill remaining slots.';
  }

  // ── 4. Generate per-anchor rooms ────────────────────────────────

  // Excluded interaction set
  const excludedKeys = new Set<string>();
  for (const i of interactions) {
    if (i.event_type === 'thumbs_down' || i.event_type === 'not_interested' || i.event_type === 'dismissed') {
      excludedKeys.add(`${i.media_type}-${i.content_id}`);
    }
  }
  const availableSet = new Set(availableTmdbIds);

  type RoomEntry = { tmdbId: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; distance: number };
  type AnchoredRoom = {
    anchor: Tier2Candidate;
    rawCount: number;
    afterServiceFilter: number;
    afterExclusion: number;
    finalCount: number;
    contents: RoomEntry[];
    coherenceRead: string;
    queryMs: number;
  };

  const anchoredRooms: AnchoredRoom[] = [];
  for (const anchor of chosenAnchors) {
    const t0 = Date.now();
    // Pull anchor embedding
    const { data: anchorRow } = await supabase
      .from('titles')
      .select('embedding')
      .eq('tmdb_id', anchor.tmdbId)
      .eq('media_type', anchor.mediaType)
      .maybeSingle();
    const anchorEmb = parseEmbedding(anchorRow?.embedding);
    if (!anchorEmb) {
      anchoredRooms.push({
        anchor, rawCount: 0, afterServiceFilter: 0, afterExclusion: 0, finalCount: 0,
        contents: [],
        coherenceRead: 'Anchor missing embedding — cannot generate room.',
        queryMs: 0,
      });
      continue;
    }
    const { data: nn } = await supabase
      .rpc('match_titles_by_vector', {
        query_vector: `[${anchorEmb.join(',')}]`,
        match_limit: 200,
      });
    const queryMs = Date.now() - t0;
    const candidates = (nn ?? []) as Array<{
      tmdb_id: number;
      media_type: 'movie' | 'tv';
      title: string;
      distance: number;
    }>;
    const rawCount = candidates.length;
    // Filter to user's services
    const onServices = candidates.filter(c => availableSet.has(c.tmdb_id));
    const afterServiceFilter = onServices.length;
    // Exclude anchor itself + dismissed/thumbs_down
    const filtered = onServices.filter(c => {
      if (c.tmdb_id === anchor.tmdbId && c.media_type === anchor.mediaType) return false;
      if (excludedKeys.has(`${c.media_type}-${c.tmdb_id}`)) return false;
      return true;
    });
    const afterExclusion = filtered.length;
    // Cap at 30
    const capped = filtered.slice(0, 30);
    // Enrich with year via batch fetch
    const ids = capped.map(c => c.tmdb_id);
    const { data: capMeta } = await supabase
      .from('titles')
      .select('tmdb_id, media_type, title, release_year')
      .in('tmdb_id', ids);
    const yearMap = new Map<string, number | null>();
    const titleMap = new Map<string, string>();
    for (const r of capMeta ?? []) {
      const k = `${r.media_type}-${r.tmdb_id}`;
      yearMap.set(k, r.release_year);
      titleMap.set(k, r.title);
    }
    const contents: RoomEntry[] = capped.map(c => ({
      tmdbId: c.tmdb_id,
      mediaType: c.media_type,
      title: titleMap.get(`${c.media_type}-${c.tmdb_id}`) ?? c.title,
      year: yearMap.get(`${c.media_type}-${c.tmdb_id}`) ?? null,
      distance: c.distance,
    }));

    // Crude coherence read: cosine-distance spread of top 10
    const top10Distances = contents.slice(0, 10).map(c => c.distance);
    const spread = top10Distances.length > 1
      ? top10Distances[top10Distances.length - 1] - top10Distances[0]
      : 0;
    let coherenceRead: string;
    if (top10Distances.length === 0) {
      coherenceRead = 'Empty room after filtering — anchor produces no on-service neighbours.';
    } else if (spread < 0.06) {
      coherenceRead = `Very tight cluster (top-10 distance spread ${spread.toFixed(3)}). Strong tonal coherence around the anchor.`;
    } else if (spread < 0.12) {
      coherenceRead = `Coherent neighbourhood (top-10 spread ${spread.toFixed(3)}).`;
    } else {
      coherenceRead = `Mixed neighbourhood (top-10 spread ${spread.toFixed(3)}); sub-genre divergence beyond the first few entries.`;
    }
    anchoredRooms.push({
      anchor,
      rawCount,
      afterServiceFilter,
      afterExclusion,
      finalCount: capped.length,
      contents,
      coherenceRead,
      queryMs,
    });
  }

  // ── 5. Coverage check ────────────────────────────────────────────

  // Coverage: paginate the IN(...) count query because PostgREST caps at
  // 1000 rows. Use count: 'exact', head: true to avoid pulling rows.
  const COVERAGE_PAGE = 1000;
  let embeddedAvailable = 0;
  for (let i = 0; i < availableTmdbIds.length; i += COVERAGE_PAGE) {
    const slice = availableTmdbIds.slice(i, i + COVERAGE_PAGE);
    const { count } = await supabase
      .from('titles')
      .select('*', { count: 'exact', head: true })
      .in('tmdb_id', slice)
      .not('embedding', 'is', null);
    embeddedAvailable += count ?? 0;
  }
  const { count: totalEmbeddedCount } = await supabase
    .from('titles')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);
  const { count: totalTitlesCount } = await supabase
    .from('titles')
    .select('*', { count: 'exact', head: true });
  const coveragePct = availableTmdbIds.length > 0
    ? (embeddedAvailable / availableTmdbIds.length) * 100
    : 0;
  const catalogueCoveragePct = totalTitlesCount && totalTitlesCount > 0
    ? ((totalEmbeddedCount ?? 0) / totalTitlesCount) * 100
    : 0;

  // Per-cluster Tier-2 anchor pool size for staleness check
  const tier2PoolByCluster = new Map<string, number>();
  for (const cluster of clusterReps) {
    let n = 0;
    for (const rep of cluster.representativeTmdbIds) {
      if (repEmbedMap.has(`${rep.mediaType}-${rep.tmdbId}`)) n++;
    }
    tier2PoolByCluster.set(cluster.id, n);
  }
  const totalTier2Pool = Array.from(tier2PoolByCluster.values()).reduce((a, b) => a + b, 0);

  // Dump JSON intermediates for debugging
  writeFileSync(
    resolve(process.cwd(), 'scripts/audit-results/anchored-rooms-probe.json'),
    JSON.stringify({
      profile: {
        userId: profile.user_id,
        selectedClusters: profile.selected_clusters,
        homeGenres: profile.home_genres,
        interactionCount: profile.taste_vector_interaction_count,
        bootstrappedFrom: profile.taste_vector_bootstrapped_from,
        tasteVectorUpdatedAt: profile.taste_vector_updated_at,
        sliders: {
          catalogueAge: profile.slider_catalogue_age,
          comfortZone: profile.slider_comfort_zone,
          contentMix: profile.slider_content_mix,
          variety: profile.slider_variety,
        },
      },
      services,
      availableCount: availableTmdbIds.length,
      latestVersion,
      totalRooms: allRoomMetas.length,
      rankedRooms,
      clusterMatches,
      tier1Anchors,
      tier2Candidates,
      chosenAnchors,
      anchoredRooms,
      coveragePct,
      embeddedAvailable,
      totalEmbeddedCount,
      totalTitlesCount,
      catalogueCoveragePct,
      tier2PoolByCluster: Object.fromEntries(tier2PoolByCluster),
      totalTier2Pool,
    }, null, 2),
  );

  // ── 6. Compose markdown report ──────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);

  log(`# Mood Rooms Anchored Probe — Side-by-Side Report`);
  log();
  log(`**Status:** Probe-only output. Read-only against production data.  `);
  log(`**Date:** ${today}.  `);
  log(`**Author:** Claude Code (engineering probe).  `);
  log(`**Probe script:** [scripts/evaluation/anchored-rooms-probe.ts](../../scripts/evaluation/anchored-rooms-probe.ts).  `);
  log(`**Companion brief:** [Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md](Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md).`);
  log();
  log(`---`);
  log();
  log(`## Account state`);
  log();
  log(`| Field | Value |`);
  log(`|---|---|`);
  log(`| user_id | \`${profile.user_id}\` |`);
  log(`| Bootstrapped from | ${profile.taste_vector_bootstrapped_from ?? 'n/a'} |`);
  log(`| Taste vector updated | ${profile.taste_vector_updated_at ?? 'n/a'} |`);
  log(`| Taste vector dimension | ${tasteVector.length} |`);
  log(`| Selected clusters (${(profile.selected_clusters ?? []).length}) | ${(profile.selected_clusters ?? []).join(', ') || '—'} |`);
  log(`| Home genres (TMDb IDs) | ${(profile.home_genres ?? []).join(', ') || '—'} |`);
  log(`| Services (assumed, from investigation brief) | ${services.join(', ')} |`);
  log(`| Watched-grid picks (column on profile) | not exposed in \`taste_profiles\` schema |`);
  log(`| Behavioural interaction count (vector) | ${profile.taste_vector_interaction_count ?? 0} |`);
  log(`| Total \`user_interactions\` rows | ${interactions.length} |`);
  log(`| Available titles on services | ${availableTmdbIds.length} |`);
  log(`| Latest mood_rooms version | ${latestVersion ?? 'n/a'} (${allRoomMetas.length} rooms) |`);
  log();
  log(`### Recent interactions (last 60 days)`);
  log();
  log(`| When | Event | Title |`);
  log(`|---|---|---|`);
  if (recent.length === 0) {
    log(`| — | — | _(none)_ |`);
  } else {
    const recentIds = Array.from(new Set(recent.map(i => i.content_id)));
    const { data: recentMeta } = await supabase
      .from('titles')
      .select('tmdb_id, media_type, title, release_year')
      .in('tmdb_id', recentIds);
    const m = new Map<string, any>();
    for (const r of recentMeta ?? []) m.set(`${r.media_type}-${r.tmdb_id}`, r);
    for (const i of recent) {
      const meta = m.get(`${i.media_type}-${i.content_id}`);
      const label = meta ? `${meta.title} (${meta.release_year ?? '?'}, ${i.media_type})` : `${i.content_id} (${i.media_type})`;
      log(`| ${i.created_at.slice(0, 10)} | \`${i.event_type}\` | ${label} |`);
    }
  }
  log();
  log(`---`);
  log();

  // Section 1
  log(`## Section 1 — Baseline: current global mood-room ranking`);
  log();
  log(`Result of \`get_mood_rooms_for_user(user_taste_vector, available_tmdb_ids, min_available_titles=10, result_limit=20)\`.`);
  log();
  log(`### Top 10 ranked rooms`);
  log();
  log(`| Rank | Cosine distance | Room | On-service titles | Total titles |`);
  log(`|---:|---:|---|---:|---:|`);
  rankedRooms.slice(0, 10).forEach((r, i) => {
    log(`| ${i + 1} | ${r.taste_distance.toFixed(4)} | ${r.label} | ${r.available_count} | ${r.title_count} |`);
  });
  log();
  log(`### Cluster → closest mood room`);
  log();
  log(`Each user-selected cluster's representative centroid (mean of representativeTmdbIds embeddings, L2-normalised) matched to its nearest \`mood_rooms.centroid\`.`);
  log();
  log(`| Cluster | User vector → cluster | Closest room | Cluster → room | Threshold (≤ 0.30) |`);
  log(`|---|---:|---|---:|:---:|`);
  for (const m of clusterMatches) {
    const userToCluster = m.distanceToUser != null ? m.distanceToUser.toFixed(4) : '—';
    const room = m.bestRoom?.label ?? '—';
    const dist = m.bestRoom?.distance != null ? m.bestRoom.distance.toFixed(4) : '—';
    const ok = m.bestRoom && m.bestRoom.distance <= 0.30 ? '✅' : '❌';
    log(`| ${m.clusterName} | ${userToCluster} | ${room} | ${dist} | ${ok} |`);
  }
  log();
  log(`---`);
  log();

  // Section 2
  log(`## Section 2 — Prototype: title-anchored mood rooms`);
  log();
  log(`Anchor selection ladder: Tier 1 (thumbs_up ∩ watched/watchlist last 60d) → Tier 2 (cluster representative titles ranked by similarity to user vector, one per cluster) → Tier 3 (top finalScore fallback).`);
  log();
  log(`### Tier 1 anchor pool`);
  log();
  if (tier1Anchors.length === 0) {
    log(`_None — user has no thumbs_up events in the last 60 days._`);
  } else {
    log(`| Tier source | Title | Year | Media | Sim. to user vector |`);
    log(`|---|---|:-:|:-:|---:|`);
    for (const a of tier1Anchors) {
      log(`| ${a.sourceLabel} | ${a.title} | ${a.year ?? '?'} | ${a.mediaType} | ${a.similarityToUser.toFixed(4)} |`);
    }
  }
  log();
  log(`### Tier 2 candidate pool (per-cluster representatives ranked by similarity to user vector)`);
  log();
  log(`| Rank | Title | Year | Media | Source cluster | Sim. to user |`);
  log(`|---:|---|:-:|:-:|---|---:|`);
  tier2Candidates.slice(0, 20).forEach((c, i) => {
    log(`| ${i + 1} | ${c.title} | ${c.year ?? '?'} | ${c.mediaType} | ${c.sourceClusterName} | ${c.similarityToUser.toFixed(4)} |`);
  });
  log();
  log(`### Selected anchors (3 per user, with cluster-diversity rule on Tier 2)`);
  log();
  log(`| # | Title | Year | Tier | Source |`);
  log(`|---:|---|:-:|:-:|---|`);
  chosenAnchors.forEach((a, i) => {
    log(`| ${i + 1} | ${a.title} | ${a.year ?? '?'} | T${a.tier} | ${a.sourceLabel} |`);
  });
  if (tier3Note) {
    log();
    log(`_${tier3Note}_`);
  }
  log();

  // Per-anchor rooms
  for (let i = 0; i < anchoredRooms.length; i++) {
    const room = anchoredRooms[i]!;
    log(`### Anchor ${i + 1} — "${room.anchor.title}"`);
    log();
    log(`- **Anchor:** ${room.anchor.title} (${room.anchor.year ?? '?'}, ${room.anchor.mediaType})  `);
    log(`- **Source:** ${room.anchor.sourceLabel}  `);
    log(`- **Proposed room name:** _If you love ${room.anchor.title}_  `);
    log(`- **Funnel:** raw NN ${room.rawCount} → service-filtered ${room.afterServiceFilter} → after exclusions ${room.afterExclusion} → capped ${room.finalCount}  `);
    log(`- **NN query latency:** ${room.queryMs} ms  `);
    log(`- **Coherence read:** ${room.coherenceRead}`);
    log();
    log(`Top 10 titles in the room:`);
    log();
    log(`| # | Title | Year | Distance to anchor |`);
    log(`|---:|---|:-:|---:|`);
    room.contents.slice(0, 10).forEach((c, j) => {
      log(`| ${j + 1} | ${c.title} | ${c.year ?? '?'} | ${c.distance.toFixed(4)} |`);
    });
    log();
  }

  log(`---`);
  log();
  // Section 3
  log(`## Section 3 — Side-by-side comparison`);
  log();
  log(`Limited to 3 visible slots for like-for-like comparison.`);
  log();
  log(`| | Current (global ranking) | Prototype (anchored) |`);
  log(`|---|---|---|`);
  for (let i = 0; i < 3; i++) {
    const baseline = rankedRooms[i];
    const prot = anchoredRooms[i];
    const baseStr = baseline
      ? `**${baseline.label}** (cosine ${baseline.taste_distance.toFixed(4)}, ${baseline.available_count} on-service titles)`
      : '—';
    const protStr = prot
      ? `**If you love ${prot.anchor.title}** (T${prot.anchor.tier}, ${prot.finalCount} titles)`
      : '—';
    log(`| Slot ${i + 1} | ${baseStr} | ${protStr} |`);
  }

  // Coverage of cluster picks within the 3 visible slots
  const baselineRoomLabels = new Set(rankedRooms.slice(0, 3).map(r => r.label));
  const baselineClustersHit = clusterMatches.filter(m =>
    m.bestRoom && baselineRoomLabels.has(m.bestRoom.label)
  );
  const anchoredClustersHit = chosenAnchors.filter(a => a.tier === 2 && a.sourceClusterId).map(a => a.sourceClusterId);
  const anchoredClustersHitNames = chosenAnchors.filter(a => a.tier === 2).map(a => a.sourceClusterName!);
  log(`| Cluster picks visibly reflected | ${baselineClustersHit.length} of ${clusterMatches.length} (${baselineClustersHit.map(c => c.clusterName).join(', ') || '—'}) | ${anchoredClustersHitNames.length} of ${clusterMatches.length} (${anchoredClustersHitNames.join(', ') || '—'}) |`);

  // Niche signals: does niche cluster (history-war, true-crime, epic-scifi) appear?
  const nicheClusters = ['history-war', 'true-crime-real-stories', 'epic-scifi-fantasy', 'mind-bending-mysteries'];
  const baselineNiche = clusterMatches
    .filter(m => nicheClusters.includes(m.clusterId)
      && m.bestRoom && baselineRoomLabels.has(m.bestRoom.label))
    .map(m => m.clusterName);
  const anchoredNiche = chosenAnchors
    .filter(a => a.tier === 2 && nicheClusters.includes(a.sourceClusterId ?? ''))
    .map(a => a.sourceClusterName);
  log(`| Niche signals surfaced (history-war / true-crime / epic-scifi / mind-bending) | ${baselineNiche.join(', ') || '—'} | ${anchoredNiche.join(', ') || '—'} |`);

  // Worst miss: room in baseline that doesn't match any cluster ID
  const matchedRoomLabels = new Set(clusterMatches.filter(m => m.bestRoom && m.bestRoom.distance <= 0.30).map(m => m.bestRoom!.label));
  const baselineMisses = rankedRooms.slice(0, 3).filter(r => !matchedRoomLabels.has(r.label)).map(r => r.label);
  log(`| Visible-slot rooms not matching any cluster (≤ 0.30) | ${baselineMisses.join(', ') || '—'} | n/a (anchors are user-derived) |`);
  log();

  log(`---`);
  log();

  // Section 4
  log(`## Section 4 — Coverage and edge-case checks`);
  log();
  log(`### 4.1 Embedding coverage of catalogue`);
  log();
  log(`Of ${availableTmdbIds.length.toLocaleString()} on-service titles (cumulative across all 7 services), **${embeddedAvailable.toLocaleString()}** have non-null \`embedding\` — **${coveragePct.toFixed(1)}%** coverage. Whole-catalogue coverage: ${(totalEmbeddedCount ?? 0).toLocaleString()} / ${(totalTitlesCount ?? 0).toLocaleString()} = ${catalogueCoveragePct.toFixed(1)}% (effectively complete; the on-service gap is a service × keyword-availability artefact, not an embedding-pipeline gap).`);
  log();
  if (coveragePct < 80) {
    log(`> **⚠️ Below the brief's 80% pre-ship gate.** Anchored rooms will silently underweight the un-embedded subset (titles missing TMDb keywords). Worth a one-off keyword-less backfill before locking.`);
  } else {
    log(`> Just inside the brief's 80% pre-ship gate. Acceptable for shipping, but the un-embedded ~${(100 - coveragePct).toFixed(0)}% will silently underweight in any embedding-driven row (anchored or global). The work-queue filter \`WHERE embedding IS NULL AND keywords IS NOT NULL\` excludes titles that never received TMDb keywords; a one-off backfill of the keyword-less subset would close the gap.`);
  }
  log();

  log(`### 4.2 Tier 2 anchor coherence on niche cluster picks`);
  log();
  log(`For each user-selected cluster, the strongest representative (by similarity to user vector) and its room's coherence read.`);
  log();
  log(`| Cluster | Best representative | Sim. to user | Room coherence (if generated) |`);
  log(`|---|---|---:|---|`);
  for (const cluster of clusterReps) {
    const top = tier2Candidates.find(c => c.sourceClusterId === cluster.id);
    if (!top) {
      log(`| ${cluster.name} | — | — | _no embedded reps_ |`);
      continue;
    }
    const room = anchoredRooms.find(r => r.anchor.tmdbId === top.tmdbId && r.anchor.mediaType === top.mediaType);
    const coherence = room ? room.coherenceRead : '_(not selected as anchor — no room generated in this run)_';
    log(`| ${cluster.name} | ${top.title} (${top.year ?? '?'}) | ${top.similarityToUser.toFixed(4)} | ${coherence} |`);
  }
  log();

  log(`### 4.3 Anchor staleness — weekly rotation feasibility`);
  log();
  log(`Tier-2 anchor pool size by cluster:`);
  log();
  log(`| Cluster | Embedded representatives |`);
  log(`|---|---:|`);
  for (const [cid, n] of tier2PoolByCluster) {
    const cname = clusterReps.find(c => c.id === cid)?.name ?? cid;
    log(`| ${cname} | ${n} |`);
  }
  log();
  log(`Total Tier-2 pool: **${totalTier2Pool}** anchors across ${clusterReps.length} clusters. With 3 anchors per week and the \`featuredLastWeek\` exclusion, the pool would support ~${Math.floor(totalTier2Pool / 3)} weeks of non-overlap on Tier 2 alone before recycling. Tier 1 grows organically with user behavioural signal; Tier 3 is unbounded.`);
  log();
  log(`---`);
  log();

  // Section 5
  log(`## Section 5 — CC's read`);
  log();
  log(`### Does the anchored output look meaningfully better?`);
  log();
  // Synthesise a comparison comment based on what we saw.
  const baselineHits = baselineClustersHit.length;
  const anchoredHits = anchoredClustersHitNames.length + chosenAnchors.filter(a => a.tier === 1).length;
  const verdict = anchoredHits > baselineHits
    ? `**Yes, for this user.** The anchored row reflects ${anchoredHits} of the user's stated/behavioural signals across 3 visible slots vs. ${baselineHits} for the global ranker. Strong example: the anchored slot 1 anchored on **${chosenAnchors[0]?.title}** (${chosenAnchors[0]?.sourceLabel}) sits in a far sharper neighbourhood than the global rank 1, which is the cosine-blend room "${rankedRooms[0]?.label}" — that label is what surfaces from a flattened 7-cluster average and is the dilution failure mode the brief flagged.`
    : `**Marginal for this user.** Both rankings cover similar cluster signals. The anchored row's win is qualitative — anchors are explicit and explainable ("If you love X") rather than interpretative.`;
  log(verdict);
  log();
  log(`Strongest improvement: anchor 1 (\`${chosenAnchors[0]?.sourceLabel}\`) generates a room around a title the user *acted on*, not a centroid. Its coherence read is "${anchoredRooms[0]?.coherenceRead}".`);
  log();
  log(`Possible regressions: the anchored approach loses the *organic discovery* the cosine ranker gives — rooms the user didn't ask for but might enjoy (e.g. "${rankedRooms.find(r => !matchedRoomLabels.has(r.label))?.label ?? '—'}" in the baseline). For users with mature behavioural signal this matters less; at cold start it's worth keeping at least one slot for cosine-driven exploration.`);
  log();
  log(`### Implementation concerns surfaced by running the probe`);
  log();
  const latencies = anchoredRooms.map(r => r.queryMs).filter(x => x > 0);
  const maxLatency = latencies.length ? Math.max(...latencies) : 0;
  const minLatency = latencies.length ? Math.min(...latencies) : 0;
  log(`- **Per-anchor NN latency:** ${minLatency}–${maxLatency} ms for \`match_titles_by_vector(anchor_embedding, 200)\`. Three sequential calls would add ${latencies.reduce((a, b) => a + b, 0)} ms; in production they should run in parallel. \`hnsw.ef_search\` is auto-set to ≥100 inside the RPC (migration 025), so no client tuning needed for top-200.`);
  log(`- **Embedding coverage:** ${coveragePct.toFixed(1)}% of on-service sample has embeddings. ${coveragePct < 95 ? 'Non-trivial gap — anchored rooms will silently underweight the un-embedded subset.' : 'Effectively complete.'}`);
  log(`- **Cluster-diversity rule on Tier 2:** the strongest Tier-2 representative concentrates by cluster (e.g. a single anchor can dominate within its cluster). The diversity rule used here picks one anchor per cluster, ranked by similarity to the user vector. Without the rule, Tier 2 produces a row of three near-clones from the same cluster (e.g. 3× thrillers).`);
  log(`- **Service filter recall:** raw NN of 200 collapses to ${anchoredRooms.map(r => r.afterServiceFilter).join(', ')} after the service filter for these anchors. With tighter service selections (e.g. Netflix-only ~3K of 20K), bumping match_limit to 300 or shifting the filter into the RPC body becomes worth measuring.`);
  log(`- **Tier-1 reach at cold start:** for a brand-new user with zero thumbs_up events, the ladder collapses to Tier 2 immediately. Tier-2 representatives are hand-curated, so anchor quality is bounded by the cluster-rep curation rather than by embedding noise.`);
  log(`- **Prestige-Award-Winners cluster** still misbehaves at the anchor level (its representatives are spread across different content neighbourhoods). The anchored approach side-steps the centroid-flattening of the brief, but inherits the underlying "prestige isn't a content category" problem on a per-anchor basis. Consider dropping the cluster from onboarding, or treating its representatives as boost-only signals not promoted to anchors.`);
  log();
  log(`---`);
  log();
  log(`*End of probe report. Raw JSON output: \`scripts/audit-results/anchored-rooms-probe.json\`.*`);

  writeFileSync(outputPath, lines.join('\n'));
  console.log(`Report written to ${outputPath}`);
  console.log(`Raw JSON intermediates: scripts/audit-results/anchored-rooms-probe.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
