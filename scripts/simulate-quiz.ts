/**
 * Quiz Selection Simulator
 *
 * Models the proposed onboarding watched-grid logic:
 *   - 72-title pool (36 movies + 36 TV) ordered by vote_count
 *   - Tier 1 anchors (top of pool, deterministic)
 *   - Tier 2 variable (weighted-sampled from remainder)
 *
 * Variants tested:
 *   A: genres after quiz, 12 anchors
 *   B: genres before quiz, 9 anchors
 *   C: genres before quiz, 12 anchors
 *   D: genres after quiz, 9 anchors
 *
 * Usage:
 *   npx tsx scripts/simulate-quiz.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env ────────────────────────────────────────────
function loadEnv(): Record<string, string> {
  const content = readFileSync(resolve(__dirname, '..', '.env'), 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}
const ENV = loadEnv();
const supabase = createClient(ENV.VITE_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

// ── Types ──────────────────────────────────────────
interface Title {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  release_year: number | null;
  popularity: number;
  vote_count: number;
}

interface ScoredTitle extends Title {
  score: number;
  ageBoost: number;
  serviceBoost: number;
  clusterBoost: number;
}

interface Persona {
  id: string;
  label: string;
  ageRange: string; // 'Under 18' | '18-24' | '25-34' | '35-44' | '45-54' | '55+'
  viewingContext: string; // 'solo' | 'partner' | 'family' | 'mix'
  services: string[];
  clusters: string[]; // for variants B/C
}

interface Variant {
  id: 'A' | 'B' | 'C' | 'D' | 'E';
  label: string;
  anchors: number; // 6, 9, or 12
  useClusters: boolean;
}

// ── Constants ──────────────────────────────────────
const CURRENT_YEAR = 2026;

const AGE_MIDPOINT: Record<string, number> = {
  'Under 18': 16, '18-24': 21, '25-34': 30,
  '35-44': 40, '45-54': 50, '55+': 60,
};

const PERSONAS: Persona[] = [
  {
    id: 'P1', label: '22yo · Solo · Netflix+Prime',
    ageRange: '18-24', viewingContext: 'solo',
    services: ['netflix', 'prime'],
    clusters: ['action-adrenaline', 'dark-thrillers', 'mind-bending-mysteries'],
  },
  {
    id: 'P2', label: '35yo · Partner · 4 services',
    ageRange: '35-44', viewingContext: 'partner',
    services: ['netflix', 'disney', 'bbc', 'channel4'],
    clusters: ['heartfelt-drama', 'prestige-award-winners', 'history-war'],
  },
  {
    id: 'P3', label: '55yo · Mix · UK heavy',
    ageRange: '55+', viewingContext: 'mix',
    services: ['netflix', 'bbc', 'itvx'],
    clusters: ['true-crime-real-stories', 'prestige-award-winners', 'history-war'],
  },
  {
    id: 'P4', label: '28yo · Family · Disney+Netflix',
    ageRange: '25-34', viewingContext: 'family',
    services: ['disney', 'netflix'],
    clusters: ['family-kids', 'anime-animation', 'feel-good-funny'],
  },
  {
    id: 'P5', label: '18yo · Solo · Netflix only',
    ageRange: 'Under 18', viewingContext: 'solo',
    services: ['netflix'],
    clusters: ['horror-supernatural', 'action-adrenaline', 'anime-animation'],
  },
  {
    id: 'P6', label: 'No optional data · Netflix+iPlayer',
    ageRange: '', viewingContext: '',
    services: ['netflix', 'bbc'],
    // For variants B/C, assume this user picks 3 reasonable clusters.
    // For A/D, clusters are ignored regardless.
    clusters: ['heartfelt-drama', 'mind-bending-mysteries', 'feel-good-funny'],
  },
];

const VARIANTS: Variant[] = [
  { id: 'A', label: 'Genres after, 12 anchors', anchors: 12, useClusters: false },
  { id: 'B', label: 'Genres before, 9 anchors', anchors: 9, useClusters: true },
  { id: 'C', label: 'Genres before, 12 anchors', anchors: 12, useClusters: true },
  { id: 'D', label: 'Genres after, 9 anchors', anchors: 9, useClusters: false },
  { id: 'E', label: 'Genres after, 6 anchors', anchors: 6, useClusters: false },
];

// Cluster representative TMDb IDs (from src/lib/taste-v2/tasteClusters.ts)
const CLUSTER_REPS: Record<string, number[]> = {
  'feel-good-funny': [18785, 8363, 10625, 55721],
  'action-adrenaline': [562, 680, 857],
  'dark-thrillers': [807, 210577, 146233, 273481],
  'rom-coms-love-stories': [11036, 455207, 4348, 13],
  'epic-scifi-fantasy': [157336, 335984, 329865],
  'horror-supernatural': [419430, 447332, 126889],
  'mind-bending-mysteries': [27205, 11324, 1124, 77],
  'heartfelt-drama': [278, 238, 13],
  'true-crime-real-stories': [1430, 64439],
  'anime-animation': [324857, 129, 862, 150540],
  'prestige-award-winners': [581734, 278],
  'history-war': [857, 374720, 16869],
  'reality-entertainment': [37678],
  'cult-indie': [550, 680],
  'family-kids': [12, 8587, 277834, 862],
  'westerns-frontier': [429, 68718, 281957, 6977],
};

// Weight strengths
const WEIGHTS = {
  ageMax: 0.4,
  serviceMax: 0.2,
  clusterMax: 0.5,
  noiseMax: 0.2,
};

// ── Data fetch ─────────────────────────────────────
async function fetchPool(): Promise<{ movies: Title[]; tvShows: Title[] }> {
  const [movieRes, tvRes] = await Promise.all([
    supabase.from('titles').select('tmdb_id, media_type, title, release_year, popularity, vote_count')
      .eq('media_type', 'movie').gte('vote_count', 5000)
      .not('poster_path', 'is', null).not('embedding', 'is', null)
      .order('vote_count', { ascending: false }).limit(36),
    supabase.from('titles').select('tmdb_id, media_type, title, release_year, popularity, vote_count')
      .eq('media_type', 'tv').gte('vote_count', 1500).gte('popularity', 20)
      .not('poster_path', 'is', null).not('embedding', 'is', null)
      .order('vote_count', { ascending: false }).limit(36),
  ]);
  if (movieRes.error) throw movieRes.error;
  if (tvRes.error) throw tvRes.error;
  return { movies: movieRes.data as Title[], tvShows: tvRes.data as Title[] };
}

/**
 * Recency tier — last 24 months, high popularity, decent votes.
 * Captures zeitgeist titles (Severance, House of the Dragon, recent Best Pic winners)
 * that don't yet have enough votes to clear the canon thresholds.
 */
