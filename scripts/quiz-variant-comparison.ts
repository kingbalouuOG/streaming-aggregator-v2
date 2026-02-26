/**
 * Three-Way Quiz Structure Comparison
 *
 * Compares three quiz structures using identical inputs:
 *   Control:   3 fixed + 2 genre-responsive + 5 adaptive  (current production)
 *   Variant A: 0 fixed + 5 genre-responsive + 5 adaptive  (all-personal)
 *   Variant B: 5 fixed + 0 genre-responsive + 5 adaptive  (strong foundation)
 *
 * Usage:
 *   npx tsx scripts/quiz-variant-comparison.ts [--runs 200] [--narrow 50]
 *
 * Output:
 *   scripts/quiz-variant-results.json   (full raw data)
 *   Console comparison table
 */

import { writeFileSync, mkdirSync } from 'fs';

// ── Imports from Videx source ──────────────────────────────────────

import {
  ALL_DIMENSIONS,
  GENRE_DIMENSIONS,
  META_DIMENSIONS,
  cosineSimilarity,
  createEmptyVector,
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
  GENRE_RESPONSIVE_POOL,
  FIXED_PAIRS,
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

interface RunInput {
  id: string;
  clusters: string[];        // cluster IDs
  clusterNames: string[];    // display names
  answers: AnswerChoice[];   // 10 positional answers
  isNarrow: boolean;         // narrow cluster stress test
}

interface VariantResult {
  confidenceVector: Record<string, number>;
  confidenceMean: number;
  dimsAbove50: number;
  dimsAbove20: number;
  zeroDims: number;
  vectorMagnitude: number;
  vectorStdDev: number;
  cappedDims: number;
  phase1PairIds: string[];
  phase2PairIds: string[];
}

interface RunOutput {
  id: string;
  clusters: string[];
  clusterNames: string[];
  isNarrow: boolean;
  control: VariantResult;
  variantA: VariantResult;
  variantB: VariantResult;
}

// =====================================================================
// VARIANT B: TWO NEW FIXED PAIRS
// =====================================================================

const FIXED_4: QuizPair = {
  id: 'fixed-4',
  phase: 'fixed',
  dimensionsTested: ['comedy', 'crime', 'thriller', 'tone', 'popularity', 'intensity'],
  optionA: {
    tmdbId: 1396,
    mediaType: 'tv',
    title: 'Breaking Bad',
    year: 2008,
    descriptor: 'Intense crime drama — chemistry teacher turned drug lord',
    vectorPosition: {
      crime: 0.8, thriller: 0.8, drama: 0.7,
      tone: -0.8, pacing: 0.5, era: 0.5, popularity: 0.9, intensity: 0.9,
    },
  },
  optionB: {
    tmdbId: 1668,
    mediaType: 'tv',
    title: 'Friends',
    year: 1994,
    descriptor: 'Iconic feel-good sitcom — six friends in New York',
    vectorPosition: {
      comedy: 0.9, romance: 0.3,
      tone: 0.8, pacing: 0.3, era: 0.1, popularity: 0.9, intensity: -0.7,
    },
  },
};

const FIXED_5: QuizPair = {
  id: 'fixed-5',
  phase: 'fixed',
  dimensionsTested: ['animation', 'adventure', 'family', 'war', 'tone', 'era', 'intensity'],
  optionA: {
    tmdbId: 14160,
    mediaType: 'movie',
    title: 'Up',
    year: 2009,
    descriptor: 'Heartwarming Pixar adventure — an elderly man\'s balloon journey',
    vectorPosition: {
      animation: 0.9, family: 0.8, adventure: 0.8, comedy: 0.4, drama: 0.4,
      tone: 0.6, pacing: 0.4, era: 0.5, popularity: 0.8, intensity: -0.2,
    },
  },
  optionB: {
    tmdbId: 4613,
    mediaType: 'tv',
    title: 'Band of Brothers',
    year: 2001,
    descriptor: 'Harrowing WWII miniseries following Easy Company through Europe',
    vectorPosition: {
      war: 0.9, history: 0.8, drama: 0.8, action: 0.5,
      tone: -0.7, pacing: 0.3, era: -0.6, popularity: 0.7, intensity: 0.9,
    },
  },
};

function getExtendedFixedPairs(): QuizPair[] {
  return [...getFixedPairs(), FIXED_4, FIXED_5];
}

// =====================================================================
// VARIANT A: GENRE-RESPONSIVE SELECTION (NO FIXED PAIRS)
// =====================================================================

/**
 * Select `count` genre-responsive pairs WITHOUT the FIXED_PAIR_GENRES filter.
 * Since there are no fixed pairs, all user genres are "uncovered".
 */
function selectGenreResponsiveVariant(
  userGenreKeys: string[],
  selectedClusterIds: string[],
  count: number,
): QuizPair[] {
  // Score each genre-responsive pair — all user genres are uncovered
  const scoredPairs = GENRE_RESPONSIVE_POOL.map((pair) => {
    const triggers = pair.triggerGenres || [];
    const clusterTriggers = pair.triggerClusterIds || [];
    let score = 0;

    for (const trigger of triggers) {
      if (userGenreKeys.includes(trigger)) {
        score += 2; // All user genres are uncovered (no fixed pairs)
      }
    }

    for (const clusterId of clusterTriggers) {
      if (selectedClusterIds.includes(clusterId)) {
        score += 3;
      }
    }

    return { pair, score };
  });

  scoredPairs.sort((a, b) => b.score - a.score);

  // Pick top pairs avoiding title overlap
  const selected: QuizPair[] = [];
  const selectedTmdbIds = new Set<number>();

  for (const { pair } of scoredPairs) {
    if (selected.length >= count) break;
    const aId = pair.optionA.tmdbId;
    const bId = pair.optionB.tmdbId;
    if (selectedTmdbIds.has(aId) || selectedTmdbIds.has(bId)) continue;
    selected.push(pair);
    selectedTmdbIds.add(aId);
    selectedTmdbIds.add(bId);
  }

  // Fallback: relax title constraint
  if (selected.length < count) {
    for (const { pair } of scoredPairs) {
      if (selected.length >= count) break;
      if (selected.some(s => s.id === pair.id)) continue;
      selected.push(pair);
    }
  }

  return selected;
}

// =====================================================================
// UTILITIES
// =====================================================================

function mapChoice(choice: AnswerChoice): QuizAnswer['chosenOption'] {
  switch (choice) {
    case 'A': return 'A';
    case 'B': return 'B';
    case 'Both': return 'both';
    case 'Neither': return 'neither';
  }
}

function randomFromArray<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

function computeVariantResult(
  seedVector: TasteVector,
  phase1Pairs: QuizPair[],
  phase2Pairs: QuizPair[],
  answers: AnswerChoice[],
): VariantResult {
  // Build phase 1 answers
  const phase1Answers: QuizAnswer[] = phase1Pairs.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(answers[i]),
    phase: pair.phase as 'fixed' | 'genre-responsive',
    timestamp: new Date().toISOString(),
  }));

  // Build phase 2 answers
  const phase2Answers: QuizAnswer[] = phase2Pairs.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(answers[i + 5]),
    phase: 'adaptive' as const,
    timestamp: new Date().toISOString(),
  }));

  const allPairs = [...phase1Pairs, ...phase2Pairs];
  const allAnswers = [...phase1Answers, ...phase2Answers];
  const finalVector = computeQuizVector(seedVector, allAnswers, allPairs);
  const confidence = computeQuizConfidence(allAnswers, allPairs);

  // Compute metrics
  const confValues = ALL_DIMENSIONS.map(d => confidence[d]);
  const confMean = confValues.reduce((s, v) => s + v, 0) / confValues.length;

  const vecValues = ALL_DIMENSIONS.map(d => finalVector[d]);
  const magnitude = Math.sqrt(vecValues.reduce((s, v) => s + v * v, 0));
  const vecMean = vecValues.reduce((s, v) => s + v, 0) / vecValues.length;
  const vecStdDev = Math.sqrt(
    vecValues.reduce((s, v) => s + (v - vecMean) ** 2, 0) / vecValues.length
  );

  let cappedDims = 0;
  for (const dim of GENRE_DIMENSIONS) {
    if (finalVector[dim] >= 0.95 || finalVector[dim] <= 0.05) cappedDims++;
  }
  for (const dim of META_DIMENSIONS) {
    if (Math.abs(finalVector[dim]) >= 0.95) cappedDims++;
  }

  const confRecord: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) confRecord[dim] = confidence[dim];

  return {
    confidenceVector: confRecord,
    confidenceMean: confMean,
    dimsAbove50: confValues.filter(v => v > 0.5).length,
    dimsAbove20: confValues.filter(v => v > 0.2).length,
    zeroDims: confValues.filter(v => v === 0).length,
    vectorMagnitude: magnitude,
    vectorStdDev: vecStdDev,
    cappedDims,
    phase1PairIds: phase1Pairs.map(p => p.id),
    phase2PairIds: phase2Pairs.map(p => p.id),
  };
}

