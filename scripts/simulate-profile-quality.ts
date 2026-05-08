/**
 * Profile Quality Simulator
 *
 * Goes beyond grid composition: simulates the full pipeline
 *   grid → user taps → bootstrap → 1536D taste vector → recommendations
 * for each variant × persona, so we can judge variant choice on output quality
 * (the recommendations the user will actually see) — not just what the grid looks like.
 *
 * Key models:
 *   - Tap probability per (title, persona) = recognition + cluster_fit + cohort_fit
 *   - Bootstrap formula matches src/lib/taste-v2/bootstrap.ts
 *   - Recommendations via match_titles_by_vector RPC (pgvector cosine similarity)
 *
 * Usage:
 *   npx tsx scripts/simulate-profile-quality.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env / client ───────────────────────────────────
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
interface Persona {
  id: string; label: string;
  ageRange: string; viewingContext: string;
  services: string[]; clusters: string[];
}
interface Variant {
  id: string; label: string; anchors: number; useClusters: boolean;
}

// ── Constants (mirrored from simulate-quiz.ts) ─────
const CURRENT_YEAR = 2026;
const AGE_MIDPOINT: Record<string, number> = {
  'Under 18': 16, '18-24': 21, '25-34': 30, '35-44': 40, '45-54': 50, '55+': 60,
};
const PERSONAS: Persona[] = [
  { id: 'P1', label: '22yo · Solo · Netflix+Prime',
    ageRange: '18-24', viewingContext: 'solo', services: ['netflix', 'prime'],
    clusters: ['action-adrenaline', 'dark-thrillers', 'mind-bending-mysteries'] },
  { id: 'P2', label: '35yo · Partner · 4 services',
    ageRange: '35-44', viewingContext: 'partner', services: ['netflix', 'disney', 'bbc', 'channel4'],
    clusters: ['heartfelt-drama', 'prestige-award-winners', 'history-war'] },
  { id: 'P3', label: '55yo · Mix · UK heavy',
    ageRange: '55+', viewingContext: 'mix', services: ['netflix', 'bbc', 'itvx'],
    clusters: ['true-crime-real-stories', 'prestige-award-winners', 'history-war'] },
  { id: 'P4', label: '28yo · Family · Disney+Netflix',
    ageRange: '25-34', viewingContext: 'family', services: ['disney', 'netflix'],
    clusters: ['family-kids', 'anime-animation', 'feel-good-funny'] },
  { id: 'P5', label: '18yo · Solo · Netflix only',
    ageRange: 'Under 18', viewingContext: 'solo', services: ['netflix'],
    clusters: ['horror-supernatural', 'action-adrenaline', 'anime-animation'] },
  { id: 'P6', label: 'No optional data · Netflix+iPlayer',
    ageRange: '', viewingContext: '', services: ['netflix', 'bbc'],
    clusters: ['heartfelt-drama', 'mind-bending-mysteries', 'feel-good-funny'] },
];
// Two contender variants — Variant E with recency dropped
const VARIANTS: Variant[] = [
  { id: 'D', label: '8 anchors, genres after', anchors: 8, useClusters: false },
  { id: 'E', label: '6 anchors, genres after', anchors: 6, useClusters: false },
];
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
const WEIGHTS = { ageMax: 0.4, serviceMax: 0.2, clusterMax: 0.5, noiseMax: 0.4 };

// ── Vector ops (mirrored from src/lib/taste-v2/vectorOps.ts) ─────
function centroid(vs: number[][]): number[] {
  if (vs.length === 0) return [];
  const dim = vs[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vs) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vs.length;
  return out;
}
function weightedSum(vs: number[][], ws: number[]): number[] {
  if (vs.length === 0) return [];
  const dim = vs[0].length;
  const out = new Array(dim).fill(0);
  for (let j = 0; j < vs.length; j++) {
    const w = ws[j], v = vs[j];
    for (let i = 0; i < dim; i++) out[i] += w * v[i];
  }
  return out;
}
function l2Normalise(v: number[]): number[] {
  let mag = 0;
  for (const x of v) mag += x * x;
  mag = Math.sqrt(mag);
  if (mag === 0) return v.slice();
  return v.map(x => x / mag);
}
function cosSim(a: number[], b: number[]): number {
  let d = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const dn = Math.sqrt(ma) * Math.sqrt(mb);
  return dn === 0 ? 0 : d / dn;
}

// ── Embedding parser ───────────────────────────────
function parseEmb(raw: any): number[] | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw as number[];
}

// ── Data fetch ─────────────────────────────────────
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

async function fetchEmbeddings(tmdbIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (tmdbIds.length === 0) return map;
  const { data } = await supabase.from('titles').select('tmdb_id, embedding').in('tmdb_id', tmdbIds);
  for (const row of (data ?? []) as any[]) {
    const e = parseEmb(row.embedding);
    if (e) map.set(row.tmdb_id, e);
  }
  return map;
}

async function fetchServiceCentroids(serviceIds: string[]): Promise<number[][]> {
  if (serviceIds.length === 0) return [];
  const { data } = await supabase.from('service_fingerprints').select('centroid')
    .in('service_id', serviceIds).eq('variant', 'v1_popularity').eq('region', 'GB');
  const out: number[][] = [];
  for (const row of (data ?? []) as any[]) {
    const e = parseEmb(row.centroid);
    if (e) out.push(e);
  }
  return out;
}

// ── Scoring (for grid generation) ──────────────────
function ageCohortBoost(year: number | null, ageRange: string): number {
  if (!year) return 0;
  const age = AGE_MIDPOINT[ageRange];
  if (!age) return 0;
  const ps = CURRENT_YEAR - age + 13, pe = CURRENT_YEAR - age + 25;
  if (year >= ps && year <= pe) return WEIGHTS.ageMax;
  if (year >= ps - 5 && year <= pe + 5) return WEIGHTS.ageMax * 0.5;
  if (year < ps - 5 && year >= ps - 30) return WEIGHTS.ageMax * 0.15;
  return 0;
}
function clusterBoost(tmdb: number, clusters: string[], simMap: Map<number, Map<string, number>>): number {
  const sims = simMap.get(tmdb);
  if (!sims) return 0;
  let max = 0;
  for (const c of clusters) {
    const s = sims.get(c) ?? 0;
    if (s > max) max = s;
  }
  return Math.min(1, Math.max(0, (max - 0.6) / 0.3)) * WEIGHTS.clusterMax;
}

// ── Cluster similarity (in-JS) ─────────────────────
async function computeClusterSims(poolIds: number[]): Promise<Map<number, Map<string, number>>> {
  const allRepIds = Array.from(new Set(Object.values(CLUSTER_REPS).flat()));
  const allIds = Array.from(new Set([...poolIds, ...allRepIds]));
  const embMap = await fetchEmbeddings(allIds);
  const out = new Map<number, Map<string, number>>();
  for (const id of poolIds) out.set(id, new Map());
  for (const [cid, repIds] of Object.entries(CLUSTER_REPS)) {
    const repEmbs = repIds.map(i => embMap.get(i)).filter(Boolean) as number[][];
    if (repEmbs.length === 0) continue;
    for (const pid of poolIds) {
      const pe = embMap.get(pid); if (!pe) continue;
      let s = 0; for (const re of repEmbs) s += cosSim(pe, re);
      out.get(pid)!.set(cid, s / repEmbs.length);
    }
  }
  return out;
}

// ── Grid selection (from simulate-quiz.ts) ─────────
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function selectGrid(movies: Title[], tvShows: Title[], persona: Persona, variant: Variant,
  availSet: Set<number>, simMap: Map<number, Map<string, number>>, seed: number): Title[] {
  const rng = makeRng(seed);
  const aps = Math.floor(variant.anchors / 2);
  const movieAnchors = movies.slice(0, aps);
  const tvAnchors = tvShows.slice(0, aps);
  const movieT2 = movies.slice(aps);
  const tvT2 = tvShows.slice(aps);
  const score = (t: Title) => {
    const ab = ageCohortBoost(t.release_year, persona.ageRange);
    const sb = availSet.has(t.tmdb_id) ? WEIGHTS.serviceMax : 0;
    const cb = variant.useClusters ? clusterBoost(t.tmdb_id, persona.clusters, simMap) : 0;
    return ab + sb + cb + rng() * WEIGHTS.noiseMax;
  };
  const sm = movieT2.map(t => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  const stv = tvT2.map(t => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  const finalM = [...movieAnchors, ...sm.slice(0, 9 - movieAnchors.length).map(x => x.t)];
  const finalT = [...tvAnchors, ...stv.slice(0, 9 - tvAnchors.length).map(x => x.t)];
  const out: Title[] = [];
  for (let i = 0; i < 9; i++) { out.push(finalM[i]); out.push(finalT[i]); }
  return out;
}

// ── Tap probability model ──────────────────────────
/**
 * Probabilistic model of whether a persona would tap a given title.
 *   recognition: how universally known the title is (vote_count percentile)
 *   cluster_fit: max cosine similarity to any of the persona's clusters
 *   cohort_fit: release-year alignment with persona's prime years (13–25)
 *
 * tap_prob = clip(0.05 + 0.45·recognition + 0.30·cluster_fit + 0.20·cohort_fit, 0, 0.85)
 *
 * Top mainstream cohort+cluster matches → ~80% tap rate.
 * Out-of-cohort niche titles → ~10% tap rate.
 * Reflects the "I've watched & enjoyed" criteria realistically.
 */