async function fetchRecencyPool(): Promise<{ movies: Title[]; tvShows: Title[] }> {
  const minYear = CURRENT_YEAR - 2;
  const [movieRes, tvRes] = await Promise.all([
    supabase.from('titles').select('tmdb_id, media_type, title, release_year, popularity, vote_count')
      .eq('media_type', 'movie').gte('release_year', minYear)
      .gte('popularity', 80).gte('vote_count', 500)
      .not('poster_path', 'is', null).not('embedding', 'is', null)
      .order('popularity', { ascending: false }).limit(12),
    supabase.from('titles').select('tmdb_id, media_type, title, release_year, popularity, vote_count')
      .eq('media_type', 'tv').gte('release_year', minYear)
      .gte('popularity', 80).gte('vote_count', 500)
      .not('poster_path', 'is', null).not('embedding', 'is', null)
      .order('popularity', { ascending: false }).limit(12),
  ]);
  if (movieRes.error) throw movieRes.error;
  if (tvRes.error) throw tvRes.error;
  return { movies: movieRes.data as Title[], tvShows: tvRes.data as Title[] };
}

/**
 * For each cluster: compute average cosine similarity from each pool title to
 * the cluster's representative titles, using pgvector via SQL.
 * Returns map: tmdb_id → cluster_id → similarity (0..1).
 */
async function computeClusterSimilarity(
  poolIds: number[],
): Promise<Map<number, Map<string, number>>> {
  const result = new Map<number, Map<string, number>>();
  for (const id of poolIds) result.set(id, new Map());

  for (const [clusterId, repIds] of Object.entries(CLUSTER_REPS)) {
    if (repIds.length === 0) continue;
    // For each pool title, get avg cosine similarity (1 - cosine_distance) to rep titles
    const { data, error } = await supabase.rpc('compute_cluster_sim' as any, {
      pool_ids: poolIds,
      rep_ids: repIds,
    } as any);
    if (error || !data) {
      // Fallback: query directly
      const sql = `
        WITH reps AS (SELECT embedding FROM titles WHERE tmdb_id = ANY($1::int[]) AND embedding IS NOT NULL)
        SELECT t.tmdb_id, AVG(1 - (t.embedding <=> r.embedding))::float8 AS sim
        FROM titles t, reps r
        WHERE t.tmdb_id = ANY($2::int[]) AND t.embedding IS NOT NULL
        GROUP BY t.tmdb_id`;
      // Use raw query via sql_query if available; otherwise skip
      // We'll use a direct approach via execute_sql_via_pg if needed
      throw new Error(`compute_cluster_sim RPC not available — need to add it`);
    }
    for (const row of data as { tmdb_id: number; sim: number }[]) {
      result.get(row.tmdb_id)?.set(clusterId, row.sim);
    }
  }
  return result;
}