// =====================================================================
// VARIANT EXECUTORS
// =====================================================================

function executeControl(input: RunInput): VariantResult {
  const seedVector = computeClusterSeedVector(input.clusters);
  const topGenres = getTopGenreKeysFromClusters(input.clusters, 5);

  // Phase 1: 3 fixed + 2 genre-responsive
  const fixedPairs = getFixedPairs();
  const fixedIds = fixedPairs.map(p => p.id);
  const genrePairs = selectGenreResponsivePairs(topGenres, fixedIds, input.clusters);
  const phase1 = [...fixedPairs, ...genrePairs];

  // Interim vector
  const phase1Answers: QuizAnswer[] = phase1.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.answers[i]),
    phase: pair.phase as 'fixed' | 'genre-responsive',
    timestamp: new Date().toISOString(),
  }));
  const interim = computeQuizVector(seedVector, phase1Answers, phase1);

  // Phase 2: 5 adaptive
  const usedIds = new Set(phase1.map(p => p.id));
  const adaptive = selectAdaptivePairs(interim, usedIds, 5);

  return computeVariantResult(seedVector, phase1, adaptive, input.answers);
}

function executeVariantA(input: RunInput): VariantResult {
  const seedVector = computeClusterSeedVector(input.clusters);
  const topGenres = getTopGenreKeysFromClusters(input.clusters, 5);

  // Phase 1: 5 genre-responsive (no fixed pairs, no FIXED_PAIR_GENRES filter)
  const phase1 = selectGenreResponsiveVariant(topGenres, input.clusters, 5);

  // Interim vector
  const phase1Answers: QuizAnswer[] = phase1.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.answers[i]),
    phase: pair.phase as 'fixed' | 'genre-responsive',
    timestamp: new Date().toISOString(),
  }));
  const interim = computeQuizVector(seedVector, phase1Answers, phase1);

  // Phase 2: 5 adaptive
  const usedIds = new Set(phase1.map(p => p.id));
  const adaptive = selectAdaptivePairs(interim, usedIds, 5);

  return computeVariantResult(seedVector, phase1, adaptive, input.answers);
}

