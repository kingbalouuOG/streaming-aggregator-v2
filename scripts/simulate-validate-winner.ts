/**
 * Winner Validation
 *
 * After simulate-profile-sweep.ts identified W5 × C2 as the leading config,
 * this validates:
 *   1. W5–W7 ceiling check (does CAF/PD plateau?)
 *   2. Tap-count sensitivity (light/normal/heavy tap rates)
 *   3. N=30 stability check at winning cell
 *   4. Sample recommendation quality across regimes
 *
 * Usage:
 *   npx tsx scripts/simulate-validate-winner.ts > scripts/validate-output.txt
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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
  id: string; label: string; ageRange: string; viewingContext: string;
  services: string[]; clusters: string[];
}

const PERSONAS: Persona[] = [
  { id: 'P1', label: '22yo Solo Netflix+Prime', ageRange: '18-24', viewingContext: 'solo',
    services: ['netflix', 'prime'], clusters: ['action-adrenaline', 'dark-thrillers', 'mind-bending-mysteries'] },
  { id: 'P2', label: '35yo Partner 4 services', ageRange: '35-44', viewingContext: 'partner',
    services: ['netflix', 'disney', 'bbc', 'channel4'],
    clusters: ['heartfelt-drama', 'prestige-award-winners', 'history-war'] },
  { id: 'P3', label: '55yo Mix UK heavy', ageRange: '55+', viewingContext: 'mix',
    services: ['netflix', 'bbc', 'itvx'],
    clusters: ['true-crime-real-stories', 'prestige-award-winners', 'history-war'] },
  { id: 'P4', label: '28yo Family Disney+Netflix', ageRange: '25-34', viewingContext: 'family',
    services: ['disney', 'netflix'], clusters: ['family-kids', 'anime-animation', 'feel-good-funny'] },
  { id: 'P5', label: '18yo Solo Netflix only', ageRange: 'Under 18', viewingContext: 'solo',
    services: ['netflix'], clusters: ['horror-supernatural', 'action-adrenaline', 'anime-animation'] },
  { id: 'P6', label: 'No optional data', ageRange: '', viewingContext: '',
    services: ['netflix', 'bbc'], clusters: ['heartfelt-drama', 'mind-bending-mysteries', 'feel-good-funny'] },
];

// C4: Deduped reps + TV additions for family/anime/feel-good/reality
// (movies kept from C2, TV added where genre lacks TV representation)
const REPS_C2: Record<string, number[]> = {
  // feel-good-funny: keep movies + add classic sitcoms
  'feel-good-funny': [18785, 8363, 10625, 55721,
    2316, 48891, 97546, 66573, 1421], // The Office, Brooklyn 99, Ted Lasso, Good Place, Modern Family
  'action-adrenaline': [562],
  'dark-thrillers': [807, 210577, 146233],
  'rom-coms-love-stories': [11036, 455207, 4348],
  'epic-scifi-fantasy': [157336, 335984, 329865],
  'horror-supernatural': [419430, 447332, 126889],
  'mind-bending-mysteries': [27205, 11324, 1124, 77],
  'heartfelt-drama': [278, 238, 13],
  'true-crime-real-stories': [1430, 64439],
  // anime-animation: keep movies + add actual anime TV
  'anime-animation': [324857, 129, 150540,
    31910, 85937, 95479, 120089, 209867], // Naruto Shippuden, Demon Slayer, JJK, Spy x Family, Frieren
  'prestige-award-winners': [581734],
  'history-war': [857, 374720, 16869],
  // reality-entertainment: 1 → 3 reps (best available in DB)
  'reality-entertainment': [37678, 2370, 40290], // The Voice, Hell's Kitchen, MasterChef
  'cult-indie': [550, 680],
  // family-kids: keep movies + add kid-aimed TV
  'family-kids': [12, 8587, 277834, 862,
    246, 40075, 82728, 387, 15260], // Avatar TLA, Gravity Falls, Bluey, SpongeBob, Adventure Time
  'westerns-frontier': [429, 68718, 281957, 6977],
};

// Test grid: W4-W7 × tap multipliers
interface WeightCfg { id: string; cluster: number; }
const WEIGHTS: WeightCfg[] = [
  { id: 'W4_aggressive', cluster: 0.50 },
  { id: 'W5_dominant', cluster: 0.65 },
  { id: 'W6_extreme', cluster: 0.75 },
  { id: 'W7_almost_pure', cluster: 0.85 },
];

const TAP_REGIMES = [
  { id: 'light', mult: 0.6, label: 'Disengaged user (~3-4 taps)' },
  { id: 'normal', mult: 1.0, label: 'Typical user (~7-8 taps)' },
  { id: 'heavy', mult: 1.4, label: 'Engaged user (~12-13 taps)' },
];

const ANCHORS = 8;

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
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

// ── Data ───────────────────────────────────────────
async function fetchPool() {
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
async function fetchEmbeddingsBulk(ids: number[]) {
  const out = new Map<number, number[]>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('titles').select('tmdb_id, embedding').in('tmdb_id', ids.slice(i, i + 200));
    for (const row of (data ?? []) as any[]) {
      const e = parseEmb(row.embedding); if (e) out.set(row.tmdb_id, e);
    }
  }
  return out;
}
async function fetchServiceCentroids(svcIds: string[]) {
  if (svcIds.length === 0) return [];
  const { data } = await supabase.from('service_fingerprints').select('centroid')
    .in('service_id', svcIds).eq('variant', 'v1_popularity').eq('region', 'GB');
  const out: number[][] = [];
  for (const row of (data ?? []) as any[]) {
    const e = parseEmb(row.centroid); if (e) out.push(e);
  }
  return out;
}

// ── Grid + taps ────────────────────────────────────
function selectGrid(movies: Title[], tvShows: Title[], persona: Persona,
  availSet: Set<number>, seed: number): Title[] {
  const rng = makeRng(seed);
  const aps = Math.floor(ANCHORS / 2);
  const movieAnchors = movies.slice(0, aps);
  const tvAnchors = tvShows.slice(0, aps);
  const score = (t: Title) => {
    const ab = ageCohortBoost(t.release_year, persona.ageRange);
    const sb = availSet.has(t.tmdb_id) ? 0.2 : 0;
    return ab + sb + rng() * 0.4;
  };
  const sm = movies.slice(aps).map(t => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  const stv = tvShows.slice(aps).map(t => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  const finalM = [...movieAnchors, ...sm.slice(0, 9 - movieAnchors.length).map(x => x.t)];
  const finalT = [...tvAnchors, ...stv.slice(0, 9 - tvAnchors.length).map(x => x.t)];
  const out: Title[] = [];
  for (let i = 0; i < 9; i++) { out.push(finalM[i]); out.push(finalT[i]); }
  return out;
}

function tapProb(t: Title, persona: Persona, voteP: Map<number, number>,
  simMap: Map<number, Map<string, number>>, mult: number): number {
  const recognition = voteP.get(t.tmdb_id) ?? 0;
  const sims = simMap.get(t.tmdb_id);
  let cf = 0;
  if (sims) for (const c of persona.clusters) {
    const s = sims.get(c) ?? 0;
    const r = Math.max(0, Math.min(1, (s - 0.6) / 0.3));
    if (r > cf) cf = r;
  }
  const ab = ageCohortBoost(t.release_year, persona.ageRange);
  const cohortFit = ab / 0.4;
  const p = (0.05 + 0.45 * recognition + 0.30 * cf + 0.20 * cohortFit) * mult;
  return Math.max(0, Math.min(0.85, p));
}

function sampleTaps(grid: Title[], persona: Persona,
  voteP: Map<number, number>, simMap: Map<number, Map<string, number>>,
  rng: () => number, mult: number): Title[] {
  return grid.filter(t => rng() < tapProb(t, persona, voteP, simMap, mult));
}

// ── Bootstrap ──────────────────────────────────────
function getWeights(watched: number, hasGenres: boolean, base: { service: number; watched: number; genre: number }) {
  let s = base.service, w = base.watched, g = base.genre;
  if (watched === 0) { s = 0.55; w = 0; g = 0.45; }
  else if (watched <= 4) {
    const total = base.service + base.watched + base.genre;
    s = base.service / total * 0.6;
    w = base.watched / total * 0.4;
    g = base.genre / total * 0.6;
    const sum = s + w + g; s /= sum; w /= sum; g /= sum;
  } else if (watched > 12) {
    const total = base.service + base.watched + base.genre;
    s = base.service / total * 0.6;
    w = base.watched / total * 1.3;
    g = base.genre / total * 0.7;
    const sum = s + w + g; s /= sum; w /= sum; g /= sum;
  }
  if (!hasGenres) { s += g; g = 0; }
  return { service: s, watched: w, genre: g };
}

function bootstrap(serviceCs: number[][], watchedEs: number[][], clusterEs: number[][],
  baseWeights: { service: number; watched: number; genre: number }): number[] | null {
  const sV = serviceCs.length > 0 ? centroid(serviceCs) : null;
  const wV = watchedEs.length > 0 ? centroid(watchedEs) : null;
  const gV = clusterEs.length > 0 ? centroid(clusterEs) : null;
  if (!sV && !wV && !gV) return null;
  const ws = getWeights(watchedEs.length, clusterEs.length > 0, baseWeights);
  const vs: number[][] = [], wws: number[] = [];
  if (sV && ws.service > 0) { vs.push(sV); wws.push(ws.service); }
  if (wV && ws.watched > 0) { vs.push(wV); wws.push(ws.watched); }
  if (gV && ws.genre > 0) { vs.push(gV); wws.push(ws.genre); }
  return l2Normalise(weightedSum(vs, wws));
}

async function topRecs(profile: number[], limit: number) {
  const { data } = await supabase.rpc('match_titles_by_vector' as any, {
    query_vector: profile, match_limit: limit,
  } as any);
  if (!data) return [];
  return (data as any[]).map(r => ({
    tmdb_id: r.tmdb_id, title: r.title, year: r.release_year ?? r.year ?? 0,
    media_type: r.media_type, sim: r.similarity ?? r.score ?? 0,
  }));
}

function makeBaseWeights(cluster: number) {
  const rem = 1 - cluster;
  return { service: rem * 0.35, watched: rem * 0.65, genre: cluster };
}

// ── Main ───────────────────────────────────────────
async function main() {
  console.error('Loading pool…');
  const { movies, tvShows } = await fetchPool();
  const allPoolIds = [...movies.map(m => m.tmdb_id), ...tvShows.map(t => t.tmdb_id)];

  console.error('Loading embeddings…');
  const allRepIds = Array.from(new Set(Object.values(REPS_C2).flat()));
  const allIds = Array.from(new Set([...allPoolIds, ...allRepIds]));
  const embMap = await fetchEmbeddingsBulk(allIds);

  console.error('Computing cluster centroids + sim map…');
  const clusterCentroids = new Map<string, number[]>();
  for (const [cid, ids] of Object.entries(REPS_C2)) {
    const embs = ids.map(i => embMap.get(i)).filter(Boolean) as number[][];
    if (embs.length > 0) clusterCentroids.set(cid, l2Normalise(centroid(embs)));
  }
  const simMap = new Map<number, Map<string, number>>();
  for (const pid of allPoolIds) {
    const pe = embMap.get(pid); if (!pe) continue;
    const m = new Map<string, number>();
    for (const [cid, ids] of Object.entries(REPS_C2)) {
      const repEmbs = ids.map(i => embMap.get(i)).filter(Boolean) as number[][];
      if (repEmbs.length === 0) continue;
      let s = 0; for (const re of repEmbs) s += cosSim(pe, re);
      m.set(cid, s / repEmbs.length);
    }
    simMap.set(pid, m);
  }

  const personaServiceCs = new Map<string, number[][]>();
  for (const p of PERSONAS) personaServiceCs.set(p.id, await fetchServiceCentroids(p.services));

  const availMap = new Map<string, Set<number>>();
  for (const p of PERSONAS) {
    const { data } = await supabase.rpc('get_available_tmdb_ids', { service_ids: p.services });
    availMap.set(p.id, new Set<number>(Array.isArray(data) ? (data as number[]) : []));
  }

  const allVotes = [...movies, ...tvShows].map(t => t.vote_count).sort((a, b) => a - b);
  const voteP = new Map<number, number>();
  for (const t of [...movies, ...tvShows]) voteP.set(t.tmdb_id, allVotes.indexOf(t.vote_count) / allVotes.length);

  // ── Phase 1: Weight ceiling check (W4-W7 × normal taps) ─────
  console.log('========================================');
  console.log('Phase 1: Weight ceiling (W4-W7 at C2_deduped, normal taps, N=20)');
  console.log('========================================\n');

  const TRIALS_CEILING = 20;
  const ceilingResults: any[] = [];
  for (const wc of WEIGHTS) {
    const baseWeights = makeBaseWeights(wc.cluster);
    const profilesByPersona = new Map<string, number[][]>();
    const tapCounts: Record<string, number[]> = {};
    for (const p of PERSONAS) { profilesByPersona.set(p.id, []); tapCounts[p.id] = []; }

    for (let trial = 0; trial < TRIALS_CEILING; trial++) {
      for (const persona of PERSONAS) {
        const seed = trial * 1000 + 7;
        const grid = selectGrid(movies, tvShows, persona, availMap.get(persona.id)!, seed);
        const taps = sampleTaps(grid, persona, voteP, simMap, makeRng(seed * 13 + 1), 1.0);
        const watchedE = taps.map(t => embMap.get(t.tmdb_id)).filter(Boolean) as number[][];
        const repIds = persona.clusters.flatMap(c => REPS_C2[c] ?? []);
        const clusterE = repIds.map(i => embMap.get(i)).filter(Boolean) as number[][];
        const profile = bootstrap(personaServiceCs.get(persona.id) ?? [], watchedE, clusterE, baseWeights);
        if (profile) { profilesByPersona.get(persona.id)!.push(profile); tapCounts[persona.id].push(taps.length); }
      }
    }

    let cafSum = 0, n = 0;
    const meanProfiles: number[][] = [];
    const personaIds: string[] = [];
    for (const persona of PERSONAS) {
      const pvs = profilesByPersona.get(persona.id)!;
      if (pvs.length === 0) continue;
      const mean = l2Normalise(centroid(pvs));
      meanProfiles.push(mean);
      personaIds.push(persona.id);
      const aligns: Record<string, number> = {};
      for (const [cid, cv] of clusterCentroids) aligns[cid] = cosSim(mean, cv);
      const declared = persona.clusters.reduce((s, cl) => s + (aligns[cl] ?? 0), 0) / persona.clusters.length;
      const all = Object.values(aligns);
      cafSum += declared / (all.reduce((a, b) => a + b, 0) / all.length);
      n++;
    }
    const CAF = cafSum / n;
    let pdSum = 0, pairs = 0;
    for (let i = 0; i < meanProfiles.length; i++) for (let j = i + 1; j < meanProfiles.length; j++) {
      pdSum += 1 - cosSim(meanProfiles[i], meanProfiles[j]); pairs++;
    }
    const PD = pdSum / pairs;
    const avgTaps = Object.values(tapCounts).flat().reduce((a, b) => a + b, 0) / Object.values(tapCounts).flat().length;
    console.log(`  ${wc.id.padEnd(20)} (cluster=${wc.cluster.toFixed(2)})  CAF=${CAF.toFixed(3)}  PD=${PD.toFixed(4)}  taps=${avgTaps.toFixed(1)}`);
    ceilingResults.push({ wid: wc.id, cluster: wc.cluster, CAF, PD });
  }

  // Pick best weight
  const bestWeight = [...ceilingResults].sort((a, b) => b.CAF * 0.6 + b.PD * 4 - (a.CAF * 0.6 + a.PD * 4))[0];
  console.log(`\nBest weight (CAF×0.6 + PD×4): ${bestWeight.wid} (cluster=${bestWeight.cluster})`);

  // ── Phase 2: Tap-count sensitivity ────────────────
  console.log('\n========================================');
  console.log(`Phase 2: Tap-count sensitivity at ${bestWeight.wid} × C2_deduped (N=20 each)`);
  console.log('========================================\n');

  const bestBase = makeBaseWeights(bestWeight.cluster);

  for (const tap of TAP_REGIMES) {
    let cafSum = 0, n = 0;
    const meanProfiles: number[][] = [];
    let totalTaps = 0, taps_n = 0;
    for (const persona of PERSONAS) {
      const profiles: number[][] = [];
      for (let trial = 0; trial < 20; trial++) {
        const seed = trial * 1000 + 7;
        const grid = selectGrid(movies, tvShows, persona, availMap.get(persona.id)!, seed);
        const taps = sampleTaps(grid, persona, voteP, simMap, makeRng(seed * 13 + 1), tap.mult);
        totalTaps += taps.length; taps_n++;
        const watchedE = taps.map(t => embMap.get(t.tmdb_id)).filter(Boolean) as number[][];
        const repIds = persona.clusters.flatMap(c => REPS_C2[c] ?? []);
        const clusterE = repIds.map(i => embMap.get(i)).filter(Boolean) as number[][];
        const profile = bootstrap(personaServiceCs.get(persona.id) ?? [], watchedE, clusterE, bestBase);
        if (profile) profiles.push(profile);
      }
      if (profiles.length === 0) continue;
      const mean = l2Normalise(centroid(profiles));
      meanProfiles.push(mean);
      const aligns: Record<string, number> = {};
      for (const [cid, cv] of clusterCentroids) aligns[cid] = cosSim(mean, cv);
      const declared = persona.clusters.reduce((s, cl) => s + (aligns[cl] ?? 0), 0) / persona.clusters.length;
      const all = Object.values(aligns);
      cafSum += declared / (all.reduce((a, b) => a + b, 0) / all.length);
      n++;
    }
    let pdSum = 0, pairs = 0;
    for (let i = 0; i < meanProfiles.length; i++) for (let j = i + 1; j < meanProfiles.length; j++) {
      pdSum += 1 - cosSim(meanProfiles[i], meanProfiles[j]); pairs++;
    }
    const avgTaps = totalTaps / taps_n;
    console.log(`  ${tap.id.padEnd(8)} (mult=${tap.mult.toFixed(1)}, ${tap.label.padEnd(28)}) CAF=${(cafSum / n).toFixed(3)} PD=${(pdSum / pairs).toFixed(4)} avgTaps=${avgTaps.toFixed(1)}`);
  }

  // ── Phase 3: N=30 stability + final recs ──────────
  console.log('\n========================================');
  console.log(`Phase 3: N=30 stability check at ${bestWeight.wid} × C2_deduped`);
  console.log('========================================\n');

  const N = 30;
  const finalProfiles = new Map<string, number[]>();
  for (const persona of PERSONAS) {
    const profiles: number[][] = [];
    const tapCounts: number[] = [];
    for (let trial = 0; trial < N; trial++) {
      const seed = trial * 1000 + 7;
      const grid = selectGrid(movies, tvShows, persona, availMap.get(persona.id)!, seed);
      const taps = sampleTaps(grid, persona, voteP, simMap, makeRng(seed * 13 + 1), 1.0);
      tapCounts.push(taps.length);
      const watchedE = taps.map(t => embMap.get(t.tmdb_id)).filter(Boolean) as number[][];
      const repIds = persona.clusters.flatMap(c => REPS_C2[c] ?? []);
      const clusterE = repIds.map(i => embMap.get(i)).filter(Boolean) as number[][];
      const profile = bootstrap(personaServiceCs.get(persona.id) ?? [], watchedE, clusterE, bestBase);
      if (profile) profiles.push(profile);
    }
    const mean = l2Normalise(centroid(profiles));
    finalProfiles.set(persona.id, mean);

    // Variance: avg cosine distance from mean
    let varSum = 0;
    for (const p of profiles) varSum += 1 - cosSim(p, mean);
    const variance = varSum / profiles.length;
    const tapMean = tapCounts.reduce((a, b) => a + b, 0) / tapCounts.length;
    const tapStd = Math.sqrt(tapCounts.reduce((a, b) => a + (b - tapMean) ** 2, 0) / tapCounts.length);

    const aligns: Record<string, number> = {};
    for (const [cid, cv] of clusterCentroids) aligns[cid] = cosSim(mean, cv);
    const sortedC = Object.entries(aligns).sort(([, a], [, b]) => b - a).slice(0, 4);
    const tops = sortedC.map(([cid, sim]) => `${persona.clusters.includes(cid) ? '★' : ' '}${cid.slice(0, 18)}=${(sim * 100).toFixed(0)}%`).join(' ');

    console.log(`\n[${persona.id}] ${persona.label}`);
    console.log(`  Variance: ${variance.toFixed(5)} | Taps: ${tapMean.toFixed(1)}±${tapStd.toFixed(1)}`);
    console.log(`  Top clusters: ${tops}`);
  }

  // Top recs from final profiles
  console.log('\n\n========================================');
  console.log('Top 12 recommendations per persona (final winning config)');
  console.log('========================================\n');
  for (const persona of PERSONAS) {
    const profile = finalProfiles.get(persona.id)!;
    const recs = await topRecs(profile, 12);
    console.log(`\n[${persona.id}] ${persona.label}`);
    console.log(`  Declared clusters: ${persona.clusters.join(', ')}`);
    for (const r of recs) {
      console.log(`    ${r.media_type === 'movie' ? 'M' : 'T'} ${r.title} (${r.year || '?'})`);
    }
  }

  // Save raw profiles for further analysis
  writeFileSync(resolve(__dirname, 'validate-results.json'), JSON.stringify({
    winningConfig: { weight: bestWeight.wid, cluster: bestWeight.cluster, reps: 'C2_deduped' },
    ceilingResults,
  }, null, 2));
  console.error('\nResults saved to scripts/validate-results.json');
}

main().catch(e => { console.error(e); process.exit(1); });
