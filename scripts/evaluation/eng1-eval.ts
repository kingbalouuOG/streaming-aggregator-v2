/**
 * ENG-1 Eval Harness — multi-interest retrieval & signal quality
 *
 * Phase exit gate per the E&P brief §3.6 and the ENG-1 plan §6:
 *
 *   A. τ matrix — pairwise raw cosine over every onboarding cluster's
 *      seed centroid; merge outcomes at candidate τ values. Picks
 *      INTEREST_MERGE_TAU from data, not vibes.
 *   B. Synthetic multi-modal profile (the brief's comedy+thriller class):
 *      recall@500 of held-out positives, single-centroid baseline vs
 *      multi-interest retrieval, plus top-20 interest coverage.
 *   C. Avoid-set γ sweep — suppression of an avoided title's nearest
 *      neighbours in the top-20 without recall regression on positives.
 *
 * Self-contained: centroids are computed IN MEMORY via the real
 * production functions (interestGrouping, kmeans, interestPools — the
 * pure modules), and retrieval hits the real match_titles_by_vector RPC.
 * Does NOT require migration 044/045 to be applied, does not write
 * anything. Reads titles (anon SELECT) only.
 *
 * Real-profile mode (recall on a prototype user's actual log) needs
 * SUPABASE_SERVICE_KEY in .env (RLS) — run with --user-id <uuid>.
 *
 * Usage:
 *   npm run eval:eng1
 *   npx tsx scripts/evaluation/eng1-eval.ts [--taus 0.75,0.80,0.85] [--gammas 0.10,0.15,0.20] [--user-id <uuid>]
 *
 * Not a test suite — a diagnostic gate. Results land in the dated eval
 * doc per house convention.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Pure production modules (no supabase client in their import graph)
import { TASTE_CLUSTERS } from '../../src/lib/taste-v2/tasteClusters';
import { centroid, l2Normalise, rawCosineSimilarity } from '../../src/lib/taste-v2/vectorOps';
import {
  groupSeedsIntoInterests,
  computeInterestWeights,
  INTEREST_MERGE_TAU,
} from '../../src/lib/taste-v2/interestGrouping';
import { weightedKMeans, type WeightedPoint } from '../../src/lib/taste-v2/kmeans';
import { MAX_INTEREST_CENTROIDS } from '../../src/lib/taste-v2/types';
import { mergeInterestPools, type InterestPool } from '../../src/lib/recommendations-v2/interestPools';
import {
  PER_CENTROID_CANDIDATE_LIMIT,
  DEFAULT_CANDIDATE_LIMIT,
  AVOID_PENALTY_GAMMA,
  distanceToSimilarity,
} from '../../src/lib/recommendations-v2/weights';
import type { MatchedTitle } from '../../src/lib/recommendations-v2/types';

// ── Env / client (rank-eval.ts pattern) ──

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
const anonKey = ENV.VITE_SUPABASE_ANON_KEY;
const serviceKey = ENV.SUPABASE_SERVICE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

// Prefer the service key when present: the anon role's ~3s statement
// timeout kills match_titles_by_vector at limit 500 (the app runs it as
// authenticated / service-role, which gets a longer budget). Read-only
// usage either way.
const supabase = createClient(supabaseUrl, serviceKey ?? anonKey);
console.log(`client role: ${serviceKey ? 'service' : 'anon (add SUPABASE_SERVICE_KEY to .env if the RPC times out)'}`);

function flag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const TAUS = (flag('taus') ?? '0.75,0.80,0.85').split(',').map(Number);
const GAMMAS = (flag('gammas') ?? '0.10,0.15,0.20').split(',').map(Number);
const USER_ID = flag('user-id');

// ── Shared helpers ──

async function fetchEmbeddingsByIds(
  client: SupabaseClient,
  tmdbIds: number[],
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < tmdbIds.length; i += 200) {
    const chunk = tmdbIds.slice(i, i + 200);
    const { data, error } = await client
      .from('titles')
      .select('tmdb_id, media_type, embedding')
      .in('tmdb_id', chunk)
      .not('embedding', 'is', null);
    if (error) throw new Error(`embedding fetch failed: ${error.message}`);
    for (const row of data ?? []) {
      const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      if (Array.isArray(emb)) map.set(`${row.media_type}-${row.tmdb_id}`, emb);
    }
  }
  return map;
}

/**
 * RPC with cold-index retry: the first HNSW scan after instance idle can
 * blow the statement timeout (the documented 5–12s cold-start that
 * warmup-foryou exists for). Retried attempts hit warmed pages.
 */
