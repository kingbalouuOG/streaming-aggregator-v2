/**
 * Optimal Fixed-Pair Selection — Data-Driven Analysis
 *
 * Three-stage analysis to find the mathematically best 5 fixed pairs:
 *   Stage 1: Combinatorial coverage search (all C(48,5) = 1.7M combos)
 *   Stage 2: Simulation of top candidates (500 runs each)
 *   Stage 3: Recognisability validation (TMDb vote_count)
 *
 * Usage:
 *   npx tsx scripts/optimal-fixed-pairs.ts [--top 20] [--sims 500]
 *
 * Output:
 *   scripts/optimal-fixed-pairs-results.json
 *   Console tables
 */

import { writeFileSync, readFileSync } from 'fs';

// Load .env for TMDb API key (no dotenv dependency)
try {
  const envContent = readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not found — Stage 3 will skip */ }

// ── Imports from Videx source ──────────────────────────────────────

import {
  ALL_DIMENSIONS,
  GENRE_DIMENSIONS,
  META_DIMENSIONS,
  cosineSimilarity,
  type TasteVector,
} from '../src/lib/taste/tasteVector';

import {
  TASTE_CLUSTERS,
  computeClusterSeedVector,
  getTopGenreKeysFromClusters,
} from '../src/lib/taste/tasteClusters';

import {
  getFixedPairs,
  selectGenreResponsivePairs,
  selectAdaptivePairs,
  FIXED_PAIRS,
  GENRE_RESPONSIVE_POOL,
  ADAPTIVE_POOL,
} from '../src/lib/taste/quizConfig';

import type { QuizPair } from '../src/lib/taste/quizConfig';

import {
  computeQuizVector,
  computeQuizConfidence,
} from '../src/lib/taste/quizScoring';

import type { QuizAnswer } from '../src/lib/storage/tasteProfile';

// =====================================================================
// TYPES
// =====================================================================

type AnswerChoice = 'A' | 'B' | 'Both' | 'Neither';

interface CoverageCandidate {
  rank: number;
  pairIds: string[];
  pairTitles: string[];   // "OptA vs OptB" for each pair
  dimsCovered: number;
  genreDimsCovered: number;
  metaDimsCovered: number;
  coveredDims: string[];
  missingDims: string[];
  spreadScore: number;
  avgSpreadPerPair: number;
}

interface SimResult {
  rank: number;
  pairIds: string[];
  pairTitles: string[];
  dimsCovered: number;
  missingDims: string[];
  spreadScore: number;
  // Simulation metrics
  confidenceMean: number;
  dimsAbove50: number;
  dimsAbove20: number;
  zeroDims: number;
  vectorMagnitude: number;
  vectorStdDev: number;
  blindSpots: string[];
  winRateVsControl: number;
  // Deltas vs control
  confDeltaVsControl: number;
  zeroDimsDeltaVsControl: number;
}

interface TitleInfo {
  tmdbId: number;
  mediaType: string;
  title: string;
  year: number;
  voteCount?: number;
  popularity?: number;
  recognisability?: 'high' | 'moderate' | 'risk';
}

// =====================================================================
// ALL PAIRS POOL
// =====================================================================

const ALL_PAIRS: QuizPair[] = [
  ...FIXED_PAIRS,
  ...GENRE_RESPONSIVE_POOL,
  ...ADAPTIVE_POOL,
];

const META_SET = new Set(META_DIMENSIONS as readonly string[]);
const GENRE_SET = new Set(GENRE_DIMENSIONS as readonly string[]);

// =====================================================================
// STAGE 1: COMBINATORIAL COVERAGE SEARCH
// =====================================================================

function computeSpread(pair: QuizPair): number {
  let total = 0;
  for (const dim of pair.dimensionsTested) {
    const aVal = pair.optionA.vectorPosition[dim as keyof TasteVector] ?? 0;
    const bVal = pair.optionB.vectorPosition[dim as keyof TasteVector] ?? 0;
    total += Math.abs(aVal - bVal);
  }
  return total;
}

function pairTitle(pair: QuizPair): string {
  return `${pair.optionA.title} vs ${pair.optionB.title}`;
}