// ── Scoring ────────────────────────────────────────
function ageCohortBoost(releaseYear: number | null, ageRange: string): number {
  if (!releaseYear) return 0;
  const age = AGE_MIDPOINT[ageRange];
  if (!age) return 0;
  // Prime years = 13–25 (adolescence + early adulthood — strongest cultural imprint)
  const primeStart = CURRENT_YEAR - age + 13;
  const primeEnd = CURRENT_YEAR - age + 25;
  if (releaseYear >= primeStart && releaseYear <= primeEnd) return WEIGHTS.ageMax;
  // Within 5 years either side: half boost
  if (releaseYear >= primeStart - 5 && releaseYear <= primeEnd + 5) return WEIGHTS.ageMax * 0.5;
  // Older "canon" titles (20+ years before user born): slight boost (universal classics)
  if (releaseYear < primeStart - 5 && releaseYear >= primeStart - 30) return WEIGHTS.ageMax * 0.15;
  return 0;
}

function serviceBoost(_tmdbId: number, _availSet: Set<number>): number {
  // Stub — real implementation queries get_available_tmdb_ids per persona
  // For simulation, randomly say 60% of titles available on a given service mix
  return 0;
}

function clusterBoost(
  tmdbId: number,
  selectedClusters: string[],
  simMap: Map<number, Map<string, number>>,
): number {
  const sims = simMap.get(tmdbId);
  if (!sims) return 0;
  let maxSim = 0;
  for (const c of selectedClusters) {
    const s = sims.get(c) ?? 0;
    if (s > maxSim) maxSim = s;
  }
  // Cosine sim is roughly 0.7-0.9 for related, 0.5-0.7 unrelated; rescale
  const rescaled = Math.max(0, (maxSim - 0.6) / 0.3); // 0.6 → 0, 0.9 → 1
  return Math.min(1, rescaled) * WEIGHTS.clusterMax;
}

function scoreTitle(
  t: Title,
  persona: Persona,
  variant: Variant,
  availSet: Set<number>,
  simMap: Map<number, Map<string, number>>,
  rng: () => number,
): ScoredTitle {
  const ageBoost = ageCohortBoost(t.release_year, persona.ageRange);
  const sBoost = availSet.has(t.tmdb_id) ? WEIGHTS.serviceMax : 0;
  const cBoost = variant.useClusters ? clusterBoost(t.tmdb_id, persona.clusters, simMap) : 0;
  const noise = rng() * WEIGHTS.noiseMax;
  return {
    ...t,
    ageBoost, serviceBoost: sBoost, clusterBoost: cBoost,
    score: ageBoost + sBoost + cBoost + noise,
  };
}

// ── Selection ──────────────────────────────────────
function selectGrid(
  movies: Title[],
  tvShows: Title[],
  recencyMovies: Title[],
  recencyTV: Title[],
  persona: Persona,
  variant: Variant,
  availSet: Set<number>,
  simMap: Map<number, Map<string, number>>,
  seed: number,
): Title[] {
  // Simple seeded RNG (mulberry32)
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const anchorsPerSide = variant.anchors / 2;
  const movieAnchors = movies.slice(0, anchorsPerSide);
  const tvAnchors = tvShows.slice(0, anchorsPerSide);
  // Tier 2 candidates: remainder of canonical pool + recency pool
  // (recency titles never become anchors — recognition gate uses canon only)
  const anchorIds = new Set([...movieAnchors, ...tvAnchors].map(t => t.tmdb_id));
  const movieTier2 = [...movies.slice(anchorsPerSide), ...recencyMovies]
    .filter(t => !anchorIds.has(t.tmdb_id));
  const tvTier2 = [...tvShows.slice(anchorsPerSide), ...recencyTV]
    .filter(t => !anchorIds.has(t.tmdb_id));

  // 18 total titles: 9 movie + 9 TV. Anchors are deterministic; rest sampled by score.
  const movieVarSlots = 9 - movieAnchors.length;
  const tvVarSlots = 9 - tvAnchors.length;

  const scoredMovies = movieTier2.map(t => scoreTitle(t, persona, variant, availSet, simMap, rng));
  const scoredTV = tvTier2.map(t => scoreTitle(t, persona, variant, availSet, simMap, rng));
  scoredMovies.sort((a, b) => b.score - a.score);
  scoredTV.sort((a, b) => b.score - a.score);

  const movieVariable = scoredMovies.slice(0, movieVarSlots);
  const tvVariable = scoredTV.slice(0, tvVarSlots);

  // Combine: anchors first (top of vote_count), then variable
  const finalMovies = [...movieAnchors, ...movieVariable];
  const finalTV = [...tvAnchors, ...tvVariable];

  // Interleave
  const out: Title[] = [];
  for (let i = 0; i < 9; i++) {
    out.push(finalMovies[i]);
    out.push(finalTV[i]);
  }
  return out;
}