async function retrieve(vector: number[], limit: number): Promise<MatchedTitle[]> {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await supabase.rpc('match_titles_by_vector', {
      query_vector: `[${vector.join(',')}]`,
      match_limit: limit,
    });
    if (!error) return (data ?? []) as MatchedTitle[];
    lastError = error.message;
    if (!/timeout/i.test(error.message)) break;
    console.log(`    (retrieve attempt ${attempt} timed out — cold HNSW index; retrying)`);
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`match_titles_by_vector failed: ${lastError}`);
}

/** Cheap RPC to pull HNSW entry points into cache before the real runs. */
async function warmIndex(vector: number[]): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.rpc('match_titles_by_vector', {
      query_vector: `[${vector.join(',')}]`,
      match_limit: 10,
    });
    if (!error) return;
    await new Promise(r => setTimeout(r, 1500));
  }
}

function poolKeys(matched: MatchedTitle[]): Set<string> {
  return new Set(matched.map(m => `${m.media_type}-${m.tmdb_id}`));
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ── Section A: τ matrix ──

interface ClusterSeed { clusterId: string; vector: number[]; repCount: number }

async function sectionTauMatrix(): Promise<{ seeds: ClusterSeed[]; repEmbMap: Map<string, number[]> }> {
  console.log('\n══ A. Cluster-seed pairwise cosine matrix (τ selection) ══');

  const allReps = TASTE_CLUSTERS.flatMap(c => c.representativeTmdbIds.map(t => t.tmdbId));
  const embMap = await fetchEmbeddingsByIds(supabase, [...new Set(allReps)]);

  const seeds: ClusterSeed[] = [];
  for (const cluster of TASTE_CLUSTERS) {
    const embeddings = cluster.representativeTmdbIds
      .map(t => embMap.get(`${t.mediaType}-${t.tmdbId}`) ?? embMap.get(`movie-${t.tmdbId}`) ?? embMap.get(`tv-${t.tmdbId}`))
      .filter((v): v is number[] => v != null);
    if (embeddings.length === 0) {
      console.warn(`  ⚠ cluster ${cluster.id}: no rep embeddings found — skipped`);
      continue;
    }
    seeds.push({ clusterId: cluster.id, vector: l2Normalise(centroid(embeddings)), repCount: embeddings.length });
  }

  const cosines: { a: string; b: string; cos: number }[] = [];
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      cosines.push({
        a: seeds[i].clusterId,
        b: seeds[j].clusterId,
        cos: rawCosineSimilarity(seeds[i].vector, seeds[j].vector),
      });
    }
  }
  cosines.sort((x, y) => y.cos - x.cos);

  const values = cosines.map(c => c.cos);
  const median = values[Math.floor(values.length / 2)];
  console.log(`  clusters: ${seeds.length}; pairs: ${cosines.length}`);
  console.log(`  pairwise cosine — min ${values[values.length - 1].toFixed(4)}, median ${median.toFixed(4)}, max ${values[0].toFixed(4)}`);

  for (const tau of TAUS) {
    const over = cosines.filter(c => c.cos >= tau);
    console.log(`  τ=${tau.toFixed(2)} → ${over.length} pair(s) would merge`);
    for (const o of over.slice(0, 10)) {
      console.log(`      ${o.a} × ${o.b}: ${o.cos.toFixed(4)}`);
    }
  }
  console.log(`  top-5 most-similar pairs:`);
  for (const o of cosines.slice(0, 5)) console.log(`      ${o.a} × ${o.b}: ${o.cos.toFixed(4)}`);
  console.log(`  active INTEREST_MERGE_TAU = ${INTEREST_MERGE_TAU}`);
  const sparse = seeds.filter(s => s.repCount < 6);
  if (sparse.length > 0) {
    console.log(`  rep-embedding coverage < 6: ${sparse.map(s => `${s.clusterId}(${s.repCount})`).join(', ')}`);
  }

  return { seeds, repEmbMap: embMap };
}

