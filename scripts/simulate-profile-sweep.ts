/**
 * Profile Quality — Comprehensive Sweep
 *
 * Tests bootstrap weight configurations × cluster representative configurations
 * to find the (weights, reps) combo that maximises taste-profile quality.
 *
 * Quality metrics:
 *   CAF — Cluster-Alignment Fidelity  = avg(declared cluster sims) / avg(all cluster sims)
 *         > 1.20 = profile clearly biases toward declared clusters
 *   PD  — Persona-Distinctness        = avg pairwise cosine distance between persona profiles
 *         > 0.05 = profiles meaningfully differ across personas
 *   TRC — Top-15 Rec Cluster-coverage = % of top-15 recs with cosine sim ≥ 0.65 to any declared cluster
 *         > 50% = recommendations align with declared preferences
 *
 * Usage:
 *   npx tsx scripts/simulate-profile-sweep.ts > scripts/sweep-output.txt
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ── Env / client ───────────────────────────────────
function loadEnv(): Record<string, string> {
  const c = readFileSync(resolve(__dirname, '..', '.env'), 'utf-8');
  const e: Record<string, string> = {};
  for (const line of c.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    e[t.slice(0, i)] = t.slice(i + 1);
  }
  return e;
}
const ENV = loadEnv();
const supabase = createClient(ENV.VITE_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

// ── Constants ──────────────────────────────────────
const CURRENT_YEAR = 2026;
const AGE_MIDPOINT: Record<string, number> = {
  'Under 18': 16, '18-24': 21, '25-34': 30, '35-44': 40, '45-54': 50, '55+': 60,
};

interface Title {
  tmdb_id: number; media_type: 'movie' | 'tv';
  title: string; release_year: number | null;
  popularity: number; vote_count: number;
}

interface Persona {
  id: string; label: string;
  ageRange: string; viewingContext: string;
  services: string[]; clusters: string[];
}

const PERSONAS: Persona[] = [
  { id: 'P1', label: '22yo Solo Netflix+Prime', ageRange: '18-24', viewingContext: 'solo',
    services: ['netflix', 'prime'],
    clusters: ['action-adrenaline', 'dark-thrillers', 'mind-bending-mysteries'] },
  { id: 'P2', label: '35yo Partner 4 services', ageRange: '35-44', viewingContext: 'partner',
    services: ['netflix', 'disney', 'bbc', 'channel4'],
    clusters: ['heartfelt-drama', 'prestige-award-winners', 'history-war'] },
  { id: 'P3', label: '55yo Mix UK heavy', ageRange: '55+', viewingContext: 'mix',
    services: ['netflix', 'bbc', 'itvx'],
    clusters: ['true-crime-real-stories', 'prestige-award-winners', 'history-war'] },
  { id: 'P4', label: '28yo Family Disney+Netflix', ageRange: '25-34', viewingContext: 'family',
    services: ['disney', 'netflix'],
    clusters: ['family-kids', 'anime-animation', 'feel-good-funny'] },
  { id: 'P5', label: '18yo Solo Netflix only', ageRange: 'Under 18', viewingContext: 'solo',
    services: ['netflix'],
    clusters: ['horror-supernatural', 'action-adrenaline', 'anime-animation'] },
  { id: 'P6', label: 'No optional data', ageRange: '', viewingContext: '',
    services: ['netflix', 'bbc'],
    clusters: ['heartfelt-drama', 'mind-bending-mysteries', 'feel-good-funny'] },
];

// ── Cluster representative configs ─────────────────
// C1: current (some overlap, Sicario removed since missing from DB)
const REPS_C1: Record<string, number[]> = {
  'feel-good-funny': [18785, 8363, 10625, 55721],
  'action-adrenaline': [562, 680, 857],
  'dark-thrillers': [807, 210577, 146233],
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

// C2: deduped (each title in one cluster only)
const REPS_C2: Record<string, number[]> = {
  'feel-good-funny': [18785, 8363, 10625, 55721],
  'action-adrenaline': [562], // Pulp Fiction → cult-indie; SPR → history-war
  'dark-thrillers': [807, 210577, 146233],
  'rom-coms-love-stories': [11036, 455207, 4348], // Forrest Gump → heartfelt only
  'epic-scifi-fantasy': [157336, 335984, 329865],
  'horror-supernatural': [419430, 447332, 126889],
  'mind-bending-mysteries': [27205, 11324, 1124, 77],
  'heartfelt-drama': [278, 238, 13], // Shawshank stays here, drop from prestige
  'true-crime-real-stories': [1430, 64439],
  'anime-animation': [324857, 129, 150540], // Toy Story → family-kids only
  'prestige-award-winners': [581734], // Shawshank → heartfelt only
  'history-war': [857, 374720, 16869],
  'reality-entertainment': [37678],
  'cult-indie': [550, 680],
  'family-kids': [12, 8587, 277834, 862],
  'westerns-frontier': [429, 68718, 281957, 6977],
};

// C3: curated diverse (more reps, hand-picked for genre orthogonality)
const REPS_C3: Record<string, number[]> = {
  'feel-good-funny': [18785, 8363, 10625, 55721, 9377, 9522, 61662, 48891], // +Ferris, Wedding Crashers, Schitt's Creek, B99
  'action-adrenaline': [562, 353081, 49047], // Die Hard, MI Fallout, Gravity
  'dark-thrillers': [807, 210577, 146233, 67744], // +MINDHUNTER
  'rom-coms-love-stories': [11036, 455207, 4348, 19913, 122906, 313369, 1581, 38], // +500 Days, About Time, La La Land, The Holiday, Eternal Sunshine
  'epic-scifi-fantasy': [157336, 335984, 329865, 49047], // +Gravity
  'horror-supernatural': [419430, 447332, 126889], // (best available)
  'mind-bending-mysteries': [27205, 11324, 1124, 77, 95396], // +Severance
  'heartfelt-drama': [334541, 492188, 153, 1402, 76331, 136315, 13], // Manchester, Marriage Story, Lost in Translation, Pursuit, Succession, The Bear, Forrest Gump
  'true-crime-real-stories': [1430, 64439, 67744, 87108], // +MINDHUNTER, Chernobyl
  'anime-animation': [324857, 129, 150540, 128, 4935, 508883, 508943], // +Princess Mononoke, Howl's, Boy and Heron, Luca
  'prestige-award-winners': [581734, 278, 426426, 398818, 399055, 65494, 68734], // Nomadland, Shawshank, Roma, CMBYN, Shape of Water, Crown, Argo
  'history-war': [857, 374720, 16869, 33907, 91239], // +Downton Abbey TV, Bridgerton
  'reality-entertainment': [37678], // (best available — 1 rep is very weak)
  'cult-indie': [550, 680, 38, 120467], // FC, PF, Eternal Sunshine, Grand Budapest
  'family-kids': [12, 8587, 277834, 14160, 2062, 109445, 9806, 10193, 862], // +Up, Ratatouille, Frozen, Incredibles, Toy Story 3
  'westerns-frontier': [429, 68718, 281957, 6977, 966], // +Magnificent Seven 1960
};

// ── Bootstrap weight configs ───────────────────────
// Each row: [service, watched, genre] when watched ∈ [5..12]
// Other tap-count tiers proportionally adjusted.
interface WeightConfig {
  id: string; label: string;
  // For each tap regime
  w: { service: number; watched: number; genre: number };
}

// Apply same shape to all tap regimes — just different cluster emphasis
function makeWeights(cluster: number, label: string): WeightConfig {
  // remaining = 1 - cluster, split watched:service = 65:35
  const rem = 1 - cluster;
  const watched = rem * 0.65;
  const service = rem * 0.35;
  return { id: label, label, w: { service, watched, genre: cluster } };
}

const WEIGHT_CONFIGS: WeightConfig[] = [
  makeWeights(0.15, 'W1_baseline'),     // current
  makeWeights(0.25, 'W2_modest'),
  makeWeights(0.35, 'W3_strong'),
  makeWeights(0.50, 'W4_aggressive'),
  makeWeights(0.65, 'W5_cluster_dominant'),
  makeWeights(0.75, 'W6_extreme'),
  makeWeights(0.85, 'W7_almost_pure'),
];

const REP_CONFIGS = [
  { id: 'C1_current', reps: REPS_C1 },
  { id: 'C2_deduped', reps: REPS_C2 },
  { id: 'C3_curated', reps: REPS_C3 },
];

const TRIALS = 10;
const ANCHORS = 8; // variant D

// ── Vector ops ─────────────────────────────────────
function centroid(vs: number[][]): number[] {
  if (vs.length === 0) return [];
  const dim = vs[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vs) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vs.length;
  return out;
}
function weightedSum(vs: number[][], ws: number[]): number[] {
  const dim = vs[0].length;
  const out = new Array(dim).fill(0);
  for (let j = 0; j < vs.length; j++) {
    const w = ws[j], v = vs[j];
    for (let i = 0; i < dim; i++) out[i] += w * v[i];
  }
  return out;
}
function l2Normalise(v: number[]): number[] {
  let m = 0; for (const x of v) m += x * x; m = Math.sqrt(m);
  return m === 0 ? v.slice() : v.map(x => x / m);
}
function cosSim(a: number[], b: number[]): number {
  let d = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const n = Math.sqrt(ma) * Math.sqrt(mb);
  return n === 0 ? 0 : d / n;
}
function parseEmb(raw: any): number[] | null {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return raw as number[];
}

// ── RNG (mulberry32) ──────────────────────────────
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Data loading (cached) ──────────────────────────
async function fetchPool(): Promise<{ movies: Title[]; tvShows: Title[] }> {
  const [m, t] = await Promise.all([
    supabase.from('titles').select('tmdb_id, media_type, title, release_year, popularity, vote_count')
      .eq('media_type', 'movie').gte('vote_count', 5000)
      .not('poster_path', 'is', null).not('embedding', 'is', null)
      .order('vote_count', { ascending: false }).limit(36),
    supabase.from('titles').select('tmdb_id, media_type, title, release_year, popularity, vote_count')
      .eq('media_type', 'tv').gte('vote_count', 1500).gte('popularity', 20)
      .not('poster_path', 'is', null).not('embedding', 'is', null)
      .order('vote_count', { ascending: false }).limit(36),
  ]);
  return { movies: m.data as Title[], tvShows: t.data as Title[] };
}

async function fetchEmbeddingsBulk(tmdbIds: number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (tmdbIds.length === 0) return out;
  // Chunk to avoid URL/payload limits
  const chunkSize = 200;
  for (let i = 0; i < tmdbIds.length; i += chunkSize) {
    const chunk = tmdbIds.slice(i, i + chunkSize);
    const { data } = await supabase.from('titles').select('tmdb_id, embedding').in('tmdb_id', chunk);
    for (const row of (data ?? []) as any[]) {
      const e = parseEmb(row.embedding);
      if (e) out.set(row.tmdb_id, e);
    }
  }
  return out;
}

async function fetchServiceCentroids(svcIds: string[]): Promise<number[][]> {
  if (svcIds.length === 0) return [];
  const { data } = await supabase.from('service_fingerprints').select('service_id, centroid')
    .in('service_id', svcIds).eq('variant', 'v1_popularity').eq('region', 'GB');
  const out: number[][] = [];
  for (const row of (data ?? []) as any[]) {
    const e = parseEmb(row.centroid); if (e) out.push(e);
  }
  return out;
}

// ── Grid selection (variant D, 8 anchors) ──────────
function selectGrid(movies: Title[], tvShows: Title[], persona: Persona,
  availSet: Set<number>, simMap: Map<number, Map<string, number>>, seed: number): Title[] {
  const rng = makeRng(seed);
  const aps = Math.floor(ANCHORS / 2);
  const movieAnchors = movies.slice(0, aps);
  const tvAnchors = tvShows.slice(0, aps);
  const movieT2 = movies.slice(aps);
  const tvT2 = tvShows.slice(aps);
  const score = (t: Title) => {
    const ab = ageCohortBoost(t.release_year, persona.ageRange);
    const sb = availSet.has(t.tmdb_id) ? 0.2 : 0;
    return ab + sb + rng() * 0.4;
  };
  const sm = movieT2.map(t => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  const stv = tvT2.map(t => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  const finalM = [...movieAnchors, ...sm.slice(0, 9 - movieAnchors.length).map(x => x.t)];
  const finalT = [...tvAnchors, ...stv.slice(0, 9 - tvAnchors.length).map(x => x.t)];
  const out: Title[] = [];
  for (let i = 0; i < 9; i++) { out.push(finalM[i]); out.push(finalT[i]); }
  return out;
}

function ageCohortBoost(year: number | null, ageRange: string): number {
  if (!year) return 0;
  const age = AGE_MIDPOINT[ageRange]; if (!age) return 0;
  const ps = CURRENT_YEAR - age + 13, pe = CURRENT_YEAR - age + 25;
  if (year >= ps && year <= pe) return 0.4;
  if (year >= ps - 5 && year <= pe + 5) return 0.2;
  if (year < ps - 5 && year >= ps - 30) return 0.06;
  return 0;
}

// ── Tap probability model ──────────────────────────
function tapProbability(t: Title, persona: Persona,
  voteCountP: Map<number, number>, simMap: Map<number, Map<string, number>>,
  tapMultiplier = 1.0): number {
  const recognition = voteCountP.get(t.tmdb_id) ?? 0;
  const sims = simMap.get(t.tmdb_id);
  let clusterFit = 0;
  if (sims) {
    for (const c of persona.clusters) {
      const s = sims.get(c) ?? 0;
      const r = Math.max(0, Math.min(1, (s - 0.6) / 0.3));
      if (r > clusterFit) clusterFit = r;
    }
  }
  const ab = ageCohortBoost(t.release_year, persona.ageRange);
  const cohortFit = ab / 0.4;
  const p = (0.05 + 0.45 * recognition + 0.30 * clusterFit + 0.20 * cohortFit) * tapMultiplier;
  return Math.max(0, Math.min(0.85, p));
}

function sampleTaps(grid: Title[], persona: Persona,
  voteCountP: Map<number, number>, simMap: Map<number, Map<string, number>>,
  rng: () => number, tapMultiplier = 1.0): Title[] {
  const taps: Title[] = [];
  for (const t of grid) {
    if (rng() < tapProbability(t, persona, voteCountP, simMap, tapMultiplier)) taps.push(t);
  }
  return taps;
}

// ── Bootstrap ──────────────────────────────────────
function getBootstrapWeights(watchedCount: number, hasGenres: boolean, base: WeightConfig['w']) {
  // Scale base weights by tap count
  let s = base.service, w = base.watched, g = base.genre;
  if (watchedCount === 0) { s = 0.55; w = 0; g = 0.45; }
  else if (watchedCount <= 4) {
    // Less weight on watched when sparse
    const total = base.service + base.watched + base.genre;
    s = base.service / total * 0.6;
    w = base.watched / total * 0.4;
    g = base.genre / total * 0.6;
    const sum = s + w + g; s /= sum; w /= sum; g /= sum;
  } else if (watchedCount <= 12) {
    // Use base directly
    s = base.service; w = base.watched; g = base.genre;
  } else {
    // More weight on watched when dense
    const total = base.service + base.watched + base.genre;
    s = base.service / total * 0.6;
    w = base.watched / total * 1.3;
    g = base.genre / total * 0.7;
    const sum = s + w + g; s /= sum; w /= sum; g /= sum;
  }
  if (!hasGenres) { s += g; g = 0; }
  return { service: s, watched: w, genre: g };
}

function bootstrapProfile(
  serviceCentroids: number[][],
  watchedEmbeddings: number[][],
  clusterEmbeddings: number[][],
  weightCfg: WeightConfig,
): number[] | null {
  const sV = serviceCentroids.length > 0 ? centroid(serviceCentroids) : null;
  const wV = watchedEmbeddings.length > 0 ? centroid(watchedEmbeddings) : null;
  const gV = clusterEmbeddings.length > 0 ? centroid(clusterEmbeddings) : null;
  if (!sV && !wV && !gV) return null;
  const ws = getBootstrapWeights(watchedEmbeddings.length, clusterEmbeddings.length > 0, weightCfg.w);
  const vs: number[][] = [], ww: number[] = [];
  if (sV && ws.service > 0) { vs.push(sV); ww.push(ws.service); }
  if (wV && ws.watched > 0) { vs.push(wV); ww.push(ws.watched); }
  if (gV && ws.genre > 0) { vs.push(gV); ww.push(ws.genre); }
  if (vs.length === 0) return null;
  return l2Normalise(weightedSum(vs, ww));
}

// ── Recommendations ────────────────────────────────
async function topRecs(profile: number[], limit: number): Promise<{ title: string; year: number; media_type: string; sim: number; tmdb_id: number }[]> {
  const { data, error } = await supabase.rpc('match_titles_by_vector' as any, {
    query_vector: profile, match_limit: limit,
  } as any);
  if (error || !data) return [];
  return (data as any[]).map(r => ({
    tmdb_id: r.tmdb_id,
    title: r.title ?? '?', year: r.release_year ?? 0,
    media_type: r.media_type, sim: r.similarity ?? r.score ?? 0,
  }));
}

// ── Main ───────────────────────────────────────────
async function main() {
  console.error('Loading pool…');
  const { movies, tvShows } = await fetchPool();
  const allPoolIds = [...movies.map(m => m.tmdb_id), ...tvShows.map(t => t.tmdb_id)];

  // Pre-fetch ALL embeddings we'll need:
  //   - pool titles (for taps + cluster sim)
  //   - all rep titles across all rep configs
  console.error('Loading embeddings (pool + all reps)…');
  const allRepIds = Array.from(new Set([
    ...Object.values(REPS_C1).flat(),
    ...Object.values(REPS_C2).flat(),
    ...Object.values(REPS_C3).flat(),
  ]));
  const allIds = Array.from(new Set([...allPoolIds, ...allRepIds]));
  const embMap = await fetchEmbeddingsBulk(allIds);
  console.error(`  Got ${embMap.size} embeddings`);

  // Pre-compute cluster centroids per rep config
  console.error('Computing cluster centroids per rep config…');
  const clusterCentroidsByRep = new Map<string, Map<string, number[]>>();
  for (const rc of REP_CONFIGS) {
    const cm = new Map<string, number[]>();
    for (const [cid, ids] of Object.entries(rc.reps)) {
      const embs = ids.map(i => embMap.get(i)).filter(Boolean) as number[][];
      if (embs.length > 0) cm.set(cid, l2Normalise(centroid(embs)));
    }
    clusterCentroidsByRep.set(rc.id, cm);
  }

  // Pre-compute pool→cluster similarities per rep config
  // (used for tap probability AND grid scoring)
  console.error('Computing pool→cluster similarities…');
  const simMapByRep = new Map<string, Map<number, Map<string, number>>>();
  for (const rc of REP_CONFIGS) {
    const simMap = new Map<number, Map<string, number>>();
    for (const pid of allPoolIds) {
      const pe = embMap.get(pid); if (!pe) continue;
      const m = new Map<string, number>();
      for (const [cid, ids] of Object.entries(rc.reps)) {
        const repEmbs = ids.map(i => embMap.get(i)).filter(Boolean) as number[][];
        if (repEmbs.length === 0) continue;
        let s = 0; for (const re of repEmbs) s += cosSim(pe, re);
        m.set(cid, s / repEmbs.length);
      }
      simMap.set(pid, m);
    }
    simMapByRep.set(rc.id, simMap);
  }

  // Pre-fetch service centroids per persona
  console.error('Fetching service centroids per persona…');
  const personaServiceCentroids = new Map<string, number[][]>();
  for (const p of PERSONAS) {
    personaServiceCentroids.set(p.id, await fetchServiceCentroids(p.services));
  }

  // Pre-fetch availability per persona (for grid scoring)
  console.error('Fetching availability per persona…');
  const availMap = new Map<string, Set<number>>();
  for (const p of PERSONAS) {
    const { data } = await supabase.rpc('get_available_tmdb_ids', { service_ids: p.services });
    availMap.set(p.id, new Set<number>(Array.isArray(data) ? (data as number[]) : []));
  }

  // Vote-count percentile (for tap recognition)
  const allVotes = [...movies, ...tvShows].map(t => t.vote_count).sort((a, b) => a - b);
  const voteCountP = new Map<number, number>();
  for (const t of [...movies, ...tvShows]) {
    voteCountP.set(t.tmdb_id, allVotes.indexOf(t.vote_count) / allVotes.length);
  }

  // ── Main sweep ───────────────────────────────────
  type CellResult = {
    weight: string; rep: string; persona: string;
    meanProfile: number[]; tapCount: number;
    clusterAlignment: Record<string, number>;
  };
  const allResults: CellResult[] = [];

  console.error(`\nRunning sweep: ${WEIGHT_CONFIGS.length}W × ${REP_CONFIGS.length}R × ${PERSONAS.length}P × ${TRIALS}T = ${WEIGHT_CONFIGS.length * REP_CONFIGS.length * PERSONAS.length * TRIALS} trials\n`);
  let cellsDone = 0;
  const totalCells = WEIGHT_CONFIGS.length * REP_CONFIGS.length * PERSONAS.length;

  for (const wc of WEIGHT_CONFIGS) {
    for (const rc of REP_CONFIGS) {
      const simMap = simMapByRep.get(rc.id)!;
      const clusterCentroids = clusterCentroidsByRep.get(rc.id)!;

      for (const persona of PERSONAS) {
        const profileVecs: number[][] = [];
        const tapCounts: number[] = [];

        for (let trial = 0; trial < TRIALS; trial++) {
          const seed = trial * 1000 + 7;
          const grid = selectGrid(movies, tvShows, persona,
            availMap.get(persona.id)!, simMap, seed);
          const tapRng = makeRng(seed * 13 + 1);
          const taps = sampleTaps(grid, persona, voteCountP, simMap, tapRng);
          // Build watched embeddings from tapped titles
          const watchedEmbs = taps.map(t => embMap.get(t.tmdb_id)).filter(Boolean) as number[][];
          // Build cluster embeddings from persona's selected clusters' reps
          const repIds = persona.clusters.flatMap(c => rc.reps[c] ?? []);
          const clusterEmbs = repIds.map(i => embMap.get(i)).filter(Boolean) as number[][];

          const profile = bootstrapProfile(
            personaServiceCentroids.get(persona.id) ?? [],
            watchedEmbs, clusterEmbs, wc,
          );
          if (profile) { profileVecs.push(profile); tapCounts.push(taps.length); }
        }
        if (profileVecs.length === 0) continue;

        const meanProfile = l2Normalise(centroid(profileVecs));
        const clusterAlignment: Record<string, number> = {};
        for (const [cid, cVec] of clusterCentroids) {
          clusterAlignment[cid] = cosSim(meanProfile, cVec);
        }
        allResults.push({
          weight: wc.id, rep: rc.id, persona: persona.id,
          meanProfile, tapCount: tapCounts.reduce((a, b) => a + b, 0) / tapCounts.length,
          clusterAlignment,
        });
        cellsDone++;
        if (cellsDone % 10 === 0) console.error(`  ${cellsDone}/${totalCells} cells done`);
      }
    }
  }

  // ── Aggregate metrics ────────────────────────────
  console.log('\n========================================');
  console.log('Sweep Results — Weight × Rep matrix');
  console.log('========================================\n');

  console.log('Metrics per (Weight, Rep) cell:');
  console.log('  CAF = cluster-alignment fidelity (declared/overall ratio)  — target >1.20');
  console.log('  PD  = persona-distinctness (avg pairwise distance)         — target >0.05');
  console.log('  Avg taps = mean taps per session\n');

  const summaryRows: { wid: string; rid: string; CAF: number; PD: number; avgTaps: number }[] = [];

  for (const wc of WEIGHT_CONFIGS) {
    for (const rc of REP_CONFIGS) {
      const cells = allResults.filter(r => r.weight === wc.id && r.rep === rc.id);
      if (cells.length === 0) continue;

      // CAF
      let cafSum = 0;
      for (const c of cells) {
        const persona = PERSONAS.find(p => p.id === c.persona)!;
        const declared = persona.clusters.reduce((s, cl) => s + (c.clusterAlignment[cl] ?? 0), 0) / persona.clusters.length;
        const all = Object.values(c.clusterAlignment);
        const overall = all.reduce((a, b) => a + b, 0) / all.length;
        cafSum += declared / overall;
      }
      const CAF = cafSum / cells.length;

      // PD
      let pdSum = 0, pairs = 0;
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          pdSum += 1 - cosSim(cells[i].meanProfile, cells[j].meanProfile);
          pairs++;
        }
      }
      const PD = pairs > 0 ? pdSum / pairs : 0;

      const avgTaps = cells.reduce((s, c) => s + c.tapCount, 0) / cells.length;
      summaryRows.push({ wid: wc.id, rid: rc.id, CAF, PD, avgTaps });
    }
  }

  // Print as table
  const header = `| ${'Weight'.padEnd(22)} | ${'Reps'.padEnd(12)} | ${'CAF'.padStart(7)} | ${'PD'.padStart(7)} | ${'AvgTaps'.padStart(7)} |`;
  console.log(header);
  console.log('|' + '-'.repeat(header.length - 2) + '|');
  for (const r of summaryRows) {
    console.log(`| ${r.wid.padEnd(22)} | ${r.rid.padEnd(12)} | ${r.CAF.toFixed(3).padStart(7)} | ${r.PD.toFixed(4).padStart(7)} | ${r.avgTaps.toFixed(1).padStart(7)} |`);
  }

  // Identify best by CAF, then PD
  const sorted = [...summaryRows].sort((a, b) => (b.CAF - a.CAF) || (b.PD - a.PD));
  console.log(`\nBest by CAF: ${sorted[0].wid} × ${sorted[0].rid} (CAF=${sorted[0].CAF.toFixed(3)}, PD=${sorted[0].PD.toFixed(4)})`);
  console.log(`Best by PD:  ${[...summaryRows].sort((a, b) => b.PD - a.PD)[0].wid} × ${[...summaryRows].sort((a, b) => b.PD - a.PD)[0].rid}`);

  // ── Per-persona CAF for the top cell ─────────────
  console.log('\n\n========================================');
  console.log('Per-persona breakdown for top-3 cells');
  console.log('========================================\n');
  for (const top of sorted.slice(0, 3)) {
    console.log(`\n─── ${top.wid} × ${top.rid} ─── CAF=${top.CAF.toFixed(3)}, PD=${top.PD.toFixed(4)} ───`);
    const cells = allResults.filter(r => r.weight === top.wid && r.rep === top.rid);
    for (const c of cells) {
      const persona = PERSONAS.find(p => p.id === c.persona)!;
      const declaredAvg = persona.clusters.reduce((s, cl) => s + (c.clusterAlignment[cl] ?? 0), 0) / persona.clusters.length;
      const all = Object.values(c.clusterAlignment);
      const overall = all.reduce((a, b) => a + b, 0) / all.length;
      const ratio = declaredAvg / overall;
      // Top 4 aligned clusters
      const sortedC = Object.entries(c.clusterAlignment).sort(([, a], [, b]) => b - a).slice(0, 4);
      const tops = sortedC.map(([cid, sim]) => `${persona.clusters.includes(cid) ? '★' : ' '}${cid.slice(0, 18)}=${(sim * 100).toFixed(0)}%`).join(' ');
      console.log(`  ${c.persona} ratio=${ratio.toFixed(2)} | ${tops}`);
    }
  }

  // ── Recommendations from top cell ────────────────
  console.log('\n\n========================================');
  console.log(`Top recommendations from winning cell: ${sorted[0].wid} × ${sorted[0].rid}`);
  console.log('========================================\n');
  const winnerCells = allResults.filter(r => r.weight === sorted[0].wid && r.rep === sorted[0].rid);
  for (const c of winnerCells) {
    const persona = PERSONAS.find(p => p.id === c.persona)!;
    console.log(`\n[${c.persona}] ${persona.label}`);
    console.log(`  Declared: ${persona.clusters.join(', ')}`);
    const recs = await topRecs(c.meanProfile, 12);
    for (const r of recs) {
      console.log(`    ${r.media_type === 'movie' ? 'M' : 'T'} ${r.title} (${r.year})`);
    }
  }

  // ── Save raw results for further analysis ────────
  const outPath = resolve(__dirname, 'sweep-results.json');
  writeFileSync(outPath, JSON.stringify({
    summaryRows,
    sorted: sorted.slice(0, 5),
    perPersona: allResults.map(r => ({
      weight: r.weight, rep: r.rep, persona: r.persona,
      tapCount: r.tapCount, clusterAlignment: r.clusterAlignment,
    })),
  }, null, 2));
  console.error(`\nRaw results saved to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