function hasTmdbOverlap(pairs: QuizPair[]): boolean {
  const ids = new Set<number>();
  for (const p of pairs) {
    if (ids.has(p.optionA.tmdbId) || ids.has(p.optionB.tmdbId)) return true;
    ids.add(p.optionA.tmdbId);
    ids.add(p.optionB.tmdbId);
  }
  return false;
}

function scoreCombination(pairs: QuizPair[]): CoverageCandidate | null {
  // Title overlap check
  if (hasTmdbOverlap(pairs)) return null;

  // Dimension coverage
  const allDims = new Set<string>();
  let spreadScore = 0;

  for (const pair of pairs) {
    for (const dim of pair.dimensionsTested) {
      allDims.add(dim);
    }
    spreadScore += computeSpread(pair);
  }

  const genreDims = [...allDims].filter(d => GENRE_SET.has(d));
  const metaDims = [...allDims].filter(d => META_SET.has(d));

  // Hard constraints: minimum 17 dims and all 5 meta dims
  if (allDims.size < 17) return null;
  if (metaDims.length < 5) return null;

  const coveredArr = [...allDims].sort();
  const missingArr = ALL_DIMENSIONS.filter(d => !allDims.has(d)).map(d => d as string);

  return {
    rank: 0,
    pairIds: pairs.map(p => p.id),
    pairTitles: pairs.map(p => pairTitle(p)),
    dimsCovered: allDims.size,
    genreDimsCovered: genreDims.length,
    metaDimsCovered: metaDims.length,
    coveredDims: coveredArr,
    missingDims: missingArr,
    spreadScore: +spreadScore.toFixed(2),
    avgSpreadPerPair: +(spreadScore / 5).toFixed(2),
  };
}

function runStage1(topN: number): CoverageCandidate[] {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  STAGE 1: Combinatorial Coverage Search');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  Pool: ${ALL_PAIRS.length} pairs | Combinations: C(${ALL_PAIRS.length},5) = ~1.7M`);
  console.log(`  Constraints: ≥17 dims, all 5 meta dims, no TMDb ID overlap\n`);

  const candidates: CoverageCandidate[] = [];
  let totalChecked = 0;
  let rejectedOverlap = 0;
  let rejectedCoverage = 0;

  const n = ALL_PAIRS.length;

  // Generate all C(n, 5) combinations
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            totalChecked++;
            const combo = [ALL_PAIRS[a], ALL_PAIRS[b], ALL_PAIRS[c], ALL_PAIRS[d], ALL_PAIRS[e]];
            const result = scoreCombination(combo);
            if (result === null) {
              // We can't easily distinguish overlap vs coverage rejection here
              // but the result tells us
              continue;
            }
            candidates.push(result);
          }
        }
      }
    }

    // Progress
    if ((a + 1) % 10 === 0 || a === n - 5) {
      const pct = ((a + 1) / (n - 4) * 100).toFixed(0);
      process.stdout.write(`\r  Scanning... ${pct}% (${candidates.length} candidates found)`);
    }
  }

  console.log(`\n\n  Total checked: ${totalChecked.toLocaleString()}`);
  console.log(`  Passed constraints: ${candidates.length.toLocaleString()}`);

  // Sort by (dimsCovered * 1000) + spreadScore
  candidates.sort((a, b) => {
    const aScore = a.dimsCovered * 1000 + a.spreadScore;
    const bScore = b.dimsCovered * 1000 + b.spreadScore;
    return bScore - aScore;
  });

  // Deduplicate: if multiple combos cover same dims with similar spread, keep best
  const top = candidates.slice(0, topN);
  top.forEach((c, i) => c.rank = i + 1);

  // Print top results
  console.log(`\n  Top ${top.length} combinations:\n`);
  console.log(`  ${'Rank'.padEnd(5)} ${'Dims'.padEnd(5)} ${'Genre'.padEnd(6)} ${'Meta'.padEnd(5)} ${'Spread'.padEnd(8)} Missing`);
  console.log('  ' + '─'.repeat(70));

  for (const c of top) {
    console.log(
      `  ${String(c.rank).padEnd(5)} ${String(c.dimsCovered).padEnd(5)} ${String(c.genreDimsCovered).padEnd(6)} ${String(c.metaDimsCovered).padEnd(5)} ${String(c.spreadScore).padEnd(8)} ${c.missingDims.join(', ') || '(none)'}`
    );
  }

  // Print pair details for top 5
  console.log('\n  ── Top 5 Pair Details ──\n');
  for (const c of top.slice(0, 5)) {
    console.log(`  #${c.rank} (${c.dimsCovered} dims, spread ${c.spreadScore}):`);
    for (let i = 0; i < c.pairIds.length; i++) {
      console.log(`    ${c.pairIds[i].padEnd(22)} ${c.pairTitles[i]}`);
    }
    console.log(`    Missing: ${c.missingDims.join(', ') || '(none)'}`);
    console.log('');
  }

  return top;
}