// ── Section B: synthetic multi-modal recall + coverage ──

async function sectionSyntheticRecall(seeds: ClusterSeed[], repEmbMap: Map<string, number[]>) {
  console.log('\n══ B. Synthetic multi-modal profile — recall@500 + coverage ══');

  // The two LEAST-similar clusters among those with decent catalogue
  // coverage (≥ 6 rep embeddings) — a sparse cluster makes the holdout
  // too thin to measure recall meaningfully.
  const eligible = seeds.filter(s => s.repCount >= 6);
  let pair: [ClusterSeed, ClusterSeed] = [eligible[0], eligible[1]];
  let minCos = Infinity;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const cos = rawCosineSimilarity(eligible[i].vector, eligible[j].vector);
      if (cos < minCos) { minCos = cos; pair = [eligible[i], eligible[j]]; }
    }
  }
  console.log(`  profile: ${pair[0].clusterId} + ${pair[1].clusterId} (cosine ${minCos.toFixed(4)}; rep coverage ${pair[0].repCount} + ${pair[1].repCount})`);

  // Positive history = each cluster's rep titles (deterministic order),
  // embeddings reused from the section-A fetch.
  const profileTitles: { clusterId: string; key: string; vec: number[] }[] = [];
  for (const seed of pair) {
    const cluster = TASTE_CLUSTERS.find(c => c.id === seed.clusterId)!;
    const reps = [...cluster.representativeTmdbIds].sort((a, b) => a.tmdbId - b.tmdbId);
    for (const r of reps) {
      const vec = repEmbMap.get(`${r.mediaType}-${r.tmdbId}`)
        ?? repEmbMap.get(`movie-${r.tmdbId}`)
        ?? repEmbMap.get(`tv-${r.tmdbId}`);
      if (vec) profileTitles.push({ clusterId: seed.clusterId, key: `${r.mediaType}-${r.tmdbId}`, vec });
    }
  }

  // Hold out the last 20% per cluster
  const train: typeof profileTitles = [];
  const heldOut: typeof profileTitles = [];
  for (const seed of pair) {
    const mine = profileTitles.filter(t => t.clusterId === seed.clusterId);
    const cut = Math.max(1, Math.floor(mine.length * 0.2));
    train.push(...mine.slice(0, mine.length - cut));
    heldOut.push(...mine.slice(mine.length - cut));
  }
  console.log(`  titles: ${profileTitles.length} (train ${train.length}, held-out ${heldOut.length})`);

  // Baseline: single averaged centroid (today's behaviour)
  const single = l2Normalise(centroid(train.map(t => t.vec)));
  const singlePool = await retrieve(single, DEFAULT_CANDIDATE_LIMIT);
  const singleKeys = poolKeys(singlePool);

  // Multi: k-means over train points → per-centroid retrieval → merge
  const points: WeightedPoint[] = train.map(t => ({ key: t.key, vec: t.vec, weight: 1 }));
  const { centroids, masses } = weightedKMeans(points, MAX_INTEREST_CENTROIDS);
  const weights = computeInterestWeights(masses);
  console.log(`  k-means → K=${centroids.length}, weights [${weights.map(w => w.toFixed(3)).join(', ')}]`);

  const pools: InterestPool[] = [];
  for (let slot = 0; slot < centroids.length; slot++) {
    const matched = await retrieve(centroids[slot], PER_CENTROID_CANDIDATE_LIMIT);
    pools.push({ slot, weight: weights[slot], matched });
  }
  const merged = mergeInterestPools(pools);
  const multiKeys = poolKeys(merged);

  const heldOutKeys = heldOut.map(t => t.key);
  const singleRecall = heldOutKeys.filter(k => singleKeys.has(k)).length / heldOutKeys.length;
  const multiRecall = heldOutKeys.filter(k => multiKeys.has(k)).length / heldOutKeys.length;

  console.log(`  recall@${DEFAULT_CANDIDATE_LIMIT}  single-centroid: ${pct(singleRecall)} (${heldOutKeys.filter(k => singleKeys.has(k)).length}/${heldOutKeys.length})`);
  console.log(`  recall@~${PER_CENTROID_CANDIDATE_LIMIT}×${centroids.length} multi-interest:  ${pct(multiRecall)} (${heldOutKeys.filter(k => multiKeys.has(k)).length}/${heldOutKeys.length})`);
  console.log(`  gate: multi ≥ single → ${multiRecall >= singleRecall ? 'PASS' : 'FAIL'}`);

  // Coverage: distinct source interests in the merged top-20
  const top20 = merged.slice(0, 20);
  const slots = new Set(top20.map(m => m.sourceSlot));
  console.log(`  coverage: top-20 of merged pool spans ${slots.size} interest(s) → ${slots.size >= 2 ? 'PASS' : 'FAIL'} (gate ≥ 2)`);

  // Baseline coverage for contrast: nearest profile cluster per top-20 single
  const nearer = (vec: number[]) =>
    rawCosineSimilarity(vec, pair[0].vector) >= rawCosineSimilarity(vec, pair[1].vector) ? pair[0].clusterId : pair[1].clusterId;
  const singleTopEmb = await fetchEmbeddingsByIds(supabase, singlePool.slice(0, 20).map(m => m.tmdb_id));
  const baselineSides = new Set(
    singlePool.slice(0, 20)
      .map(m => singleTopEmb.get(`${m.media_type}-${m.tmdb_id}`))
      .filter((v): v is number[] => v != null)
      .map(nearer),
  );
  console.log(`  baseline contrast: single-centroid top-20 leans toward ${baselineSides.size} interest(s)`);

  return { merged, heldOut, pair };
}

