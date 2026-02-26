/**
 * Fixed-Pair Shootout: Intuition vs Data-Optimised
 *
 * Compares three configurations (5 fixed + 5 adaptive each):
 *   Control:   Current production (3 fixed + 2 genre-responsive + 5 adaptive)
 *   Intuition: fixed-1, fixed-2, fixed-3 + Breaking Bad/Friends + Up/Band of Brothers
 *   Optimised: fixed-1, fixed-3, genre-crime, adaptive-7, adaptive-9
 *
 * Usage:
 *   npx tsx scripts/fixed-pair-shootout.ts [--runs 500] [--narrow 100]
 */

import { writeFileSync } from 'fs';

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
import { computeQuizVector, computeQuizConfidence } from '../src/lib/taste/quizScoring';
import type { QuizAnswer } from '../src/lib/storage/tasteProfile';

// =====================================================================
// TYPES
// =====================================================================

type AnswerChoice = 'A' | 'B' | 'Both' | 'Neither';

interface VariantResult {
  confidenceVector: Record<string, number>;
  confidenceMean: number;
  dimsAbove50: number;
  dimsAbove20: number;
  zeroDims: number;
  vectorMagnitude: number;
  vectorStdDev: number;
  cappedDims: number;
}

interface RunOutput {
  id: string;
  isNarrow: boolean;
  control: VariantResult;
  intuition: VariantResult;
  optimised: VariantResult;
}

// =====================================================================
// PAIR SETS
// =====================================================================

const ALL_PAIRS = [...FIXED_PAIRS, ...GENRE_RESPONSIVE_POOL, ...ADAPTIVE_POOL];

// Helper to find pair by ID
const pairById = (id: string) => ALL_PAIRS.find(p => p.id === id)!;

// ── Intuition set: existing 3 + Breaking Bad/Friends + Up/Band of Brothers ──

const INTUITION_FIXED_4: QuizPair = {
  id: 'intuition-4',
  phase: 'fixed',
  dimensionsTested: ['comedy', 'crime', 'thriller', 'tone', 'popularity', 'intensity'],
  optionA: {
    tmdbId: 1396, mediaType: 'tv', title: 'Breaking Bad', year: 2008,
    descriptor: 'Intense crime drama — chemistry teacher turned drug lord',
    vectorPosition: {
      crime: 0.8, thriller: 0.8, drama: 0.7,
      tone: -0.8, pacing: 0.5, era: 0.5, popularity: 0.9, intensity: 0.9,
    },
  },
  optionB: {
    tmdbId: 1668, mediaType: 'tv', title: 'Friends', year: 1994,
    descriptor: 'Iconic feel-good sitcom — six friends in New York',
    vectorPosition: {
      comedy: 0.9, romance: 0.3,
      tone: 0.8, pacing: 0.3, era: 0.1, popularity: 0.9, intensity: -0.7,
    },
  },
};

const INTUITION_FIXED_5: QuizPair = {
  id: 'intuition-5',
  phase: 'fixed',
  dimensionsTested: ['animation', 'adventure', 'family', 'war', 'tone', 'era', 'intensity'],
  optionA: {
    tmdbId: 14160, mediaType: 'movie', title: 'Up', year: 2009,
    descriptor: 'Heartwarming Pixar adventure — an elderly man\'s balloon journey',
    vectorPosition: {
      animation: 0.9, family: 0.8, adventure: 0.8, comedy: 0.4, drama: 0.4,
      tone: 0.6, pacing: 0.4, era: 0.5, popularity: 0.8, intensity: -0.2,
    },
  },
  optionB: {
    tmdbId: 4613, mediaType: 'tv', title: 'Band of Brothers', year: 2001,
    descriptor: 'Harrowing WWII miniseries following Easy Company through Europe',
    vectorPosition: {
      war: 0.9, history: 0.8, drama: 0.8, action: 0.5,
      tone: -0.7, pacing: 0.3, era: -0.6, popularity: 0.7, intensity: 0.9,
    },
  },
};