function tapProbability(
  t: Title, persona: Persona,
  voteCountP: Map<number, number>, // tmdb_id → percentile (0..1)
  simMap: Map<number, Map<string, number>>,
): number {
  const recognition = voteCountP.get(t.tmdb_id) ?? 0;
  const sims = simMap.get(t.tmdb_id);
  let clusterFit = 0;
  if (sims) {
    for (const c of persona.clusters) {
      const s = sims.get(c) ?? 0;
      // Cosine sim 0.6→0, 0.9→1
      const r = Math.max(0, Math.min(1, (s - 0.6) / 0.3));
      if (r > clusterFit) clusterFit = r;
    }
  }
  const ab = ageCohortBoost(t.release_year, persona.ageRange);
  const cohortFit = ab / WEIGHTS.ageMax; // normalise back to 0..1
  const p = 0.05 + 0.45 * recognition + 0.30 * clusterFit + 0.20 * cohortFit;
  return Math.max(0, Math.min(0.85, p));
}

function sampleTaps(grid: Title[], persona: Persona,
  voteCountP: Map<number, number>, simMap: Map<number, Map<string, number>>,
  rng: () => number): Title[] {
  const taps: Title[] = [];
  for (const t of grid) {
    const p = tapProbability(t, persona, voteCountP, simMap);
    if (rng() < p) taps.push(t);
  }
  return taps;
}