// ── Section C: avoid-set γ sweep ──

async function sectionAvoidSweep(
  merged: MatchedTitle[],
  heldOut: { key: string }[],
) {
  console.log('\n══ C. Avoid-set penalty — γ sweep ══');

  const top200 = merged.slice(0, 200);
  const embMap = await fetchEmbeddingsByIds(supabase, top200.map(m => m.tmdb_id));

  // Avoided title: the merged pool's #1 candidate — thumbs-downing your
  // top recommendation is the canonical avoid scenario.
  const avoided = top200[0];
  const avoidedKey = `${avoided.media_type}-${avoided.tmdb_id}`;
  const avoidedVec = embMap.get(avoidedKey);
  if (!avoidedVec) { console.warn('  ⚠ no embedding for avoided title — section skipped'); return; }
  console.log(`  avoided: ${avoided.title} (${avoidedKey})`);

  // Its 10 nearest neighbours inside the top-200 (the titles the
  // penalty should suppress)
  const neighbours = top200
    .filter(m => `${m.media_type}-${m.tmdb_id}` !== avoidedKey)
    .map(m => {
      const v = embMap.get(`${m.media_type}-${m.tmdb_id}`);
      return { m, cos: v ? rawCosineSimilarity(avoidedVec, v) : -1 };
    })
    .sort((a, b) => b.cos - a.cos)
    .slice(0, 10)
    .map(n => `${n.m.media_type}-${n.m.tmdb_id}`);

  const heldOutSet = new Set(heldOut.map(h => h.key));

  // Score proxy: taste only (recency/contextual neutral) — suppression is
  // a similarity-space effect; this isolates it.
  const baseScored = top200.map(m => ({
    key: `${m.media_type}-${m.tmdb_id}`,
    score: distanceToSimilarity(m.distance),
  }));

  const rank = (list: { key: string; score: number }[]) =>
    [...list].sort((a, b) => b.score - a.score).map(x => x.key);

  const baseTop20 = new Set(rank(baseScored).slice(0, 20));
  const baseNeighboursIn20 = neighbours.filter(n => baseTop20.has(n)).length;
  const basePositivesIn20 = [...heldOutSet].filter(k => baseTop20.has(k)).length;
  console.log(`  before: ${baseNeighboursIn20}/10 avoided-neighbours and ${basePositivesIn20} held-out positives in top-20`);

  for (const gamma of GAMMAS) {
    const penalised = baseScored.map(c => {
      const v = embMap.get(c.key);
      if (!v || c.key === avoidedKey) return c;
      const cos = Math.max(0, rawCosineSimilarity(avoidedVec, v));
      return { ...c, score: c.score - gamma * cos };
    });
    const top = new Set(rank(penalised).slice(0, 20));
    const neighboursIn = neighbours.filter(n => top.has(n)).length;
    const positivesIn = [...heldOutSet].filter(k => top.has(k)).length;
    const marker = gamma === AVOID_PENALTY_GAMMA ? '  ← active' : '';
    console.log(`  γ=${gamma.toFixed(2)}: ${neighboursIn}/10 neighbours in top-20 (Δ−${baseNeighboursIn20 - neighboursIn}); positives ${positivesIn} (Δ${positivesIn - basePositivesIn20})${marker}`);
  }
  console.log('  gate: neighbour suppression > 0 at active γ with positives Δ ≥ 0');
}