const INTUITION_SET: QuizPair[] = [
  ...getFixedPairs(),       // fixed-1, fixed-2, fixed-3
  INTUITION_FIXED_4,        // Breaking Bad vs Friends
  INTUITION_FIXED_5,        // Up vs Band of Brothers
];

// ── Optimised set: fixed-1, fixed-3, genre-crime, adaptive-7, adaptive-9 ──

const OPTIMISED_SET: QuizPair[] = [
  pairById('fixed-1'),      // Dark Knight vs Mamma Mia
  pairById('fixed-3'),      // Stranger Things vs The Crown
  pairById('genre-crime'),  // The Godfather vs Knives Out
  pairById('adaptive-7'),   // 1917 vs The Witcher
  pairById('adaptive-9'),   // Parasite vs Shrek
];

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

// =====================================================================
// SIMULATION ENGINE
// =====================================================================

function simulateFixedSet(
  fixedPairs: QuizPair[],
  clusters: string[],
  answers: AnswerChoice[],
): VariantResult {
  const seed = computeClusterSeedVector(clusters);

  // Phase 1: 5 fixed
  const phase1Answers: QuizAnswer[] = fixedPairs.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(answers[i]),
    phase: 'fixed' as const,
    timestamp: new Date().toISOString(),
  }));
  const interim = computeQuizVector(seed, phase1Answers, fixedPairs);

  // Phase 2: 5 adaptive
  const usedIds = new Set(fixedPairs.map(p => p.id));
  const adaptive = selectAdaptivePairs(interim, usedIds, 5);

  const phase2Answers: QuizAnswer[] = adaptive.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(answers[i + 5]),
    phase: 'adaptive' as const,
    timestamp: new Date().toISOString(),
  }));

  const allPairs = [...fixedPairs, ...adaptive];
  const allAnswers = [...phase1Answers, ...phase2Answers];
  const finalVector = computeQuizVector(seed, allAnswers, allPairs);
  const confidence = computeQuizConfidence(allAnswers, allPairs);

  const confValues = ALL_DIMENSIONS.map(d => confidence[d]);
  const confMean = confValues.reduce((s, v) => s + v, 0) / confValues.length;
  const vecValues = ALL_DIMENSIONS.map(d => finalVector[d]);
  const magnitude = Math.sqrt(vecValues.reduce((s, v) => s + v * v, 0));
  const vecMean = vecValues.reduce((s, v) => s + v, 0) / vecValues.length;
  const vecStdDev = Math.sqrt(vecValues.reduce((s, v) => s + (v - vecMean) ** 2, 0) / vecValues.length);

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
  };
}

function simulateControl(clusters: string[], answers: AnswerChoice[]): VariantResult {
  const seed = computeClusterSeedVector(clusters);
  const topGenres = getTopGenreKeysFromClusters(clusters, 5);

  const fixedPairs = getFixedPairs();
  const fixedIds = fixedPairs.map(p => p.id);
  const genrePairs = selectGenreResponsivePairs(topGenres, fixedIds, clusters);
  const phase1 = [...fixedPairs, ...genrePairs];

  const phase1Answers: QuizAnswer[] = phase1.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(answers[i]),
    phase: pair.phase as 'fixed' | 'genre-responsive',
    timestamp: new Date().toISOString(),
  }));
  const interim = computeQuizVector(seed, phase1Answers, phase1);

  const usedIds = new Set(phase1.map(p => p.id));
  const adaptive = selectAdaptivePairs(interim, usedIds, 5);

  const phase2Answers: QuizAnswer[] = adaptive.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(answers[i + 5]),
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
  const vecStdDev = Math.sqrt(vecValues.reduce((s, v) => s + (v - vecMean) ** 2, 0) / vecValues.length);

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
  };
}

// =====================================================================
// AGGREGATION & REPORTING
// =====================================================================

interface AggMetrics {
  confidenceMean: number;
  dimsAbove50: number;
  dimsAbove20: number;
  zeroDims: number;
  vectorMagnitude: number;
  vectorStdDev: number;
  cappedDims: number;
  blindSpots: string[];
  perDimConf: Record<string, number>;
}