// ── Output formatting ──────────────────────────────
function fmtTitle(t: Title): string {
  const tag = t.media_type === 'movie' ? 'M' : 'T';
  return `${tag} ${t.title} (${t.release_year ?? '?'})`;
}

function printGrid(titles: Title[]) {
  for (let r = 0; r < 3; r++) {
    const round = titles.slice(r * 6, (r + 1) * 6);
    console.log(`  Round ${r + 1}: ${round.map(fmtTitle).join(' | ')}`);
  }
}

// ── Stability check ────────────────────────────────
function runStabilityCheck(
  movies: Title[], tvShows: Title[],
  recencyMovies: Title[], recencyTV: Title[],
  variant: Variant,
  availMap: Map<string, Set<number>>,
  simMap: Map<number, Map<string, number>>,
  N: number,
) {
  console.log(`\n━━━ Stability check: Variant ${variant.id} (${variant.label}), N=${N} seeds ━━━`);
  for (const persona of PERSONAS) {
    const titleCount = new Map<number, { title: Title; count: number }>();
    for (let s = 0; s < N; s++) {
      const grid = selectGrid(
        movies, tvShows, recencyMovies, recencyTV,
        persona, variant,
        availMap.get(persona.id) ?? new Set(),
        simMap, s * 1000 + 7,
      );
      for (const t of grid) {
        const e = titleCount.get(t.tmdb_id);
        if (e) e.count++;
        else titleCount.set(t.tmdb_id, { title: t, count: 1 });
      }
    }
    const totalSlots = N * 18;
    const sorted = Array.from(titleCount.values()).sort((a, b) => b.count - a.count);
    const stableCore = sorted.filter(t => t.count >= N * 0.95).length; // appears ≥95% of the time
    const variableMid = sorted.filter(t => t.count >= N * 0.2 && t.count < N * 0.95).length;
    const tailRare = sorted.filter(t => t.count < N * 0.2).length;
    console.log(`\n[${persona.id}] ${persona.label}`);
    console.log(`  Unique titles seen: ${sorted.length} (max possible: ${movies.length + tvShows.length + recencyMovies.length + recencyTV.length})`);
    console.log(`  Stable core (≥95% of sessions): ${stableCore}`);
    console.log(`  Variable mid (20–95%): ${variableMid}`);
    console.log(`  Rare tail (<20%): ${tailRare}`);
    // Show top 5 most frequent + bottom 5 (rare) to inspect
    const topFreq = sorted.slice(0, 5).map(e => `${e.title.title} ${(e.count / N * 100).toFixed(0)}%`);
    const rareFreq = sorted.slice(-5).reverse().map(e => `${e.title.title} ${(e.count / N * 100).toFixed(0)}%`);
    console.log(`  Most frequent: ${topFreq.join(', ')}`);
    console.log(`  Least frequent: ${rareFreq.join(', ')}`);
    void totalSlots;
  }
}