// ── Section D: real-profile recall (service key required) ──

async function sectionRealProfile(userId: string) {
  console.log(`\n══ D. Real-profile recall — user ${userId.slice(0, 8)}… ══`);
  if (!serviceKey) {
    console.log('  SUPABASE_SERVICE_KEY not in .env — skipped (RLS blocks anon reads of another user\'s log).');
    return;
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: interactions, error } = await admin
    .from('user_interactions')
    .select('content_id, media_type, event_type, created_at')
    .eq('user_id', userId)
    .in('event_type', ['thumbs_up', 'watched', 'watchlist_add', 'deep_link_click'])
    .not('content_id', 'is', null)
    .order('created_at', { ascending: true });
  if (error || !interactions || interactions.length === 0) {
    console.log(`  no positive interactions found (${error?.message ?? 'empty log'}) — skipped`);
    return;
  }

  const keys = [...new Set(interactions.map(i => `${i.media_type}-${i.content_id}`))];
  const cut = Math.max(1, Math.floor(keys.length * 0.2));
  const trainKeys = keys.slice(0, keys.length - cut);
  const heldOutKeys = keys.slice(keys.length - cut);
  console.log(`  positives: ${keys.length} distinct (train ${trainKeys.length}, held-out ${heldOutKeys.length})`);
  if (keys.length < 10) { console.log('  < 10 distinct positives — too thin, skipped'); return; }

  const embMap = await fetchEmbeddingsByIds(admin, keys.map(k => parseInt(k.split('-')[1], 10)));
  const trainPts: WeightedPoint[] = trainKeys
    .map(k => ({ key: k, vec: embMap.get(k), weight: 1 }))
    .filter((p): p is WeightedPoint => p.vec != null);

  const single = l2Normalise(centroid(trainPts.map(p => p.vec)));
  const singleRecallSet = poolKeys(await retrieve(single, DEFAULT_CANDIDATE_LIMIT));

  const { centroids, masses } = weightedKMeans(trainPts, MAX_INTEREST_CENTROIDS);
  const weights = computeInterestWeights(masses);
  const pools: InterestPool[] = [];
  for (let slot = 0; slot < centroids.length; slot++) {
    pools.push({ slot, weight: weights[slot], matched: await retrieve(centroids[slot], PER_CENTROID_CANDIDATE_LIMIT) });
  }
  const multiRecallSet = poolKeys(mergeInterestPools(pools));

  const sr = heldOutKeys.filter(k => singleRecallSet.has(k)).length / heldOutKeys.length;
  const mr = heldOutKeys.filter(k => multiRecallSet.has(k)).length / heldOutKeys.length;
  console.log(`  K=${centroids.length}; recall@500 single ${pct(sr)} vs multi ${pct(mr)} → ${mr >= sr ? 'PASS' : 'FAIL'}`);
}

// ── Main ──

(async () => {
  console.log('ENG-1 eval harness — multi-interest retrieval & signal quality');
  console.log(`run: ${new Date().toISOString()}; taus [${TAUS.join(', ')}]; gammas [${GAMMAS.join(', ')}]`);

  const { seeds, repEmbMap } = await sectionTauMatrix();
  console.log('\n  (warming HNSW index…)');
  await warmIndex(seeds[0].vector);
  const { merged, heldOut } = await sectionSyntheticRecall(seeds, repEmbMap);
  await sectionAvoidSweep(merged, heldOut);
  if (USER_ID) await sectionRealProfile(USER_ID);

  console.log('\nDone. Capture this output in the dated eval doc (docs/v2/phase-summaries/).');
})().catch(err => {
  console.error('eval failed:', err);
  process.exit(1);
});