function executeVariantB(input: RunInput): VariantResult {
  const seedVector = computeClusterSeedVector(input.clusters);

  // Phase 1: 5 fixed (existing 3 + 2 new)
  const phase1 = getExtendedFixedPairs();

  // Interim vector
  const phase1Answers: QuizAnswer[] = phase1.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.answers[i]),
    phase: 'fixed' as const,
    timestamp: new Date().toISOString(),
  }));
  const interim = computeQuizVector(seedVector, phase1Answers, phase1);

  // Phase 2: 5 adaptive
  const usedIds = new Set(phase1.map(p => p.id));
  const adaptive = selectAdaptivePairs(interim, usedIds, 5);

  return computeVariantResult(seedVector, phase1, adaptive, input.answers);
}

// =====================================================================
// CLUSTER STRATEGIES
// =====================================================================

const ALL_CLUSTER_NAMES = TASTE_CLUSTERS.map(c => c.name);

/** Select clusters that are similar (narrow test). */
function selectNarrowClusters(): { ids: string[]; names: string[] } {
  // Pick a random cluster, then find 2 most similar by vector cosine
  const pivot = TASTE_CLUSTERS[Math.floor(Math.random() * TASTE_CLUSTERS.length)];
  const pivotVec = computeClusterSeedVector([pivot.id]);

  const scored = TASTE_CLUSTERS
    .filter(c => c.id !== pivot.id)
    .map(c => ({
      cluster: c,
      sim: cosineSimilarity(pivotVec, computeClusterSeedVector([c.id])),
    }))
    .sort((a, b) => b.sim - a.sim);

  const top2 = scored.slice(0, 2).map(s => s.cluster);
  const selected = [pivot, ...top2];
  return {
    ids: selected.map(c => c.id),
    names: selected.map(c => c.name),
  };
}