// =====================================================================
// STAGE 2: SIMULATION
// =====================================================================

function mapChoice(choice: AnswerChoice): QuizAnswer['chosenOption'] {
  switch (choice) {
    case 'A': return 'A';
    case 'B': return 'B';
    case 'Both': return 'both';
    case 'Neither': return 'neither';
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFromArray<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function generateAnswers(): AnswerChoice[] {
  const dist = { A: 0.30, B: 0.30, Both: 0.20, Neither: 0.20 };
  const answers: AnswerChoice[] = [];
  for (let i = 0; i < 10; i++) {
    const r = Math.random();
    let cum = 0;
    let choice: AnswerChoice = 'A';
    for (const [c, p] of Object.entries(dist)) {
      cum += p;
      if (r <= cum) { choice = c as AnswerChoice; break; }
    }
    answers.push(choice);
  }
  return answers;
}

interface SimInput {
  clusters: string[];
  answers: AnswerChoice[];
}

function simulateControl(input: SimInput): { confMean: number; zeroDims: number } {
  const seed = computeClusterSeedVector(input.clusters);
  const topGenres = getTopGenreKeysFromClusters(input.clusters, 5);

  const fixedPairs = getFixedPairs();
  const fixedIds = fixedPairs.map(p => p.id);
  const genrePairs = selectGenreResponsivePairs(topGenres, fixedIds, input.clusters);
  const phase1 = [...fixedPairs, ...genrePairs];

  const phase1Answers: QuizAnswer[] = phase1.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.answers[i]),
    phase: pair.phase as 'fixed' | 'genre-responsive',
    timestamp: new Date().toISOString(),
  }));
  const interim = computeQuizVector(seed, phase1Answers, phase1);

  const usedIds = new Set(phase1.map(p => p.id));
  const adaptive = selectAdaptivePairs(interim, usedIds, 5);

  const allPairs = [...phase1, ...adaptive];
  const phase2Answers: QuizAnswer[] = adaptive.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.answers[i + 5]),
    phase: 'adaptive' as const,
    timestamp: new Date().toISOString(),
  }));
  const allAnswers = [...phase1Answers, ...phase2Answers];

  const confidence = computeQuizConfidence(allAnswers, allPairs);
  const confValues = ALL_DIMENSIONS.map(d => confidence[d]);
  const confMean = confValues.reduce((s, v) => s + v, 0) / confValues.length;
  const zeroDims = confValues.filter(v => v === 0).length;

  return { confMean, zeroDims };
}

function simulateCandidate(
  candidatePairs: QuizPair[],
  input: SimInput,
): {
  confMean: number;
  dimsAbove50: number;
  dimsAbove20: number;
  zeroDims: number;
  vectorMagnitude: number;
  vectorStdDev: number;
  confidenceVector: Record<string, number>;
} {
  const seed = computeClusterSeedVector(input.clusters);

  // Phase 1: 5 fixed (candidate set)
  const phase1 = candidatePairs;
  const phase1Answers: QuizAnswer[] = phase1.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.answers[i]),
    phase: 'fixed' as const,
    timestamp: new Date().toISOString(),
  }));
  const interim = computeQuizVector(seed, phase1Answers, phase1);

  // Phase 2: 5 adaptive
  const usedIds = new Set(phase1.map(p => p.id));
  const adaptive = selectAdaptivePairs(interim, usedIds, 5);

  const phase2Answers: QuizAnswer[] = adaptive.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.answers[i + 5]),
    phase: 'adaptive' as const,
    timestamp: new Date().toISOString(),
  }));

  const allPairs = [...phase1, ...adaptive];
  const allAnswers = [...phase1Answers, ...phase2Answers];
  const finalVector = computeQuizVector(seed, allAnswers, allPairs);
  const confidence = computeQuizConfidence(allAnswers, allPairs);

  const confValues = ALL_DIMENSIONS.map(d => confidence[d]);
  const confMean = confValues.reduce((s, v) => s + v, 0) / confValues.length;

  const vecValues = ALL_DIMENSIONS.map(d => finalVector[d]);
  const magnitude = Math.sqrt(vecValues.reduce((s, v) => s + v * v, 0));
  const vecMean = vecValues.reduce((s, v) => s + v, 0) / vecValues.length;
  const vecStdDev = Math.sqrt(
    vecValues.reduce((s, v) => s + (v - vecMean) ** 2, 0) / vecValues.length
  );

  const confRecord: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) confRecord[dim] = confidence[dim];

  return {
    confMean,
    dimsAbove50: confValues.filter(v => v > 0.5).length,
    dimsAbove20: confValues.filter(v => v > 0.2).length,
    zeroDims: confValues.filter(v => v === 0).length,
    vectorMagnitude: magnitude,
    vectorStdDev: vecStdDev,
    confidenceVector: confRecord,
  };
}