// ── Main ───────────────────────────────────────────
async function main() {
  console.log('Fetching 72-title canonical pool…');
  const { movies, tvShows } = await fetchPool();
  console.log(`  Movies: ${movies.length}, TV: ${tvShows.length}`);

  console.log('Fetching recency pool (last 24mo, pop≥80, votes≥500)…');
  const { movies: recencyMovies, tvShows: recencyTV } = await fetchRecencyPool();
  console.log(`  Recency Movies: ${recencyMovies.length}, Recency TV: ${recencyTV.length}`);
  console.log(`  Recency titles: ${[...recencyMovies, ...recencyTV].map(t => `${t.title} (${t.release_year})`).join(', ')}`);

  const allIds = [
    ...movies.map(m => m.tmdb_id), ...tvShows.map(t => t.tmdb_id),
    ...recencyMovies.map(m => m.tmdb_id), ...recencyTV.map(t => t.tmdb_id),
  ];

  console.log('\nComputing cluster similarities via pgvector…');
  const simMap = await computeClusterSimilarityViaSQL(allIds);

  console.log('Fetching availability per persona…');
  const availMap = new Map<string, Set<number>>();
  for (const p of PERSONAS) {
    const { data } = await supabase.rpc('get_available_tmdb_ids', { service_ids: p.services });
    availMap.set(p.id, new Set<number>(Array.isArray(data) ? (data as number[]) : []));
  }

  // Phase 1: Single-seed comparison across all variants
  console.log('\n========================================');
  console.log('Phase 1: Single-seed grids — all variants');
  console.log('========================================');

  for (const variant of VARIANTS) {
    console.log(`\n━━━ Variant ${variant.id}: ${variant.label} ━━━`);
    for (const persona of PERSONAS) {
      console.log(`\n[${persona.id}] ${persona.label}`);
      console.log(`  Clusters: ${variant.useClusters ? persona.clusters.join(', ') : '(not selected yet)'}`);
      const grid = selectGrid(
        movies, tvShows, recencyMovies, recencyTV,
        persona, variant,
        availMap.get(persona.id) ?? new Set(),
        simMap, 42,
      );
      printGrid(grid);
    }
  }

  // Phase 2: N=20 stability for variants D and E (the contenders)
  console.log('\n\n========================================');
  console.log('Phase 2: Stability check (N=20 seeds)');
  console.log('========================================');
  for (const v of VARIANTS.filter(v => v.id === 'D' || v.id === 'E')) {
    runStabilityCheck(movies, tvShows, recencyMovies, recencyTV, v, availMap, simMap, 20);
  }
}

/**
 * Compute cluster similarity using pgvector cosine similarity.
 * For each cluster, average similarity from each pool title to all rep titles.
 */
async function computeClusterSimilarityViaSQL(
  poolIds: number[],
): Promise<Map<number, Map<string, number>>> {
  const result = new Map<number, Map<string, number>>();
  for (const id of poolIds) result.set(id, new Map());

  for (const [clusterId, repIds] of Object.entries(CLUSTER_REPS)) {
    if (repIds.length === 0) continue;
    // Direct SQL via Postgres connection isn't available here.
    // We use the Supabase REST API: build a temp join query.
    // Alternative: fetch all embeddings client-side and compute in JS. With 72 + ~50 reps and 1536 dims, this is ~190KB transferred and trivial CPU. We'll do that.
    // [implementation moved to fetchAllEmbeddingsAndCompute below]
    break;
  }
  // Bulk approach: fetch all embeddings at once, compute in JS
  const allRepIds = Array.from(new Set(Object.values(CLUSTER_REPS).flat()));
  const allIds = Array.from(new Set([...poolIds, ...allRepIds]));

  const { data, error } = await supabase
    .from('titles')
    .select('tmdb_id, embedding')
    .in('tmdb_id', allIds);
  if (error || !data) throw error ?? new Error('no embeddings');

  const embMap = new Map<number, number[]>();
  for (const row of data as { tmdb_id: number; embedding: number[] | string }[]) {
    let emb: number[];
    if (typeof row.embedding === 'string') {
      // pgvector serializes as "[0.1,0.2,...]"
      emb = JSON.parse(row.embedding);
    } else {
      emb = row.embedding as number[];
    }
    embMap.set(row.tmdb_id, emb);
  }

  // Cosine similarity helper
  const cosSim = (a: number[], b: number[]): number => {
    let dot = 0, aMag = 0, bMag = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; aMag += a[i] * a[i]; bMag += b[i] * b[i];
    }
    return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
  };

  for (const [clusterId, repIds] of Object.entries(CLUSTER_REPS)) {
    const repEmbs = repIds.map(id => embMap.get(id)).filter(Boolean) as number[][];
    if (repEmbs.length === 0) continue;
    for (const pid of poolIds) {
      const pe = embMap.get(pid);
      if (!pe) continue;
      let sum = 0;
      for (const re of repEmbs) sum += cosSim(pe, re);
      result.get(pid)!.set(clusterId, sum / repEmbs.length);
    }
  }
  return result;
}

main().catch(err => { console.error(err); process.exit(1); });