function aggregate(results: RunOutput[], variant: 'control' | 'intuition' | 'optimised'): AggMetrics {
  const data = results.map(r => r[variant]);
  const avg = (fn: (d: VariantResult) => number) => data.reduce((s, d) => s + fn(d), 0) / data.length;

  const perDim: Record<string, number> = {};
  const dimZero: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) {
    perDim[dim] = +(data.reduce((s, d) => s + d.confidenceVector[dim], 0) / data.length).toFixed(4);
    dimZero[dim] = data.filter(d => d.confidenceVector[dim] === 0).length;
  }

  const threshold = data.length * 0.8;
  const blindSpots = ALL_DIMENSIONS.filter(dim => dimZero[dim] > threshold).map(d => d as string);

  return {
    confidenceMean: +avg(d => d.confidenceMean).toFixed(4),
    dimsAbove50: +avg(d => d.dimsAbove50).toFixed(1),
    dimsAbove20: +avg(d => d.dimsAbove20).toFixed(1),
    zeroDims: +avg(d => d.zeroDims).toFixed(1),
    vectorMagnitude: +avg(d => d.vectorMagnitude).toFixed(4),
    vectorStdDev: +avg(d => d.vectorStdDev).toFixed(4),
    cappedDims: +avg(d => d.cappedDims).toFixed(1),
    blindSpots,
    perDimConf: perDim,
  };
}

function printTable(label: string, ctrl: AggMetrics, intu: AggMetrics, opt: AggMetrics) {
  console.log(`\n${'═'.repeat(82)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(82)}`);

  const header = `${'Metric'.padEnd(28)} ${'Control'.padStart(14)} ${'Intuition'.padStart(14)} ${'Optimised'.padStart(14)}`;
  console.log(header);
  console.log('─'.repeat(82));

  const row = (name: string, c: string | number, i: string | number, o: string | number) => {
    console.log(`${name.padEnd(28)} ${String(c).padStart(14)} ${String(i).padStart(14)} ${String(o).padStart(14)}`);
  };

  row('Confidence mean', ctrl.confidenceMean, intu.confidenceMean, opt.confidenceMean);
  row('Dims > 0.5 confidence', ctrl.dimsAbove50, intu.dimsAbove50, opt.dimsAbove50);
  row('Dims > 0.2 confidence', ctrl.dimsAbove20, intu.dimsAbove20, opt.dimsAbove20);
  row('Zero-confidence dims', ctrl.zeroDims, intu.zeroDims, opt.zeroDims);
  row('Vector magnitude', ctrl.vectorMagnitude, intu.vectorMagnitude, opt.vectorMagnitude);
  row('Vector std dev (spread)', ctrl.vectorStdDev, intu.vectorStdDev, opt.vectorStdDev);
  row('Capped dims (±0.95)', ctrl.cappedDims, intu.cappedDims, opt.cappedDims);
  row('Blind spots', ctrl.blindSpots.length, intu.blindSpots.length, opt.blindSpots.length);

  if (ctrl.blindSpots.length || intu.blindSpots.length || opt.blindSpots.length) {
    console.log('');
    if (ctrl.blindSpots.length) console.log(`  Control:   ${ctrl.blindSpots.join(', ')}`);
    if (intu.blindSpots.length) console.log(`  Intuition: ${intu.blindSpots.join(', ')}`);
    if (opt.blindSpots.length) console.log(`  Optimised: ${opt.blindSpots.join(', ')}`);
  }
}