/** Select random 3-5 clusters. */
function selectRandomClusters(): { ids: string[]; names: string[] } {
  const count = randomInt(3, 5);
  const selected = randomFromArray(TASTE_CLUSTERS, count);
  return {
    ids: selected.map(c => c.id),
    names: selected.map(c => c.name),
  };
}

// =====================================================================
// AGGREGATION & REPORTING
// =====================================================================

interface AggregatedMetrics {
  confidenceMean: number;
  dimsAbove50: number;
  dimsAbove20: number;
  zeroDims: number;
  vectorMagnitude: number;
  vectorStdDev: number;
  cappedDims: number;
  blindSpots: string[];
  perDimConfidence: Record<string, number>;
}

function aggregate(
  results: RunOutput[],
  variant: 'control' | 'variantA' | 'variantB',
): AggregatedMetrics {
  const data = results.map(r => r[variant]);

  const avg = (fn: (d: VariantResult) => number) =>
    data.reduce((s, d) => s + fn(d), 0) / data.length;

  // Per-dimension confidence averages
  const perDim: Record<string, number> = {};
  const dimZeroCounts: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) {
    perDim[dim] = +(data.reduce((s, d) => s + d.confidenceVector[dim], 0) / data.length).toFixed(4);
    dimZeroCounts[dim] = data.filter(d => d.confidenceVector[dim] === 0).length;
  }

  const blindSpotThreshold = data.length * 0.8;
  const blindSpots = ALL_DIMENSIONS
    .filter(dim => dimZeroCounts[dim] > blindSpotThreshold)
    .map(d => d as string);

  return {
    confidenceMean: +avg(d => d.confidenceMean).toFixed(4),
    dimsAbove50: +avg(d => d.dimsAbove50).toFixed(1),
    dimsAbove20: +avg(d => d.dimsAbove20).toFixed(1),
    zeroDims: +avg(d => d.zeroDims).toFixed(1),
    vectorMagnitude: +avg(d => d.vectorMagnitude).toFixed(4),
    vectorStdDev: +avg(d => d.vectorStdDev).toFixed(4),
    cappedDims: +avg(d => d.cappedDims).toFixed(1),
    blindSpots,
    perDimConfidence: perDim,
  };
}

