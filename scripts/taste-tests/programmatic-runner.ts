/**
 * Videx Taste Profile — Programmatic Test Runner (Layer 1)
 *
 * Imports taste vector functions directly and runs permutations
 * without a browser. Outputs JSON results for analysis.
 *
 * Usage (from project root):
 *   npx tsx .claude/skills/taste-profile-tester/scripts/programmatic-runner.ts [options]
 *
 * Options:
 *   --runs <n>        Total programmatic runs (default: from config)
 *   --category <cat>  Run only a specific category (A, B, C, D, E)
 *   --output <dir>    Output directory (default: ./test-results/programmatic)
 *   --config <path>   Path to test-config.json
 *
 * Must be run from the Videx project root so that @/ path aliases resolve
 * via the project's tsconfig.json.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ── Imports from Videx source ────────────────────────────────────

import {
  ALL_DIMENSIONS,
  GENRE_DIMENSIONS,
  META_DIMENSIONS,
  cosineSimilarity,
  type TasteVector,
} from '../../../../src/lib/taste/tasteVector';

import {
  TASTE_CLUSTERS,
  computeClusterSeedVector,
  getTopGenreKeysFromClusters,
} from '../../../../src/lib/taste/tasteClusters';

import {
  getFixedPairs,
  selectGenreResponsivePairs,
  selectAdaptivePairs,
} from '../../../../src/lib/taste/quizConfig';

import { computeQuizVector, computeQuizConfidence } from '../../../../src/lib/taste/quizScoring';

import type { QuizAnswer as RealQuizAnswer } from '../../../../src/lib/storage/tasteProfile';

// =============================================================================
// TYPES
// =============================================================================

interface TestRunInput {
  id: string;
  category: string;
  label: string;
  clusters: string[];   // cluster display names
  genres: string[];      // kept for config compat; not used by quiz pipeline
  services: string[];
  quizAnswers: QuizAnswer[];
}

interface QuizAnswer {
  pairIndex: number;
  choice: 'A' | 'B' | 'Both' | 'Neither';
}

interface TestRunOutput {
  id: string;
  category: string;
  label: string;
  input: TestRunInput;
  vector: number[];
  dimensions: Record<string, number>;
  metaDimensions: {
    tone: number;
    pacing: number;
    era: number;
    popularity: number;
    intensity: number;
  };
  adaptivePairsSelected: string[];
  cappedDimensions: string[];
  vectorMagnitude: number;
  confidenceVector: Record<string, number>;
  confidenceStats: {
    mean: number;
    dimsAbove50: number;
    dimsAbove20: number;
    zeroDims: number;
  };
  timestamp: string;
}

type AnswerChoice = 'A' | 'B' | 'Both' | 'Neither';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SCRIPT_DIR = typeof __dirname !== 'undefined'
  ? __dirname
  : new URL('.', import.meta.url).pathname;

const DEFAULT_CONFIG_PATH = join(SCRIPT_DIR, 'test-config.json');

function loadConfig(configPath?: string) {
  const path = configPath || DEFAULT_CONFIG_PATH;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// =============================================================================
// CLUSTER AND GENRE DEFINITIONS (from actual taste modules)
// =============================================================================

const ALL_CLUSTERS = TASTE_CLUSTERS.map(c => c.name);

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror',
  'Musical', 'Mystery', 'Reality', 'Romance', 'Sci-Fi', 'Thriller',
  'War', 'Western',
];

const ALL_SERVICES = [
  'netflix', 'prime', 'disney', 'apple', 'now',
  'bbc', 'itvx', 'channel4', 'paramount', 'skygo',
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function randomFromArray<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateAnswer(distribution: Record<string, number>): AnswerChoice {
  const rand = Math.random();
  let cumulative = 0;
  for (const [choice, probability] of Object.entries(distribution)) {
    cumulative += probability;
    if (rand <= cumulative) return choice as AnswerChoice;
  }
  return 'A';
}

function generateQuizAnswers(
  count: number,
  mode: 'distribution' | 'fixed' | 'alternating' | 'split',
  params: any
): QuizAnswer[] {
  const answers: QuizAnswer[] = [];

  for (let i = 0; i < count; i++) {
    let choice: AnswerChoice;

    switch (mode) {
      case 'fixed':
        choice = params.value;
        break;
      case 'alternating':
        choice = params.values[i % params.values.length];
        break;
      case 'split':
        choice = i < Math.floor(count / 2) ? params.firstHalf : params.secondHalf;
        break;
      case 'distribution':
      default:
        choice = generateAnswer(params.distribution);
        break;
    }

    answers.push({ pairIndex: i, choice });
  }

  return answers;
}

/**
 * Map test runner choice format to real QuizAnswer chosenOption format.
 * Test uses 'Both'/'Neither' (title case), real uses 'both'/'neither' (lowercase).
 */
