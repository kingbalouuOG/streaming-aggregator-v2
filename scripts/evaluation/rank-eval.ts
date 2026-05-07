/**
 * Offline Evaluation Harness — Phase 5 update
 *
 * Runs the full ranking pipeline against a real user's data and outputs
 * scored results + row assignments for manual inspection.
 *
 * Phase 5 changes:
 *   - Uses the real contextual scorer (computeContextualScore) instead
 *     of the hardcoded 0.5 placeholder.
 *   - Compares three candidate weight splits side-by-side per the Phase
 *     5 brief §3.4 (60/25/15, 55/25/20, 50/25/25 — taste/recency/contextual).
 *   - Accepts optional --hour, --day, --device, --viewing-context flags
 *     for ctx overrides; defaults to current local Date for hour/day,
 *     'web' for device, profile.viewing_context from DB for viewing.
 *
 * Usage:
 *   npx tsx scripts/evaluation/rank-eval.ts --user-id <uuid>
 *   npx tsx scripts/evaluation/rank-eval.ts --user-id <uuid> --hour 23 --viewing-context wind_down
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env file.
 * Not a test suite — a diagnostic tool for inspecting ranker behavior.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeContextualScore } from '../../src/lib/recommendations-v2/contextual';
import type { PipelineContext } from '../../src/lib/recommendations-v2/types';

// Load .env from project root (run from project root via npx tsx)
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
const supabaseKey = ENV.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── CLI ──

function flag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const userId = flag('user-id');
if (!userId) {
  console.error('Usage: npx tsx scripts/evaluation/rank-eval.ts --user-id <uuid> [--hour H] [--day D] [--device android|ios|web] [--viewing-context VAL]');
  process.exit(1);
}

// ── Scoring helpers (duplicated for standalone use) ──

function distanceToSimilarity(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance / 2));
}

function computeForYouRecencyScore(releaseDate: string | null, halfLifeDays = 180): number {
  if (!releaseDate) return 0.5;
  const parsed = new Date(releaseDate);
  if (isNaN(parsed.getTime())) return 0.5;
  const daysSince = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 0) return 1.0;
  return Math.exp(-0.693 * daysSince / halfLifeDays);
}

interface Stage2Weights {
  taste: number;
  recency: number;
  contextual: number;
}

/** Modulate a base weight set by the catalogue-age slider. The base
 *  weights replace the prior hardcoded 5:1 taste:contextual ratio so
 *  we can test alternate splits cleanly. */
function modulateWeights(base: Stage2Weights, catalogueAgeSlider: number): Stage2Weights {
  // Mirrors getModulatedWeights from src/lib/recommendations-v2/weights.ts
  // but parameterized on the base ratio.
  const rawRecency = 0.30 - catalogueAgeSlider * 0.20;
  const nonRecencyBudget = 1.0 - rawRecency;
  const ratio = base.taste / base.contextual; // taste:contextual ratio at base
  const contextual = nonRecencyBudget / (1 + ratio);
  const taste = nonRecencyBudget - contextual;
  return { taste, recency: rawRecency, contextual };
}

function parseRtScore(rtScore: string | null | undefined): number {
  if (!rtScore) return 0.5;
  const match = rtScore.match(/^(\d+)%?$/);
  if (!match) return 0.5;
  return Math.min(1.0, Math.max(0.0, parseInt(match[1], 10) / 100));
}

// ── Weight split candidates per Phase 5 brief §3.4 ──
const WEIGHT_SPLITS: Record<string, Stage2Weights> = {
  'phase4-baseline (62.5/25/12.5)': { taste: 0.625, recency: 0.25, contextual: 0.125 },
  'split-A (60/25/15)':             { taste: 0.60,  recency: 0.25, contextual: 0.15  },
  'split-B (55/25/20)':             { taste: 0.55,  recency: 0.25, contextual: 0.20  },
  'split-C (50/25/25)':             { taste: 0.50,  recency: 0.25, contextual: 0.25  },
};

// ── Main ──