function printTable(
  label: string,
  ctrl: AggregatedMetrics,
  varA: AggregatedMetrics,
  varB: AggregatedMetrics,
) {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(78)}`);

  const header = `${'Metric'.padEnd(28)} ${'Control'.padStart(14)} ${'Var A (Personal)'.padStart(18)} ${'Var B (Foundation)'.padStart(20)}`;
  console.log(header);
  console.log('─'.repeat(78));

  const row = (name: string, c: string | number, a: string | number, b: string | number) => {
    const cs = String(c).padStart(14);
    const as = String(a).padStart(18);
    const bs = String(b).padStart(20);
    console.log(`${name.padEnd(28)} ${cs} ${as} ${bs}`);
  };

  row('Confidence mean', ctrl.confidenceMean, varA.confidenceMean, varB.confidenceMean);
  row('Dims > 0.5 confidence', ctrl.dimsAbove50, varA.dimsAbove50, varB.dimsAbove50);
  row('Dims > 0.2 confidence', ctrl.dimsAbove20, varA.dimsAbove20, varB.dimsAbove20);
  row('Zero-confidence dims', ctrl.zeroDims, varA.zeroDims, varB.zeroDims);
  row('Vector magnitude', ctrl.vectorMagnitude, varA.vectorMagnitude, varB.vectorMagnitude);
  row('Vector std dev (spread)', ctrl.vectorStdDev, varA.vectorStdDev, varB.vectorStdDev);
  row('Capped dims (±0.95)', ctrl.cappedDims, varA.cappedDims, varB.cappedDims);
  row('Blind spots', ctrl.blindSpots.length, varA.blindSpots.length, varB.blindSpots.length);

  if (ctrl.blindSpots.length || varA.blindSpots.length || varB.blindSpots.length) {
    console.log('');
    if (ctrl.blindSpots.length) console.log(`  Control blind spots:    ${ctrl.blindSpots.join(', ')}`);
    if (varA.blindSpots.length) console.log(`  Variant A blind spots:  ${varA.blindSpots.join(', ')}`);
    if (varB.blindSpots.length) console.log(`  Variant B blind spots:  ${varB.blindSpots.join(', ')}`);
  }
}

function printPerDimTable(
  ctrl: AggregatedMetrics,
  varA: AggregatedMetrics,
  varB: AggregatedMetrics,
) {
  console.log(`\n${'═'.repeat(78)}`);
  console.log('  Per-Dimension Average Confidence');
  console.log(`${'═'.repeat(78)}`);

  const header = `${'Dimension'.padEnd(16)} ${'Control'.padStart(10)} ${'Var A'.padStart(10)} ${'Var B'.padStart(10)}  ${'Best'.padStart(10)}  Delta`;
  console.log(header);
  console.log('─'.repeat(78));

  for (const dim of ALL_DIMENSIONS) {
    const c = ctrl.perDimConfidence[dim];
    const a = varA.perDimConfidence[dim];
    const b = varB.perDimConfidence[dim];
    const max = Math.max(c, a, b);
    const min = Math.min(c, a, b);
    const best = max === c ? 'Control' : max === a ? 'Var A' : 'Var B';
    const delta = (max - min).toFixed(3);

    const flag = (max - min > 0.05) ? ' *' : '';
    console.log(
      `${(dim as string).padEnd(16)} ${c.toFixed(3).padStart(10)} ${a.toFixed(3).padStart(10)} ${b.toFixed(3).padStart(10)}  ${best.padStart(10)}  ${('+' + delta + flag).padStart(8)}`
    );
  }

  console.log('\n  * = delta > 0.05 (meaningful difference)');
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  const args = process.argv.slice(2);
  const totalRuns = args.includes('--runs')
    ? parseInt(args[args.indexOf('--runs') + 1], 10)
    : 200;
  const narrowRuns = args.includes('--narrow')
    ? parseInt(args[args.indexOf('--narrow') + 1], 10)
    : 50;
  const normalRuns = totalRuns - narrowRuns;

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Videx Quiz Structure — Three-Way Comparison');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`\n  Control:   3 fixed + 2 genre-responsive + 5 adaptive (current)`);
  console.log(`  Variant A: 0 fixed + 5 genre-responsive + 5 adaptive (all-personal)`);
  console.log(`  Variant B: 5 fixed + 0 genre-responsive + 5 adaptive (strong foundation)`);
  console.log(`\n  Normal runs: ${normalRuns}   |   Narrow cluster runs: ${narrowRuns}   |   Total: ${totalRuns}\n`);

  // Generate inputs
  const inputs: RunInput[] = [];

  for (let i = 0; i < normalRuns; i++) {
    const { ids, names } = selectRandomClusters();
    inputs.push({
      id: `normal_${i + 1}`,
      clusters: ids,
      clusterNames: names,
      answers: generateAnswers(),
      isNarrow: false,
    });
  }

  for (let i = 0; i < narrowRuns; i++) {
    const { ids, names } = selectNarrowClusters();
    inputs.push({
      id: `narrow_${i + 1}`,
      clusters: ids,
      clusterNames: names,
      answers: generateAnswers(),
      isNarrow: true,
    });
  }

  // Execute all variants
  const results: RunOutput[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    results.push({
      id: input.id,
      clusters: input.clusters,
      clusterNames: input.clusterNames,
      isNarrow: input.isNarrow,
      control: executeControl(input),
      variantA: executeVariantA(input),
      variantB: executeVariantB(input),
    });

    if ((i + 1) % 50 === 0 || i === inputs.length - 1) {
      console.log(`  Completed ${i + 1}/${inputs.length} runs`);
    }
  }

  // Aggregate results
  const normalResults = results.filter(r => !r.isNarrow);
  const narrowResults = results.filter(r => r.isNarrow);

  const allCtrl = aggregate(results, 'control');
  const allVarA = aggregate(results, 'variantA');
  const allVarB = aggregate(results, 'variantB');

  const normCtrl = aggregate(normalResults, 'control');
  const normVarA = aggregate(normalResults, 'variantA');
  const normVarB = aggregate(normalResults, 'variantB');

  const narrCtrl = aggregate(narrowResults, 'control');
  const narrVarA = aggregate(narrowResults, 'variantA');
  const narrVarB = aggregate(narrowResults, 'variantB');

  // Print results
  printTable('ALL RUNS', allCtrl, allVarA, allVarB);
  printTable('NORMAL RUNS (random 3-5 clusters)', normCtrl, normVarA, normVarB);
  printTable('NARROW CLUSTER STRESS TEST (3 similar clusters)', narrCtrl, narrVarA, narrVarB);
  printPerDimTable(allCtrl, allVarA, allVarB);

  // Wins analysis
  console.log(`\n${'═'.repeat(78)}`);
  console.log('  Head-to-Head: Which variant had higher confidence mean per run?');
  console.log(`${'═'.repeat(78)}`);

  let ctrlWins = 0, varAWins = 0, varBWins = 0;
  for (const r of results) {
    const best = Math.max(r.control.confidenceMean, r.variantA.confidenceMean, r.variantB.confidenceMean);
    if (best === r.control.confidenceMean) ctrlWins++;
    else if (best === r.variantA.confidenceMean) varAWins++;
    else varBWins++;
  }
  console.log(`  Control: ${ctrlWins} wins  |  Variant A: ${varAWins} wins  |  Variant B: ${varBWins} wins`);

  // Narrow cluster detail
  let narrCtrlWins = 0, narrVarAWins = 0, narrVarBWins = 0;
  for (const r of narrowResults) {
    const best = Math.max(r.control.confidenceMean, r.variantA.confidenceMean, r.variantB.confidenceMean);
    if (best === r.control.confidenceMean) narrCtrlWins++;
    else if (best === r.variantA.confidenceMean) narrVarAWins++;
    else narrVarBWins++;
  }
  console.log(`  Narrow:  Control: ${narrCtrlWins}  |  Variant A: ${narrVarAWins}  |  Variant B: ${narrVarBWins}`);

  // Zero-dim comparison for narrow clusters
  console.log(`\n${'═'.repeat(78)}`);
  console.log('  Narrow Cluster Stress Test — Zero-Confidence Dimensions');
  console.log(`${'═'.repeat(78)}`);
  console.log(`  Avg zero-conf dims:  Control: ${narrCtrl.zeroDims}  |  Var A: ${narrVarA.zeroDims}  |  Var B: ${narrVarB.zeroDims}`);

  // Write results JSON
  const outputPath = 'scripts/quiz-variant-results.json';
  const output = {
    meta: {
      timestamp: new Date().toISOString(),
      totalRuns,
      normalRuns,
      narrowRuns,
      variants: {
        control: '3 fixed + 2 genre-responsive + 5 adaptive',
        variantA: '0 fixed + 5 genre-responsive + 5 adaptive',
        variantB: '5 fixed + 0 genre-responsive + 5 adaptive',
      },
    },
    aggregated: {
      all: { control: allCtrl, variantA: allVarA, variantB: allVarB },
      normal: { control: normCtrl, variantA: normVarA, variantB: normVarB },
      narrow: { control: narrCtrl, variantA: narrVarA, variantB: narrVarB },
    },
    headToHead: {
      all: { control: ctrlWins, variantA: varAWins, variantB: varBWins },
      narrow: { control: narrCtrlWins, variantA: narrVarAWins, variantB: narrVarBWins },
    },
    runs: results,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n  Results written to: ${outputPath}`);
  console.log('');
}

main().catch(console.error);