function printPerDimTable(ctrl: AggMetrics, intu: AggMetrics, opt: AggMetrics) {
  console.log(`\n${'═'.repeat(82)}`);
  console.log('  Per-Dimension Average Confidence');
  console.log(`${'═'.repeat(82)}`);
  console.log(`${'Dimension'.padEnd(16)} ${'Control'.padStart(10)} ${'Intuition'.padStart(10)} ${'Optimised'.padStart(10)}  ${'Best'.padStart(10)}  Delta`);
  console.log('─'.repeat(82));

  for (const dim of ALL_DIMENSIONS) {
    const c = ctrl.perDimConf[dim];
    const i = intu.perDimConf[dim];
    const o = opt.perDimConf[dim];
    const max = Math.max(c, i, o);
    const min = Math.min(c, i, o);
    const best = max === c ? 'Control' : max === i ? 'Intuition' : 'Optimised';
    const delta = (max - min).toFixed(3);
    const flag = (max - min > 0.05) ? ' *' : '';
    console.log(
      `${(dim as string).padEnd(16)} ${c.toFixed(3).padStart(10)} ${i.toFixed(3).padStart(10)} ${o.toFixed(3).padStart(10)}  ${best.padStart(10)}  ${('+' + delta + flag).padStart(8)}`
    );
  }
  console.log('\n  * = delta > 0.05 (meaningful difference)');
}

// =====================================================================
// NARROW CLUSTER SELECTION
// =====================================================================