function mapChoice(choice: AnswerChoice): RealQuizAnswer['chosenOption'] {
  switch (choice) {
    case 'A': return 'A';
    case 'B': return 'B';
    case 'Both': return 'both';
    case 'Neither': return 'neither';
  }
}

/** Map cluster display name → cluster ID for the taste system. */
function clusterNameToId(name: string): string {
  const cluster = TASTE_CLUSTERS.find(c => c.name === name);
  return cluster?.id ?? name;
}

/**
 * Select clusters based on a strategy, using real cluster seed vectors
 * and cosine similarity for distance-based strategies.
 */
function selectClusters(
  count: number,
  strategy: 'random' | 'min_distance' | 'max_distance' | 'max_overlap'
): string[] {
  if (strategy === 'random') {
    return randomFromArray(ALL_CLUSTERS, count);
  }

  // Compute individual seed vectors for each cluster
  const clusterVectors = TASTE_CLUSTERS.map(c => ({
    name: c.name,
    vector: computeClusterSeedVector([c.id]),
  }));

  // Greedy selection: pick first randomly, then add by strategy
  const selected: typeof clusterVectors[0][] = [];
  const remaining = [...clusterVectors];

  const firstIdx = Math.floor(Math.random() * remaining.length);
  selected.push(remaining.splice(firstIdx, 1)[0]);

  while (selected.length < count && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = strategy === 'max_distance' ? Infinity : -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      let avgSim = 0;
      for (const s of selected) {
        avgSim += cosineSimilarity(remaining[i].vector, s.vector);
      }
      avgSim /= selected.length;

      if (strategy === 'max_distance') {
        if (avgSim < bestScore) { bestScore = avgSim; bestIdx = i; }
      } else {
        // min_distance / max_overlap: want highest similarity
        if (avgSim > bestScore) { bestScore = avgSim; bestIdx = i; }
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected.map(s => s.name);
}

// =============================================================================
// PERMUTATION GENERATORS
// =============================================================================

function generateCategoryA(config: any): TestRunInput[] {
  const inputs: TestRunInput[] = [];
  const subcategories = config.categories.A_realistic.subcategories;

  for (const sub of subcategories) {
    for (let i = 0; i < sub.runs; i++) {
      const clusterCount = sub.clusterCount === 'random_3_to_5'
        ? randomInt(3, 5)
        : sub.clusterCount;

      inputs.push({
        id: `A_${inputs.length + 1}`,
        category: 'A_realistic',
        label: `realistic_${clusterCount}_clusters`,
        clusters: selectClusters(clusterCount, 'random'),
        genres: randomFromArray(ALL_GENRES, randomInt(3, 8)),
        services: randomFromArray(ALL_SERVICES, randomInt(2, 6)),
        quizAnswers: generateQuizAnswers(10, 'distribution', {
          distribution: sub.answerDistribution
        })
      });
    }
  }

  return inputs;
}

function generateCategoryB(config: any): TestRunInput[] {
  const inputs: TestRunInput[] = [];
  const subcategories = config.categories.B_answer_extremes.subcategories;

  for (const sub of subcategories) {
    for (let i = 0; i < sub.runs; i++) {
      let answers: QuizAnswer[];

      if (sub.fixedAnswers) {
        answers = generateQuizAnswers(10, 'fixed', { value: sub.fixedAnswers });
      } else if (sub.pattern === 'alternating') {
        answers = generateQuizAnswers(10, 'alternating', { values: sub.values });
      } else if (sub.pattern === 'split') {
        answers = generateQuizAnswers(10, 'split', {
          firstHalf: sub.firstHalf,
          secondHalf: sub.secondHalf
        });
      } else {
        answers = generateQuizAnswers(10, 'distribution', {
          distribution: { A: 0.25, B: 0.25, Both: 0.25, Neither: 0.25 }
        });
      }

      inputs.push({
        id: `B_${sub.label}_${i + 1}`,
        category: 'B_answer_extremes',
        label: sub.label,
        clusters: selectClusters(randomInt(3, 5), 'random'),
        genres: randomFromArray(ALL_GENRES, randomInt(3, 6)),
        services: randomFromArray(ALL_SERVICES, randomInt(2, 5)),
        quizAnswers: answers
      });
    }
  }

  return inputs;
}

function generateCategoryC(config: any): TestRunInput[] {
  const inputs: TestRunInput[] = [];
  const subcategories = config.categories.C_cluster_extremes.subcategories;

  for (const sub of subcategories) {
    for (let i = 0; i < sub.runs; i++) {
      inputs.push({
        id: `C_${sub.label}_${i + 1}`,
        category: 'C_cluster_extremes',
        label: sub.label,
        clusters: selectClusters(sub.clusterCount, sub.clusterStrategy),
        genres: randomFromArray(ALL_GENRES, randomInt(3, 6)),
        services: randomFromArray(ALL_SERVICES, randomInt(2, 5)),
        quizAnswers: generateQuizAnswers(10, 'distribution', {
          distribution: { A: 0.30, B: 0.30, Both: 0.20, Neither: 0.20 }
        })
      });
    }
  }

  return inputs;
}

function generateCategoryD(config: any): TestRunInput[] {
  const inputs: TestRunInput[] = [];
  const subcategories = config.categories.D_mismatch.subcategories;

  // Classify clusters by their actual vector properties
  const highIntensityClusters = TASTE_CLUSTERS
    .filter(c => (c.vector.intensity ?? 0) > 0.4)
    .map(c => c.name);

  const lightToneClusters = TASTE_CLUSTERS
    .filter(c => (c.vector.tone ?? 0) > 0.2)
    .map(c => c.name);

  for (const sub of subcategories) {
    for (let i = 0; i < sub.runs; i++) {
      let clusters: string[];
      let answerDistribution: Record<string, number>;

      if (sub.clusterBias === 'high_intensity') {
        // Action-heavy clusters but bias quiz answers toward calmer/lighter (B)
        clusters = randomFromArray(highIntensityClusters, 4);
        answerDistribution = { A: 0.10, B: 0.60, Both: 0.15, Neither: 0.15 };
      } else {
        // Comedy/light clusters but bias quiz answers toward dark/intense (A)
        clusters = randomFromArray(lightToneClusters, 4);
        answerDistribution = { A: 0.60, B: 0.10, Both: 0.15, Neither: 0.15 };
      }

      inputs.push({
        id: `D_${sub.label}_${i + 1}`,
        category: 'D_mismatch',
        label: sub.label,
        clusters,
        genres: randomFromArray(ALL_GENRES, randomInt(3, 6)),
        services: randomFromArray(ALL_SERVICES, randomInt(2, 5)),
        quizAnswers: generateQuizAnswers(10, 'distribution', {
          distribution: answerDistribution,
        })
      });
    }
  }

  return inputs;
}

function generateCategoryE(config: any): TestRunInput[] {
  const inputs: TestRunInput[] = [];
  const pairs = config.categories.E_determinism.pairs;

  for (let i = 0; i < pairs; i++) {
    const clusters = selectClusters(randomInt(3, 5), 'random');
    const genres = randomFromArray(ALL_GENRES, randomInt(3, 6));
    const services = randomFromArray(ALL_SERVICES, randomInt(2, 5));
    const answers = generateQuizAnswers(10, 'distribution', {
      distribution: { A: 0.30, B: 0.30, Both: 0.20, Neither: 0.20 }
    });

    const baseInput: Omit<TestRunInput, 'id'> = {
      category: 'E_determinism',
      label: `determinism_pair_${i + 1}`,
      clusters: [...clusters],
      genres: [...genres],
      services: [...services],
      quizAnswers: answers.map(a => ({ ...a }))
    };

    inputs.push({ id: `E_pair_${i + 1}_run_1`, ...baseInput });
    inputs.push({ id: `E_pair_${i + 1}_run_2`, ...baseInput });
  }

  return inputs;
}

// =============================================================================
// TEST EXECUTOR
// =============================================================================

/**
 * Execute a single test run using the actual Videx taste vector pipeline.
 *
 * Flow:
 * 1. Compute cluster seed vector from selected clusters
 * 2. Get fixed pairs (3) + genre-responsive pairs (2)
 * 3. Process quiz answers for questions 1-5 → interim vector
 * 4. Select adaptive pairs (5) based on interim vector
 * 5. Process all 10 quiz answers → final vector
 */
function executeRun(input: TestRunInput): TestRunOutput {
  // 1. Map cluster names → IDs, compute seed vector
  const clusterIds = input.clusters.map(clusterNameToId);
  const seedVector = computeClusterSeedVector(clusterIds);

  // 2. Get top genre keys for genre-responsive pair selection
  const topGenreKeys = getTopGenreKeysFromClusters(clusterIds, 5);

  // 3. Phase 1: Fixed pairs (3)
  const fixedPairs = getFixedPairs();
  const fixedPairIds = fixedPairs.map(p => p.id);

  // 4. Phase 2: Genre-responsive pairs (2)
  const genrePairs = selectGenreResponsivePairs(topGenreKeys, fixedPairIds, clusterIds);

  const phase1Pairs = [...fixedPairs, ...genrePairs];

  // 5. Build QuizAnswer objects for questions 1-5
  const phase1Answers: RealQuizAnswer[] = phase1Pairs.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.quizAnswers[i]?.choice ?? 'A'),
    phase: pair.phase as 'fixed' | 'genre-responsive',
    timestamp: new Date().toISOString(),
  }));

  // 6. Compute interim vector (after 5 questions)
  const interimVector = computeQuizVector(seedVector, phase1Answers, phase1Pairs);

  // 7. Phase 3: Adaptive pairs (5) based on interim vector
  const usedPairIds = new Set([...fixedPairIds, ...genrePairs.map(p => p.id)]);
  const adaptivePairs = selectAdaptivePairs(interimVector, usedPairIds, 5);

  // 8. Build QuizAnswer objects for questions 6-10
  const phase2Answers: RealQuizAnswer[] = adaptivePairs.map((pair, i) => ({
    pairId: pair.id,
    chosenOption: mapChoice(input.quizAnswers[i + 5]?.choice ?? 'A'),
    phase: 'adaptive' as const,
    timestamp: new Date().toISOString(),
  }));

  // 9. Compute final vector (all 10 questions)
  const allPairs = [...phase1Pairs, ...adaptivePairs];
  const allAnswers = [...phase1Answers, ...phase2Answers];
  const finalVector = computeQuizVector(seedVector, allAnswers, allPairs);

  // 10. Build output
  const dimensions: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) {
    dimensions[dim] = finalVector[dim];
  }

  const cappedDimensions: string[] = [];
  for (const dim of GENRE_DIMENSIONS) {
    if (finalVector[dim] >= 0.95 || finalVector[dim] <= 0.05) {
      cappedDimensions.push(dim);
    }
  }
  for (const dim of META_DIMENSIONS) {
    if (Math.abs(finalVector[dim]) >= 0.95) {
      cappedDimensions.push(dim);
    }
  }

  const vectorArray = ALL_DIMENSIONS.map(d => finalVector[d]);
  const magnitude = Math.sqrt(vectorArray.reduce((sum, v) => sum + v * v, 0));

  // 11. Compute quiz confidence
  const confidence = computeQuizConfidence(allAnswers, allPairs);
  const confRecord: Record<string, number> = {};
  const confValues: number[] = [];
  for (const dim of ALL_DIMENSIONS) {
    confRecord[dim] = confidence[dim];
    confValues.push(confidence[dim]);
  }
  const confMean = confValues.reduce((s, v) => s + v, 0) / confValues.length;

  return {
    id: input.id,
    category: input.category,
    label: input.label,
    input,
    vector: vectorArray,
    dimensions,
    metaDimensions: {
      tone: finalVector.tone,
      pacing: finalVector.pacing,
      era: finalVector.era,
      popularity: finalVector.popularity,
      intensity: finalVector.intensity,
    },
    adaptivePairsSelected: adaptivePairs.map(p => p.id),
    cappedDimensions,
    vectorMagnitude: magnitude,
    confidenceVector: confRecord,
    confidenceStats: {
      mean: confMean,
      dimsAbove50: confValues.filter(v => v > 0.5).length,
      dimsAbove20: confValues.filter(v => v > 0.2).length,
      zeroDims: confValues.filter(v => v === 0).length,
    },
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const configPath = args.includes('--config')
    ? args[args.indexOf('--config') + 1]
    : undefined;
  const outputDir = args.includes('--output')
    ? args[args.indexOf('--output') + 1]
    : undefined;
  const categoryFilter = args.includes('--category')
    ? args[args.indexOf('--category') + 1]
    : undefined;

  const config = loadConfig(configPath);
  const pConfig = config.programmatic;
  const outDir = outputDir || pConfig.outputDir;

  mkdirSync(outDir, { recursive: true });

  console.log('=== Videx Taste Profile — Programmatic Test Runner ===\n');

  // Generate all inputs
  const generators: Record<string, (config: any) => TestRunInput[]> = {
    A: generateCategoryA,
    B: generateCategoryB,
    C: generateCategoryC,
    D: generateCategoryD,
    E: generateCategoryE
  };

  let allInputs: TestRunInput[] = [];

  for (const [key, generator] of Object.entries(generators)) {
    if (categoryFilter && categoryFilter.toUpperCase() !== key) continue;
    const inputs = generator(pConfig);
    allInputs = allInputs.concat(inputs);
    console.log(`Generated ${inputs.length} inputs for category ${key}`);
  }

  console.log(`\nTotal inputs: ${allInputs.length}\n`);

  // Execute all runs
  const results: TestRunOutput[] = [];
  let cappedCount = 0;
  let zeroVectorCount = 0;

  for (let i = 0; i < allInputs.length; i++) {
    const input = allInputs[i];
    const result = executeRun(input);
    results.push(result);

    if (result.cappedDimensions.length > 0) cappedCount++;
    if (result.vectorMagnitude < 0.1) zeroVectorCount++;

    if ((i + 1) % 50 === 0 || i === allInputs.length - 1) {
      console.log(`Completed ${i + 1}/${allInputs.length} runs`);
    }
  }

  // Verify determinism (Category E)
  const determinismResults = results.filter(r => r.category === 'E_determinism');
  let determinismPassed = 0;
  let determinismFailed = 0;

  for (let i = 0; i < determinismResults.length; i += 2) {
    if (i + 1 < determinismResults.length) {
      const v1 = determinismResults[i].vector;
      const v2 = determinismResults[i + 1].vector;
      const identical = v1.every((val, idx) => Math.abs(val - v2[idx]) < 1e-10);

      if (identical) {
        determinismPassed++;
      } else {
        determinismFailed++;
        console.warn(`DETERMINISM FAILURE: ${determinismResults[i].id} ≠ ${determinismResults[i + 1].id}`);
      }
    }
  }

  // Aggregate confidence stats
  const allConfMeans = results.map(r => r.confidenceStats.mean);
  const allDimsAbove50 = results.map(r => r.confidenceStats.dimsAbove50);
  const allDimsAbove20 = results.map(r => r.confidenceStats.dimsAbove20);
  const avgConfMean = allConfMeans.reduce((s, v) => s + v, 0) / allConfMeans.length;
  const avgDimsAbove50 = allDimsAbove50.reduce((s, v) => s + v, 0) / allDimsAbove50.length;
  const avgDimsAbove20 = allDimsAbove20.reduce((s, v) => s + v, 0) / allDimsAbove20.length;

  // Quiz blind spots: dims with zero confidence in >80% of runs
  const dimZeroCounts: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) dimZeroCounts[dim] = 0;
  for (const result of results) {
    for (const dim of ALL_DIMENSIONS) {
      if (result.confidenceVector[dim] === 0) dimZeroCounts[dim]++;
    }
  }
  const blindSpotThreshold = results.length * 0.8;
  const quizBlindSpots = ALL_DIMENSIONS
    .filter(dim => dimZeroCounts[dim] > blindSpotThreshold)
    .map(dim => dim as string);

  // Write results
  writeFileSync(
    join(outDir, 'results.json'),
    JSON.stringify(results, null, 2)
  );

  const summary = {
    totalRuns: results.length,
    timestamp: new Date().toISOString(),
    categoryCounts: {
      A_realistic: results.filter(r => r.category === 'A_realistic').length,
      B_answer_extremes: results.filter(r => r.category === 'B_answer_extremes').length,
      C_cluster_extremes: results.filter(r => r.category === 'C_cluster_extremes').length,
      D_mismatch: results.filter(r => r.category === 'D_mismatch').length,
      E_determinism: results.filter(r => r.category === 'E_determinism').length
    },
    flags: {
      runsWithCappedDimensions: cappedCount,
      runsWithNearZeroVector: zeroVectorCount,
      determinismPassed,
      determinismFailed
    },
    confidence: {
      avgConfidenceMean: +avgConfMean.toFixed(4),
      avgDimsAbove50: +avgDimsAbove50.toFixed(1),
      avgDimsAbove20: +avgDimsAbove20.toFixed(1),
      quizBlindSpots,
      perDimensionAvg: Object.fromEntries(
        ALL_DIMENSIONS.map(dim => [
          dim,
          +(results.reduce((s, r) => s + r.confidenceVector[dim], 0) / results.length).toFixed(4)
        ])
      ),
    }
  };

  writeFileSync(
    join(outDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log('\n=== Summary ===');
  console.log(`Total runs: ${summary.totalRuns}`);
  console.log(`Runs with capped dimensions (±0.95): ${cappedCount}`);
  console.log(`Runs with near-zero vector (<0.1 magnitude): ${zeroVectorCount}`);
  console.log(`Determinism checks: ${determinismPassed} passed, ${determinismFailed} failed`);
  console.log(`\n=== Confidence ===`);
  console.log(`Avg confidence mean: ${avgConfMean.toFixed(4)}`);
  console.log(`Avg dims with confidence > 0.5: ${avgDimsAbove50.toFixed(1)} / ${ALL_DIMENSIONS.length}`);
  console.log(`Avg dims with confidence > 0.2: ${avgDimsAbove20.toFixed(1)} / ${ALL_DIMENSIONS.length}`);
  if (quizBlindSpots.length > 0) {
    console.log(`⚠ Quiz blind spots (zero conf in >80% of runs): ${quizBlindSpots.join(', ')}`);
  } else {
    console.log(`No quiz blind spots detected`);
  }
  console.log(`\nResults written to: ${outDir}`);
}

main().catch(console.error);