// ── Bootstrap (mirrors src/lib/taste-v2/bootstrap.ts) ────
function getBootstrapWeights(watchedCount: number, hasGenres: boolean) {
  let s, w, g;
  if (watchedCount === 0) { s = 0.55; w = 0.00; g = 0.45; }
  else if (watchedCount <= 4) { s = 0.40; w = 0.40; g = 0.20; }
  else if (watchedCount <= 12) { s = 0.30; w = 0.55; g = 0.15; }
  else { s = 0.20; w = 0.70; g = 0.10; }
  if (!hasGenres) { s += g; g = 0; }
  return { service: s, watched: w, genre: g };
}

async function bootstrapProfile(
  persona: Persona, taps: Title[], variant: Variant,
): Promise<{ vector: number[]; weights: any; watchedCount: number } | null> {
  // Service centroids
  const serviceCentroids = await fetchServiceCentroids(persona.services);
  // Watched embeddings (only tapped titles)
  const watchedEmbs = taps.length > 0
    ? Array.from((await fetchEmbeddings(taps.map(t => t.tmdb_id))).values())
    : [];
  // Cluster embeddings (only if variant has clusters; else empty since clusters not yet selected)
  let clusterEmbs: number[][] = [];
  if (variant.useClusters || true) {
    // For variants D/E (clusters AFTER quiz), we still need to test the *full* profile
    // because in the actual app, by Step 5 the user has picked clusters too.
    // So we include them in the bootstrap to model the final profile state.
    const repIds = persona.clusters.flatMap(c => CLUSTER_REPS[c] ?? []);
    if (repIds.length > 0) {
      const m = await fetchEmbeddings(repIds);
      clusterEmbs = Array.from(m.values());
    }
  }

  const sV = serviceCentroids.length > 0 ? centroid(serviceCentroids) : null;
  const wV = watchedEmbs.length > 0 ? centroid(watchedEmbs) : null;
  const gV = clusterEmbs.length > 0 ? centroid(clusterEmbs) : null;
  if (!sV && !wV && !gV) return null;

  const ws = getBootstrapWeights(watchedEmbs.length, clusterEmbs.length > 0);
  const vs: number[][] = [];
  const ww: number[] = [];
  if (sV && ws.service > 0) { vs.push(sV); ww.push(ws.service); }
  if (wV && ws.watched > 0) { vs.push(wV); ww.push(ws.watched); }
  if (gV && ws.genre > 0) { vs.push(gV); ww.push(ws.genre); }
  if (vs.length === 0) return null;
  const combined = weightedSum(vs, ww);
  return { vector: l2Normalise(combined), weights: ws, watchedCount: watchedEmbs.length };
}