function selectNarrowClusters(): string[] {
  const pivot = TASTE_CLUSTERS[Math.floor(Math.random() * TASTE_CLUSTERS.length)];
  const pivotVec = computeClusterSeedVector([pivot.id]);
  const scored = TASTE_CLUSTERS
    .filter(c => c.id !== pivot.id)
    .map(c => ({ id: c.id, sim: cosineSimilarity(pivotVec, computeClusterSeedVector([c.id])) }))
    .sort((a, b) => b.sim - a.sim);
  return [pivot.id, scored[0].id, scored[1].id];
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  const args = process.argv.slice(2);
  const totalRuns = args.includes('--runs') ? parseInt(args[args.indexOf('--runs') + 1], 10) : 500;
  const narrowRuns = args.includes('--narrow') ? parseInt(args[args.indexOf('--narrow') + 1], 10) : 100;
  const normalRuns = totalRuns - narrowRuns;

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('  Fixed-Pair Shootout: Intuition vs Data-Optimised');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Control:   3 fixed + 2 genre-responsive + 5 adaptive (current production)');
  console.log('  Intuition: 5 fixed (existing 3 + Breaking Bad/Friends + Up/Band of Brothers) + 5 adaptive');
  console.log('  Optimised: 5 fixed (DK/Mamma, ST/Crown, Godfather/Knives, 1917/Witcher, Parasite/Shrek) + 5 adaptive');
  console.log('');
  console.log('  Intuition dims tested:  tone, action, musical, intensity, pacing, scifi, romance, era,');
  console.log('                          horror, history, drama, comedy, crime, thriller, popularity,');
  console.log('                          animation, adventure, family, war  (19 genre + 5 meta = MISSING: documentary, mystery, reality, western)');
  console.log('  Optimised dims tested:  tone, action, musical, intensity, pacing, scifi, horror, history,');
  console.log('                          drama, era, crime, mystery, thriller, comedy, animation, family,');
  console.log('                          popularity, war, fantasy, adventure  (15 genre + 5 meta = MISSING: documentary, reality, romance, western)');
  console.log(`\n  Normal runs: ${normalRuns}   |   Narrow cluster runs: ${narrowRuns}   |   Total: ${totalRuns}\n`);

  const results: RunOutput[] = [];

  // Normal runs
  for (let i = 0; i < normalRuns; i++) {
    const count = randomInt(3, 5);
    const clusters = randomFromArray(TASTE_CLUSTERS, count).map(c => c.id);
    const answers = generateAnswers();

    results.push({
      id: `normal_${i + 1}`,
      isNarrow: false,
      control: simulateControl(clusters, answers),
      intuition: simulateFixedSet(INTUITION_SET, clusters, answers),
      optimised: simulateFixedSet(OPTIMISED_SET, clusters, answers),
    });

    if ((i + 1) % 100 === 0) process.stdout.write(`\r  Completed ${i + 1}/${totalRuns} runs`);
  }

  // Narrow runs
  for (let i = 0; i < narrowRuns; i++) {
    const clusters = selectNarrowClusters();
    const answers = generateAnswers();

    results.push({
      id: `narrow_${i + 1}`,
      isNarrow: true,
      control: simulateControl(clusters, answers),
      intuition: simulateFixedSet(INTUITION_SET, clusters, answers),
      optimised: simulateFixedSet(OPTIMISED_SET, clusters, answers),
    });

    if ((normalRuns + i + 1) % 100 === 0 || i === narrowRuns - 1) {
      process.stdout.write(`\r  Completed ${normalRuns + i + 1}/${totalRuns} runs`);
    }
  }

  console.log('\n');

  // Aggregate
  const normalResults = results.filter(r => !r.isNarrow);
  const narrowResults = results.filter(r => r.isNarrow);

  const allCtrl = aggregate(results, 'control');
  const allIntu = aggregate(results, 'intuition');
  const allOpt = aggregate(results, 'optimised');

  const normCtrl = aggregate(normalResults, 'control');
  const normIntu = aggregate(normalResults, 'intuition');
  const normOpt = aggregate(normalResults, 'optimised');

  const narrCtrl = aggregate(narrowResults, 'control');
  const narrIntu = aggregate(narrowResults, 'intuition');
  const narrOpt = aggregate(narrowResults, 'optimised');

  // Print tables
  printTable('ALL RUNS', allCtrl, allIntu, allOpt);
  printTable('NORMAL RUNS (random 3-5 clusters)', normCtrl, normIntu, normOpt);
  printTable('NARROW CLUSTER STRESS TEST (3 similar clusters)', narrCtrl, narrIntu, narrOpt);
  printPerDimTable(allCtrl, allIntu, allOpt);

  // Head-to-head
  console.log(`\n${'═'.repeat(82)}`);
  console.log('  Head-to-Head: Highest confidence mean per run');
  console.log(`${'═'.repeat(82)}`);

  let ctrlW = 0, intuW = 0, optW = 0;
  for (const r of results) {
    const best = Math.max(r.control.confidenceMean, r.intuition.confidenceMean, r.optimised.confidenceMean);
    if (best === r.control.confidenceMean) ctrlW++;
    else if (best === r.intuition.confidenceMean) intuW++;
    else optW++;
  }
  console.log(`  All:     Control: ${ctrlW}  |  Intuition: ${intuW}  |  Optimised: ${optW}`);

  let nCtrlW = 0, nIntuW = 0, nOptW = 0;
  for (const r of narrowResults) {
    const best = Math.max(r.control.confidenceMean, r.intuition.confidenceMean, r.optimised.confidenceMean);
    if (best === r.control.confidenceMean) nCtrlW++;
    else if (best === r.intuition.confidenceMean) nIntuW++;
    else nOptW++;
  }
  console.log(`  Narrow:  Control: ${nCtrlW}  |  Intuition: ${nIntuW}  |  Optimised: ${nOptW}`);

  // Direct: Intuition vs Optimised
  let intuBetter = 0, optBetter = 0, tie = 0;
  for (const r of results) {
    if (r.intuition.confidenceMean > r.optimised.confidenceMean) intuBetter++;
    else if (r.optimised.confidenceMean > r.intuition.confidenceMean) optBetter++;
    else tie++;
  }
  console.log(`\n  Direct:  Intuition wins: ${intuBetter}  |  Optimised wins: ${optBetter}  |  Ties: ${tie}`);

  // Write JSON
  const outputPath = 'scripts/fixed-pair-shootout-results.json';
  writeFileSync(outputPath, JSON.stringify({
    meta: { timestamp: new Date().toISOString(), totalRuns, normalRuns, narrowRuns },
    aggregated: {
      all: { control: allCtrl, intuition: allIntu, optimised: allOpt },
      normal: { control: normCtrl, intuition: normIntu, optimised: normOpt },
      narrow: { control: narrCtrl, intuition: narrIntu, optimised: narrOpt },
    },
    headToHead: {
      all: { control: ctrlW, intuition: intuW, optimised: optW },
      narrow: { control: nCtrlW, intuition: nIntuW, optimised: nOptW },
      direct: { intuitionWins: intuBetter, optimisedWins: optBetter, ties: tie },
    },
  }, null, 2));

  console.log(`\n  Results written to: ${outputPath}\n`);
}

main().catch(console.error);