async function main() {
  console.log(`\n=== Videx v2 Ranking Pipeline Evaluation (Phase 5) ===`);
  console.log(`User ID: ${userId}\n`);

  // 1. Fetch user profile (taste_profiles)
  const { data: profile, error: profileErr } = await supabase
    .from('taste_profiles')
    .select(
      'taste_vector_v2, slider_catalogue_age, slider_comfort_zone, '
      + 'slider_content_mix, slider_variety, taste_vector_interaction_count, '
      + 'taste_vector_bootstrapped_from, selected_clusters'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (profileErr || !profile) {
    console.error('Failed to fetch taste profile:', profileErr?.message ?? 'No profile found');
    process.exit(1);
  }

  const tasteVector: number[] | null = profile.taste_vector_v2
    ? JSON.parse(profile.taste_vector_v2 as string)
    : null;
  if (!tasteVector) {
    console.error('User has no taste vector. Complete onboarding first.');
    process.exit(1);
  }

  const sliders = {
    catalogueAge: profile.slider_catalogue_age ?? 0.5,
    comfortZone: profile.slider_comfort_zone ?? 0.25,
    contentMix: profile.slider_content_mix ?? 0.5,
    variety: profile.slider_variety ?? 0.5,
  };

  console.log('Slider state:', sliders);
  console.log('Interaction count:', profile.taste_vector_interaction_count);
  console.log('Bootstrap source:', profile.taste_vector_bootstrapped_from);
  console.log('Selected clusters:', profile.selected_clusters);
  console.log(`Taste vector: ${tasteVector.length}D\n`);

  // 1b. Build PipelineContext (Phase 5)
  const ctx: PipelineContext = {};
  ctx.hourOfDay = flag('hour') != null ? parseInt(flag('hour')!, 10) : new Date().getHours();
  ctx.dayOfWeek = flag('day') != null ? parseInt(flag('day')!, 10) : new Date().getDay();
  const dev = flag('device');
  if (dev === 'android' || dev === 'ios' || dev === 'web') ctx.devicePlatform = dev;

  // viewing_context: --viewing-context flag, else read from profiles.
  const vcOverride = flag('viewing-context');
  if (vcOverride) {
    ctx.viewingContext = vcOverride;
  } else {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('viewing_context')
      .eq('id', userId)
      .maybeSingle();
    const vc = (profileRow as { viewing_context?: string | null } | null)?.viewing_context;
    if (vc) ctx.viewingContext = vc;
  }

  console.log('PipelineContext:', ctx);

  // 2. Fetch user interactions (summary)
  const { data: interactions } = await supabase
    .from('user_interactions')
    .select('event_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  const interactionSummary: Record<string, number> = {};
  for (const i of (interactions ?? [])) {
    interactionSummary[i.event_type] = (interactionSummary[i.event_type] ?? 0) + 1;
  }
  console.log('Interaction summary (last 200):', interactionSummary);

  // 3. Fetch candidates via RPC
  const vectorStr = `[${tasteVector.join(',')}]`;
  const { data: matched, error: rpcErr } = await supabase.rpc('match_titles_by_vector', {
    query_vector: vectorStr,
    match_limit: 500,
  });
  if (rpcErr || !matched) {
    console.error('RPC failed:', rpcErr?.message);
    process.exit(1);
  }
  console.log(`\nStage 1: Retrieved ${matched.length} candidates from vector search`);

  // 4. Fetch metadata
  const tmdbIds = matched.map((m: any) => m.tmdb_id);
  const { data: titleData } = await supabase
    .from('titles')
    .select(
      'tmdb_id, media_type, title, release_date, release_year, genre_ids, '
      + 'vote_average, vote_count, popularity, runtime, rt_score, imdb_rating, '
      + 'director, cast_top_5'
    )
    .in('tmdb_id', tmdbIds);
  const metaMap = new Map<string, any>();
  for (const row of (titleData ?? [])) {
    metaMap.set(`${row.media_type}-${row.tmdb_id}`, row);
  }

  // 5. Score candidates against ALL weight splits — emit comparison table.
  type Candidate = {
    key: string;
    title: string;
    mediaType: string;
    year: number | null;
    taste: number;
    recency: number;
    contextual: number;
    finalByLabel: Record<string, number>;
    popularity: number | null;
    voteAverage: number | null;
    runtime: number | null;
    rtScore: string | null;
    imdbRating: number | null;
    genres: number[] | null;
    director: string | null;
  };

  const candidates: Candidate[] = [];
  for (const m of matched as any[]) {
    const key = `${m.media_type}-${m.tmdb_id}`;
    const meta = metaMap.get(key);
    if (!meta) continue;

    const taste = distanceToSimilarity(m.distance);
    const recency = computeForYouRecencyScore(meta.release_date);
    const contextual = computeContextualScore({ meta }, ctx);

    const finalByLabel: Record<string, number> = {};
    for (const [label, base] of Object.entries(WEIGHT_SPLITS)) {
      const w = modulateWeights(base, sliders.catalogueAge);
      finalByLabel[label] = w.taste * taste + w.recency * recency + w.contextual * contextual;
    }

    candidates.push({
      key,
      title: meta.title,
      mediaType: m.media_type,
      year: meta.release_year,
      taste,
      recency,
      contextual,
      finalByLabel,
      popularity: meta.popularity,
      voteAverage: meta.vote_average,
      runtime: meta.runtime,
      rtScore: meta.rt_score,
      imdbRating: meta.imdb_rating,
      genres: meta.genre_ids,
      director: meta.director,
    });
  }

  // 6. Per-split top 20 + composition deltas
  console.log(`\n=== Top 20 by weight split ===\n`);
  const topByLabel: Record<string, Candidate[]> = {};
  for (const label of Object.keys(WEIGHT_SPLITS)) {
    const sorted = [...candidates].sort(
      (a, b) => b.finalByLabel[label] - a.finalByLabel[label],
    );
    const top = sorted.slice(0, 20);
    topByLabel[label] = top;

    console.log(`\n--- ${label} ---`);
    console.log(`${'#'.padStart(3)} | ${'Score'.padStart(6)} | ${'Taste'.padStart(6)} | ${'Recncy'.padStart(6)} | ${'Ctx'.padStart(5)} | ${'Pop'.padStart(7)} | ${'IMDb'.padStart(5)} | Title`);
    console.log('-'.repeat(110));
    top.forEach((c, i) => {
      const imdb = c.imdbRating != null ? c.imdbRating.toFixed(1) : ' N/A';
      console.log(
        `${String(i + 1).padStart(3)} | ${c.finalByLabel[label].toFixed(4)} | ${c.taste.toFixed(4)} | ${c.recency.toFixed(4)} | ${c.contextual.toFixed(3)} | ${String(c.popularity?.toFixed(1) ?? 'N/A').padStart(7)} | ${imdb.padStart(5)} | ${c.title} (${c.year ?? '?'}) [${c.mediaType}]`
      );
    });
  }

  // 7. Cross-split composition deltas: how many titles in baseline top 20
  //    survive in each candidate split's top 20?
  console.log(`\n\n=== Composition deltas vs Phase 4 baseline ===\n`);
  const baselineLabel = 'phase4-baseline (62.5/25/12.5)';
  const baselineTop20 = new Set(topByLabel[baselineLabel].map((c) => c.key));
  for (const label of Object.keys(WEIGHT_SPLITS)) {
    if (label === baselineLabel) continue;
    const candidateTop20 = new Set(topByLabel[label].map((c) => c.key));
    const overlap = [...baselineTop20].filter((k) => candidateTop20.has(k)).length;
    const movedIn = [...candidateTop20].filter((k) => !baselineTop20.has(k)).length;
    const movedOut = 20 - overlap;
    console.log(
      `${label}: ${overlap}/20 overlap with baseline, +${movedIn} new, -${movedOut} dropped`
    );
  }

  // 8. Contextual signal range (sanity check)
  const ctxScores = candidates.map((c) => c.contextual);
  const ctxMin = Math.min(...ctxScores);
  const ctxMax = Math.max(...ctxScores);
  const ctxAvg = ctxScores.reduce((a, b) => a + b, 0) / ctxScores.length;
  console.log(`\nContextual score distribution: min=${ctxMin.toFixed(3)} avg=${ctxAvg.toFixed(3)} max=${ctxMax.toFixed(3)}`);
  console.log(`(All-0.5 average = contextual signal not differentiating; widening = signal active.)`);

  console.log(`\n=== Evaluation complete. Pick the split with the most defensible composition delta and update BASE_WEIGHTS. ===\n`);
}

main().catch(console.error);