// ── Recommendations via match_titles_by_vector ─────
async function topRecs(profile: number[], limit: number): Promise<{ tmdb_id: number; title: string; year: number; media_type: string; sim: number }[]> {
  const { data, error } = await supabase.rpc('match_titles_by_vector' as any, {
    query_vector: profile,
    match_limit: limit,
  } as any);
  if (error || !data) {
    console.error('  match_titles_by_vector failed:', error?.message);
    return [];
  }
  // Function returns rows with tmdb_id, similarity, etc.
  return (data as any[]).map(r => ({
    tmdb_id: r.tmdb_id,
    title: r.title ?? r.name ?? '?',
    year: r.release_year ?? r.year ?? 0,
    media_type: r.media_type,
    sim: r.similarity ?? r.score ?? 0,
  }));
}

// ── Cluster centroid for evaluation ────────────────
async function computeAllClusterCentroids(): Promise<Map<string, number[]>> {
  const allReps = Array.from(new Set(Object.values(CLUSTER_REPS).flat()));
  const m = await fetchEmbeddings(allReps);
  const out = new Map<string, number[]>();
  for (const [cid, repIds] of Object.entries(CLUSTER_REPS)) {
    const embs = repIds.map(i => m.get(i)).filter(Boolean) as number[][];
    if (embs.length > 0) out.set(cid, l2Normalise(centroid(embs)));
  }
  return out;
}