function runStage2(candidates: CoverageCandidate[], numSims: number): SimResult[] {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  STAGE 2: Simulation');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  Testing ${candidates.length} candidates × ${numSims} runs each\n`);

  // Pre-generate shared inputs (same for all candidates + control)
  const inputs: SimInput[] = [];
  for (let i = 0; i < numSims; i++) {
    const count = randomInt(3, 5);
    const clusters = randomFromArray(TASTE_CLUSTERS, count).map(c => c.id);
    inputs.push({ clusters, answers: generateAnswers() });
  }

  // Run control baseline
  process.stdout.write('  Running control baseline...');
  const controlResults = inputs.map(inp => simulateControl(inp));
  const controlConfMean = controlResults.reduce((s, r) => s + r.confMean, 0) / numSims;
  const controlZeroDims = controlResults.reduce((s, r) => s + r.zeroDims, 0) / numSims;
  console.log(` done (conf: ${controlConfMean.toFixed(4)}, zeroDims: ${controlZeroDims.toFixed(1)})`);

  // Run each candidate
  const simResults: SimResult[] = [];

  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    const pairs = cand.pairIds.map(id => ALL_PAIRS.find(p => p.id === id)!);

    let totalConfMean = 0;
    let totalDimsAbove50 = 0;
    let totalDimsAbove20 = 0;
    let totalZeroDims = 0;
    let totalMagnitude = 0;
    let totalStdDev = 0;
    let wins = 0;

    const dimZeroCounts: Record<string, number> = {};
    for (const dim of ALL_DIMENSIONS) dimZeroCounts[dim] = 0;

    for (let si = 0; si < numSims; si++) {
      const result = simulateCandidate(pairs, inputs[si]);
      totalConfMean += result.confMean;
      totalDimsAbove50 += result.dimsAbove50;
      totalDimsAbove20 += result.dimsAbove20;
      totalZeroDims += result.zeroDims;
      totalMagnitude += result.vectorMagnitude;
      totalStdDev += result.vectorStdDev;

      if (result.confMean > controlResults[si].confMean) wins++;

      for (const dim of ALL_DIMENSIONS) {
        if (result.confidenceVector[dim] === 0) dimZeroCounts[dim]++;
      }
    }

    const blindSpotThreshold = numSims * 0.8;
    const blindSpots = ALL_DIMENSIONS
      .filter(dim => dimZeroCounts[dim] > blindSpotThreshold)
      .map(d => d as string);

    const avgConfMean = totalConfMean / numSims;

    simResults.push({
      rank: cand.rank,
      pairIds: cand.pairIds,
      pairTitles: cand.pairTitles,
      dimsCovered: cand.dimsCovered,
      missingDims: cand.missingDims,
      spreadScore: cand.spreadScore,
      confidenceMean: +avgConfMean.toFixed(4),
      dimsAbove50: +(totalDimsAbove50 / numSims).toFixed(1),
      dimsAbove20: +(totalDimsAbove20 / numSims).toFixed(1),
      zeroDims: +(totalZeroDims / numSims).toFixed(1),
      vectorMagnitude: +(totalMagnitude / numSims).toFixed(4),
      vectorStdDev: +(totalStdDev / numSims).toFixed(4),
      blindSpots,
      winRateVsControl: +(wins / numSims * 100).toFixed(1),
      confDeltaVsControl: +(avgConfMean - controlConfMean).toFixed(4),
      zeroDimsDeltaVsControl: +((totalZeroDims / numSims) - controlZeroDims).toFixed(1),
    });

    process.stdout.write(`\r  Simulated ${ci + 1}/${candidates.length} candidates`);
  }

  console.log('\n');

  // Sort by confidence mean (primary) with win rate as tiebreaker
  simResults.sort((a, b) => {
    const aScore = a.confidenceMean * 100 + a.winRateVsControl;
    const bScore = b.confidenceMean * 100 + b.winRateVsControl;
    return bScore - aScore;
  });

  // Print results
  console.log(`  Control baseline:  conf ${controlConfMean.toFixed(4)}  |  zeroDims ${controlZeroDims.toFixed(1)}\n`);
  console.log(`  ${'#'.padEnd(4)} ${'CovRank'.padEnd(8)} ${'ConfMean'.padEnd(10)} ${'Δ Ctrl'.padEnd(9)} ${'Win%'.padEnd(7)} ${'ZeroDm'.padEnd(8)} ${'Dims50'.padEnd(8)} ${'BlindSp'.padEnd(8)} Missing`);
  console.log('  ' + '─'.repeat(80));

  for (let i = 0; i < simResults.length; i++) {
    const s = simResults[i];
    const delta = s.confDeltaVsControl >= 0 ? `+${s.confDeltaVsControl.toFixed(4)}` : s.confDeltaVsControl.toFixed(4);
    console.log(
      `  ${String(i + 1).padEnd(4)} ${String(s.rank).padEnd(8)} ${s.confidenceMean.toFixed(4).padEnd(10)} ${delta.padEnd(9)} ${(s.winRateVsControl + '%').padEnd(7)} ${String(s.zeroDims).padEnd(8)} ${String(s.dimsAbove50).padEnd(8)} ${String(s.blindSpots.length).padEnd(8)} ${s.missingDims.join(', ')}`
    );
  }

  // Print top 5 pair compositions
  console.log('\n  ── Top 5 Simulation Results — Pair Compositions ──\n');
  for (let i = 0; i < Math.min(5, simResults.length); i++) {
    const s = simResults[i];
    const delta = s.confDeltaVsControl >= 0 ? `+${s.confDeltaVsControl.toFixed(4)}` : s.confDeltaVsControl.toFixed(4);
    console.log(`  #${i + 1}  Conf: ${s.confidenceMean.toFixed(4)} (${delta})  |  Win rate: ${s.winRateVsControl}%  |  Zero dims: ${s.zeroDims}  |  Blind spots: ${s.blindSpots.length}`);
    for (let j = 0; j < s.pairIds.length; j++) {
      console.log(`    ${s.pairIds[j].padEnd(22)} ${s.pairTitles[j]}`);
    }
    console.log(`    Missing: ${s.missingDims.join(', ') || '(none)'}`);
    console.log('');
  }

  return simResults;
}