// ── Main ───────────────────────────────────────────
async function main() {
  console.log('Fetching pool…');
  const { movies, tvShows } = await fetchPool();
  const allIds = [...movies.map(m => m.tmdb_id), ...tvShows.map(t => t.tmdb_id)];

  console.log('Computing cluster similarities + centroids…');
  const simMap = await computeClusterSims(allIds);
  const clusterCentroids = await computeAllClusterCentroids();

  // Vote count percentile for tap recognition signal
  const allVotes = [...movies, ...tvShows].map(t => t.vote_count).sort((a, b) => a - b);
  const voteCountP = new Map<number, number>();
  for (const t of [...movies, ...tvShows]) {
    const idx = allVotes.indexOf(t.vote_count);
    voteCountP.set(t.tmdb_id, idx / allVotes.length);
  }

  console.log('Fetching availability per persona…');
  const availMap = new Map<string, Set<number>>();
  for (const p of PERSONAS) {
    const { data } = await supabase.rpc('get_available_tmdb_ids', { service_ids: p.services });
    availMap.set(p.id, new Set<number>(Array.isArray(data) ? (data as number[]) : []));
  }

  // Run N=10 trials per persona × variant to capture stochastic tap variation
  const TRIALS = 10;
  console.log(`\n========================================`);
  console.log(`Profile Quality Simulation (${TRIALS} trials per cell)`);
  console.log(`========================================\n`);

  type TrialResult = {
    variant: string; persona: string;
    profileVec: number[]; tapCount: number;
    clusterAlignment: Record<string, number>;
    topRecs: { title: string; year: number; media_type: string; sim: number }[];
  };

  const allResults: TrialResult[] = [];

  for (const variant of VARIANTS) {
    for (const persona of PERSONAS) {
      console.log(`\n─── Variant ${variant.id} | ${persona.id} ${persona.label} ───`);

      const profileVecs: number[][] = [];
      const tapCounts: number[] = [];
      let recsExample: { title: string; year: number; media_type: string; sim: number }[] = [];

      for (let trial = 0; trial < TRIALS; trial++) {
        const seed = trial * 1000 + 7;
        const grid = selectGrid(movies, tvShows, persona, variant,
          availMap.get(persona.id) ?? new Set(), simMap, seed);
        const tapRng = makeRng(seed * 13 + 1);
        const taps = sampleTaps(grid, persona, voteCountP, simMap, tapRng);
        const result = await bootstrapProfile(persona, taps, variant);
        if (!result) continue;
        profileVecs.push(result.vector);
        tapCounts.push(result.watchedCount);
        if (trial === 0) {
          recsExample = await topRecs(result.vector, 15);
        }
      }

      if (profileVecs.length === 0) {
        console.log('  No valid profiles produced.');
        continue;
      }

      // Average profile across trials = stable persona profile
      const meanProfile = l2Normalise(centroid(profileVecs));
      const meanTaps = tapCounts.reduce((a, b) => a + b, 0) / tapCounts.length;

      // Cluster alignment: cosine sim from profile to each cluster centroid
      const clusterAlignment: Record<string, number> = {};
      for (const [cid, cVec] of clusterCentroids) {
        clusterAlignment[cid] = cosSim(meanProfile, cVec);
      }
      const sortedClusters = Object.entries(clusterAlignment).sort(([, a], [, b]) => b - a);

      console.log(`  Avg taps per session: ${meanTaps.toFixed(1)}`);
      console.log(`  Top cluster alignments:`);
      for (const [cid, sim] of sortedClusters.slice(0, 4)) {
        const isSelected = persona.clusters.includes(cid) ? '★' : ' ';
        console.log(`    ${isSelected} ${cid.padEnd(28)} ${(sim * 100).toFixed(1)}%`);
      }
      console.log(`  Top 10 recommendations from profile:`);
      for (const r of recsExample.slice(0, 10)) {
        console.log(`    ${r.media_type === 'movie' ? 'M' : 'T'} ${r.title} (${r.year}) [${(r.sim * 100).toFixed(0)}%]`);
      }

      allResults.push({
        variant: variant.id, persona: persona.id,
        profileVec: meanProfile, tapCount: meanTaps,
        clusterAlignment, topRecs: recsExample,
      });
    }
  }

  // ── Comparison metrics ─────────────────────────────
  console.log(`\n\n========================================`);
  console.log(`Cross-Variant Comparison Metrics`);
  console.log(`========================================\n`);

  // 1. Persona-distinctness within each variant (higher = better differentiation)
  console.log('1. Persona-distinctness (avg pairwise cosine distance between personas)');
  console.log('   Higher = better — different personas produce different profiles\n');
  for (const v of VARIANTS) {
    const profiles = allResults.filter(r => r.variant === v.id);
    let totalDist = 0, pairs = 0;
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        totalDist += 1 - cosSim(profiles[i].profileVec, profiles[j].profileVec);
        pairs++;
      }
    }
    console.log(`   Variant ${v.id}: avg pairwise distance = ${(totalDist / pairs).toFixed(4)}`);
  }

  // 2. Variant-stability: same persona across variants (lower = variants don't change profile much)
  console.log('\n2. Same-persona profile stability across variants');
  console.log('   Cosine similarity between D-profile and E-profile for each persona');
  console.log('   Higher = variant choice has little effect on profile\n');
  for (const p of PERSONAS) {
    const dP = allResults.find(r => r.variant === 'D' && r.persona === p.id);
    const eP = allResults.find(r => r.variant === 'E' && r.persona === p.id);
    if (!dP || !eP) continue;
    const sim = cosSim(dP.profileVec, eP.profileVec);
    console.log(`   ${p.id}: ${(sim * 100).toFixed(2)}%`);
  }

  // 3. Cluster-alignment fidelity: does profile align with persona's selected clusters?
  console.log('\n3. Cluster-alignment fidelity (does profile point at the persona\'s declared clusters?)');
  console.log('   Score = avg alignment of top-3 declared clusters vs avg of all 16');
  console.log('   Higher = profile is well-aligned with what the persona said they like\n');
  for (const v of VARIANTS) {
    let totalRatio = 0, n = 0;
    for (const r of allResults.filter(r => r.variant === v.id)) {
      const persona = PERSONAS.find(p => p.id === r.persona)!;
      const declaredAvg = persona.clusters.reduce((s, c) => s + (r.clusterAlignment[c] ?? 0), 0) / persona.clusters.length;
      const overallAvg = Object.values(r.clusterAlignment).reduce((a, b) => a + b, 0) / Object.values(r.clusterAlignment).length;
      totalRatio += declaredAvg / overallAvg;
      n++;
    }
    console.log(`   Variant ${v.id}: avg declared/overall ratio = ${(totalRatio / n).toFixed(3)}`);
  }

  // 4. Recommendation overlap between variants
  console.log('\n4. Recommendation overlap (Jaccard) — do D and E produce similar top-15 recs?');
  console.log('   1.0 = identical, 0.0 = no overlap\n');
  for (const p of PERSONAS) {
    const dP = allResults.find(r => r.variant === 'D' && r.persona === p.id);
    const eP = allResults.find(r => r.variant === 'E' && r.persona === p.id);
    if (!dP || !eP) continue;
    const dSet = new Set(dP.topRecs.map(r => r.title));
    const eSet = new Set(eP.topRecs.map(r => r.title));
    const inter = [...dSet].filter(x => eSet.has(x)).length;
    const union = new Set([...dSet, ...eSet]).size;
    console.log(`   ${p.id}: ${(inter / union * 100).toFixed(0)}% overlap (${inter}/${union})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