// =====================================================================
// STAGE 3: RECOGNISABILITY (TMDb API)
// =====================================================================

async function fetchTitleInfo(tmdbId: number, mediaType: string): Promise<TitleInfo | null> {
  const apiKey = process.env.VITE_TMDB_API_KEY;
  if (!apiKey) return null;

  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    return {
      tmdbId,
      mediaType: type,
      title: data.title || data.name || 'Unknown',
      year: parseInt((data.release_date || data.first_air_date || '0000').slice(0, 4), 10),
      voteCount: data.vote_count || 0,
      popularity: data.popularity || 0,
      recognisability:
        (data.vote_count || 0) >= 5000 ? 'high' :
        (data.vote_count || 0) >= 2000 ? 'moderate' : 'risk',
    };
  } catch {
    return null;
  }
}

async function runStage3(simResults: SimResult[]): Promise<void> {
  const apiKey = process.env.VITE_TMDB_API_KEY;
  if (!apiKey) {
    console.log('\n  STAGE 3: Skipped (no VITE_TMDB_API_KEY in .env)');
    return;
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  STAGE 3: Recognisability Validation (TMDb API)');
  console.log('══════════════════════════════════════════════════════════════════\n');

  const top5 = simResults.slice(0, 5);

  // Collect all unique TMDb IDs from top 5 candidates
  const allTitles = new Map<string, { tmdbId: number; mediaType: string }>();
  for (const s of top5) {
    for (const pairId of s.pairIds) {
      const pair = ALL_PAIRS.find(p => p.id === pairId)!;
      const keyA = `${pair.optionA.mediaType}-${pair.optionA.tmdbId}`;
      const keyB = `${pair.optionB.mediaType}-${pair.optionB.tmdbId}`;
      allTitles.set(keyA, { tmdbId: pair.optionA.tmdbId, mediaType: pair.optionA.mediaType });
      allTitles.set(keyB, { tmdbId: pair.optionB.tmdbId, mediaType: pair.optionB.mediaType });
    }
  }

  console.log(`  Fetching data for ${allTitles.size} unique titles...\n`);

  // Fetch all title info (with rate limiting)
  const titleData = new Map<string, TitleInfo>();
  let fetched = 0;
  for (const [key, info] of allTitles) {
    const data = await fetchTitleInfo(info.tmdbId, info.mediaType);
    if (data) titleData.set(key, data);
    fetched++;
    if (fetched % 10 === 0) process.stdout.write(`\r  Fetched ${fetched}/${allTitles.size}`);
    // TMDb rate limit: ~40 req/10s — small delay
    await new Promise(r => setTimeout(r, 100));
  }
  console.log(`\r  Fetched ${fetched}/${allTitles.size}\n`);

  // Print results per candidate
  for (let i = 0; i < top5.length; i++) {
    const s = top5[i];
    console.log(`  ── Candidate #${i + 1} ──`);
    console.log(`  Conf: ${s.confidenceMean}  |  Win rate: ${s.winRateVsControl}%\n`);
    console.log(`  ${'Title'.padEnd(30)} ${'Year'.padEnd(6)} ${'Votes'.padEnd(10)} ${'Status'.padEnd(12)}`);
    console.log('  ' + '─'.repeat(60));

    let minVotes = Infinity;
    let riskCount = 0;
    const years: number[] = [];

    for (const pairId of s.pairIds) {
      const pair = ALL_PAIRS.find(p => p.id === pairId)!;
      for (const opt of [pair.optionA, pair.optionB]) {
        const key = `${opt.mediaType}-${opt.tmdbId}`;
        const info = titleData.get(key);
        const votes = info?.voteCount ?? 0;
        const status = info?.recognisability ?? 'unknown';
        const flag = status === 'risk' ? ' ⚠' : '';

        console.log(
          `  ${opt.title.padEnd(30)} ${String(info?.year ?? opt.year).padEnd(6)} ${String(votes).padEnd(10)} ${(status + flag).padEnd(12)}`
        );

        if (votes < minVotes) minVotes = votes;
        if (status === 'risk') riskCount++;
        years.push(info?.year ?? opt.year);
      }
    }

    const yearRange = Math.max(...years) - Math.min(...years);
    console.log(`\n  Era spread: ${Math.min(...years)}–${Math.max(...years)} (${yearRange} years)`);
    console.log(`  Min votes: ${minVotes}  |  Risk titles: ${riskCount}`);
    console.log('');
  }
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  const args = process.argv.slice(2);
  const topN = args.includes('--top')
    ? parseInt(args[args.indexOf('--top') + 1], 10)
    : 20;
  const numSims = args.includes('--sims')
    ? parseInt(args[args.indexOf('--sims') + 1], 10)
    : 500;

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Videx — Optimal Fixed-Pair Selection Analysis');
  console.log('═══════════════════════════════════════════════════════════════════');

  // Stage 1
  const coverageCandidates = runStage1(topN);

  // Stage 2
  const simResults = runStage2(coverageCandidates, numSims);

  // Stage 3
  await runStage3(simResults);

  // Write output
  const outputPath = 'scripts/optimal-fixed-pairs-results.json';
  const output = {
    meta: {
      timestamp: new Date().toISOString(),
      poolSize: ALL_PAIRS.length,
      topNCoverage: topN,
      simRuns: numSims,
    },
    stage1: coverageCandidates,
    stage2: simResults,
  };
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n  Full results written to: ${outputPath}\n`);
}

main().catch(console.error);
