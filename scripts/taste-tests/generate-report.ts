/**
 * Videx Taste Profile — Report Generator
 *
 * Analyses outputs from both programmatic and E2E test runners
 * and produces aggregate statistics, dimension distributions,
 * and edge case flags.
 *
 * Usage:
 *   node scripts/generate-report.js \
 *     --programmatic ./test-results/programmatic \
 *     --e2e ./test-results/e2e \
 *     --output ./test-results/report
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const SCRIPT_DIR = typeof __dirname !== 'undefined'
  ? __dirname
  : new URL('.', import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(SCRIPT_DIR, 'test-config.json'), 'utf-8'));

// =============================================================================
// TYPES
// =============================================================================

interface DimensionStats {
  name: string;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  capCollisions: number; // times this dimension hit ±0.95
  isDead: boolean; // stdDev < threshold
}

interface ClusterPairDifferentiation {
  clusterA: string;
  clusterB: string;
  averageCosineDistance: number;
  sampleSize: number;
}

// =============================================================================
// STATISTICS HELPERS
// =============================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] ** 2;
    magB += b[i] ** 2;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// =============================================================================
// REPORT GENERATORS
// =============================================================================

function analyseDimensions(results: any[], thresholds: any): DimensionStats[] {
  if (results.length === 0) return [];

  // Get dimension names from first result
  const dimensionNames = Object.keys(results[0].dimensions || {});
  const stats: DimensionStats[] = [];

  for (const name of dimensionNames) {
    const values = results
      .map(r => r.dimensions?.[name])
      .filter(v => v !== undefined && v !== null) as number[];

    if (values.length === 0) continue;

    const sd = stdDev(values);
    const capCollisions = values.filter(v => Math.abs(v) >= thresholds.capCollisionWarning).length;

    stats.push({
      name,
      mean: mean(values),
      median: median(values),
      stdDev: sd,
      min: Math.min(...values),
      max: Math.max(...values),
      capCollisions,
      isDead: sd < thresholds.deadDimensionStdDev
    });
  }

  return stats;
}

function analyseEdgeCases(results: any[]): any {
  const edgeCases: any = {
    allNeither: { count: 0, avgMagnitude: 0, avgMetaDimensions: {} },
    allBoth: { count: 0, avgMagnitude: 0, avgMetaDimensions: {} },
    allA: { count: 0, avgMagnitude: 0, avgMetaDimensions: {} },
    allB: { count: 0, avgMagnitude: 0, avgMetaDimensions: {} },
    zeroVectors: [],
    cappedRuns: []
  };

  const labelMap: Record<string, string> = {
    'all_Neither': 'allNeither',
    'all_Both': 'allBoth',
    'all_A': 'allA',
    'all_B': 'allB'
  };

  for (const result of results) {
    const key = labelMap[result.label];
    if (key) {
      edgeCases[key].count++;
      edgeCases[key].avgMagnitude += result.vectorMagnitude || 0;

      if (result.metaDimensions) {
        for (const [dim, val] of Object.entries(result.metaDimensions)) {
          if (!edgeCases[key].avgMetaDimensions[dim]) {
            edgeCases[key].avgMetaDimensions[dim] = 0;
          }
          edgeCases[key].avgMetaDimensions[dim] += val as number;
        }
      }
    }

    if ((result.vectorMagnitude || 0) < 0.1) {
      edgeCases.zeroVectors.push({
        id: result.id,
        label: result.label,
        magnitude: result.vectorMagnitude
      });
    }

    if (result.cappedDimensions && result.cappedDimensions.length > 0) {
      edgeCases.cappedRuns.push({
        id: result.id,
        label: result.label,
        cappedDimensions: result.cappedDimensions
      });
    }
  }

  // Average out the accumulated values
  for (const key of ['allNeither', 'allBoth', 'allA', 'allB']) {
    if (edgeCases[key].count > 0) {
      edgeCases[key].avgMagnitude /= edgeCases[key].count;
      for (const dim of Object.keys(edgeCases[key].avgMetaDimensions)) {
        edgeCases[key].avgMetaDimensions[dim] /= edgeCases[key].count;
      }
    }
  }

  return edgeCases;
}

function analyseClusterDifferentiation(results: any[], threshold: number): any {
  // Group results by their cluster selections
  const clusterGroups: Record<string, number[][]> = {};

  for (const result of results) {
    if (!result.input?.clusters || !result.vector) continue;
    const key = [...result.input.clusters].sort().join('|');
    if (!clusterGroups[key]) clusterGroups[key] = [];
    clusterGroups[key].push(result.vector);
  }

  // Compute pairwise cosine distances between groups
  const groupKeys = Object.keys(clusterGroups);
  const pairDistances: ClusterPairDifferentiation[] = [];
  const poorDifferentiation: string[][] = [];

  for (let i = 0; i < groupKeys.length; i++) {
    for (let j = i + 1; j < groupKeys.length; j++) {
      const groupA = clusterGroups[groupKeys[i]];
      const groupB = clusterGroups[groupKeys[j]];

      // Average cosine similarity between all pairs
      let totalSim = 0;
      let pairCount = 0;

      for (const vecA of groupA) {
        for (const vecB of groupB) {
          totalSim += cosineSimilarity(vecA, vecB);
          pairCount++;
        }
      }

      const avgSim = pairCount > 0 ? totalSim / pairCount : 0;
      const avgDist = 1 - avgSim;

      pairDistances.push({
        clusterA: groupKeys[i],
        clusterB: groupKeys[j],
        averageCosineDistance: avgDist,
        sampleSize: pairCount
      });

      if (avgDist < threshold) {
        poorDifferentiation.push([groupKeys[i], groupKeys[j]]);
      }
    }
  }

  return {
    pairDistances: pairDistances.sort((a, b) => a.averageCosineDistance - b.averageCosineDistance),
    poorDifferentiation,
    totalGroupsCompared: groupKeys.length
  };
}

function analyseAdaptivePairs(results: any[]): any {
  const pairFrequency: Record<string, number> = {};

  for (const result of results) {
    if (!result.adaptivePairsSelected) continue;
    for (const pairId of result.adaptivePairsSelected) {
      const key = String(pairId);
      pairFrequency[key] = (pairFrequency[key] || 0) + 1;
    }
  }

  const sorted = Object.entries(pairFrequency)
    .map(([pairId, count]) => ({ pairId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    mostSelected: sorted.slice(0, 10),
    leastSelected: sorted.slice(-10).reverse(),
    totalUniquePairsUsed: sorted.length,
    distribution: sorted
  };
}

function analyseConfidenceCoverage(results: any[]): any {
  if (results.length === 0 || !results[0].confidenceVector) {
    return {
      avgConfidenceMean: 0,
      avgDimsAbove50: 0,
      avgDimsAbove20: 0,
      totalDimensions: 0,
      runsWithGoodCoverage: 0,
      quizBlindSpots: [],
      perDimensionAvg: {},
    };
  }

  const dims = Object.keys(results[0].confidenceVector);
  const totalDims = dims.length;

  // Per-dimension averages and zero counts
  const dimSums: Record<string, number> = {};
  const dimZeroCounts: Record<string, number> = {};
  for (const dim of dims) {
    dimSums[dim] = 0;
    dimZeroCounts[dim] = 0;
  }

  let totalConfMean = 0;
  let totalDimsAbove50 = 0;
  let totalDimsAbove20 = 0;
  let runsWithGoodCoverage = 0;

  for (const result of results) {
    const conf = result.confidenceVector;
    const values = dims.map(d => conf[d] as number);
    const runMean = values.reduce((s: number, v: number) => s + v, 0) / values.length;
    const above50 = values.filter((v: number) => v > 0.5).length;
    const above20 = values.filter((v: number) => v > 0.2).length;

    totalConfMean += runMean;
    totalDimsAbove50 += above50;
    totalDimsAbove20 += above20;
    if (above20 > totalDims * 0.5) runsWithGoodCoverage++;

    for (const dim of dims) {
      dimSums[dim] += conf[dim] as number;
      if (conf[dim] === 0) dimZeroCounts[dim]++;
    }
  }

  const n = results.length;
  const blindSpotThreshold = n * 0.8;

  return {
    avgConfidenceMean: totalConfMean / n,
    avgDimsAbove50: totalDimsAbove50 / n,
    avgDimsAbove20: totalDimsAbove20 / n,
    totalDimensions: totalDims,
    runsWithGoodCoverage,
    quizBlindSpots: dims.filter(d => dimZeroCounts[d] > blindSpotThreshold),
    perDimensionAvg: Object.fromEntries(
      dims.map(d => [d, +(dimSums[d] / n).toFixed(4)])
    ),
    perDimensionZeroRate: Object.fromEntries(
      dims.map(d => [d, +(dimZeroCounts[d] / n).toFixed(4)])
    ),
  };
}

function generateDimensionCSV(stats: DimensionStats[]): string {
  const headers = ['dimension', 'mean', 'median', 'std_dev', 'min', 'max', 'cap_collisions', 'is_dead'];
  const rows = stats.map(s => [
    s.name,
    s.mean.toFixed(4),
    s.median.toFixed(4),
    s.stdDev.toFixed(4),
    s.min.toFixed(4),
    s.max.toFixed(4),
    s.capCollisions,
    s.isDead ? 'YES' : 'no'
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  const programmaticDir = args.includes('--programmatic')
    ? args[args.indexOf('--programmatic') + 1]
    : './test-results/programmatic';
  const e2eDir = args.includes('--e2e')
    ? args[args.indexOf('--e2e') + 1]
    : './test-results/e2e';
  const outputDir = args.includes('--output')
    ? args[args.indexOf('--output') + 1]
    : './test-results/report';

  mkdirSync(outputDir, { recursive: true });

  const thresholds = config.report.thresholds;

  console.log('=== Videx Taste Profile — Report Generator ===\n');

  // Load programmatic results
  let programmaticResults: any[] = [];
  const progPath = join(programmaticDir, 'results.json');
  if (existsSync(progPath)) {
    programmaticResults = JSON.parse(readFileSync(progPath, 'utf-8'));
    console.log(`Loaded ${programmaticResults.length} programmatic results`);
  } else {
    console.log('No programmatic results found — skipping');
  }

  // Load E2E results
  let e2eResults: any[] = [];
  const e2ePath = join(e2eDir, 'all-results.json');
  if (existsSync(e2ePath)) {
    e2eResults = JSON.parse(readFileSync(e2ePath, 'utf-8'));
    console.log(`Loaded ${e2eResults.length} E2E results`);
  } else {
    console.log('No E2E results found — skipping');
  }

  // === DIMENSION DISTRIBUTION ===
  console.log('\nAnalysing dimension distributions...');
  const dimensionStats = analyseDimensions(programmaticResults, thresholds);
  writeFileSync(
    join(outputDir, 'dimension-distribution.csv'),
    generateDimensionCSV(dimensionStats)
  );
  writeFileSync(
    join(outputDir, 'dimension-distribution.json'),
    JSON.stringify(dimensionStats, null, 2)
  );

  const deadDimensions = dimensionStats.filter(d => d.isDead);
  if (deadDimensions.length > 0) {
    console.log(`⚠ DEAD DIMENSIONS (std dev < ${thresholds.deadDimensionStdDev}): ${deadDimensions.map(d => d.name).join(', ')}`);
  }

  const highCapDimensions = dimensionStats.filter(d => d.capCollisions > programmaticResults.length * 0.1);
  if (highCapDimensions.length > 0) {
    console.log(`⚠ HIGH CAP COLLISIONS (>10% of runs): ${highCapDimensions.map(d => `${d.name} (${d.capCollisions})`).join(', ')}`);
  }

  // === EDGE CASE FLAGS ===
  console.log('\nAnalysing edge cases...');
  const edgeCases = analyseEdgeCases(programmaticResults);
  writeFileSync(
    join(outputDir, 'edge-case-flags.json'),
    JSON.stringify(edgeCases, null, 2)
  );

  console.log(`  All-Neither avg magnitude: ${edgeCases.allNeither.avgMagnitude.toFixed(4)}`);
  console.log(`  All-Both avg magnitude: ${edgeCases.allBoth.avgMagnitude.toFixed(4)}`);
  console.log(`  Zero vectors (magnitude < 0.1): ${edgeCases.zeroVectors.length}`);
  console.log(`  Runs with capped dimensions: ${edgeCases.cappedRuns.length}`);

  // === CLUSTER DIFFERENTIATION ===
  console.log('\nAnalysing cluster differentiation...');
  const clusterDiff = analyseClusterDifferentiation(
    programmaticResults,
    thresholds.minClusterDifferentiation
  );
  writeFileSync(
    join(outputDir, 'cluster-differentiation.json'),
    JSON.stringify(clusterDiff, null, 2)
  );

  if (clusterDiff.poorDifferentiation.length > 0) {
    console.log(`⚠ POOR DIFFERENTIATION (cosine dist < ${thresholds.minClusterDifferentiation}): ${clusterDiff.poorDifferentiation.length} cluster pairs`);
  }

  // === ADAPTIVE PAIR COVERAGE ===
  console.log('\nAnalysing adaptive pair coverage...');
  const adaptivePairs = analyseAdaptivePairs(programmaticResults);
  writeFileSync(
    join(outputDir, 'adaptive-pair-coverage.json'),
    JSON.stringify(adaptivePairs, null, 2)
  );

  console.log(`  Unique adaptive pairs used: ${adaptivePairs.totalUniquePairsUsed}`);
  if (adaptivePairs.mostSelected.length > 0) {
    console.log(`  Most selected: ${adaptivePairs.mostSelected[0].pairId} (${adaptivePairs.mostSelected[0].count} times)`);
  }

  // === CONFIDENCE COVERAGE ===
  console.log('\nAnalysing confidence coverage...');
  const confidenceCoverage = analyseConfidenceCoverage(programmaticResults);
  writeFileSync(
    join(outputDir, 'confidence-coverage.json'),
    JSON.stringify(confidenceCoverage, null, 2)
  );

  console.log(`  Avg confidence mean: ${confidenceCoverage.avgConfidenceMean.toFixed(4)}`);
  console.log(`  Avg dims with conf > 0.5: ${confidenceCoverage.avgDimsAbove50.toFixed(1)} / ${confidenceCoverage.totalDimensions}`);
  console.log(`  Avg dims with conf > 0.2: ${confidenceCoverage.avgDimsAbove20.toFixed(1)} / ${confidenceCoverage.totalDimensions}`);
  console.log(`  Runs with >50% dims above 0.2: ${confidenceCoverage.runsWithGoodCoverage} / ${programmaticResults.length}`);
  if (confidenceCoverage.quizBlindSpots.length > 0) {
    console.log(`  ⚠ Quiz blind spots (zero conf in >80% of runs): ${confidenceCoverage.quizBlindSpots.join(', ')}`);
  }

  // === E2E SUMMARY ===
  if (e2eResults.length > 0) {
    console.log('\nE2E Results:');
    const passed = e2eResults.filter(r => r.errors.length === 0).length;
    const failed = e2eResults.filter(r => r.errors.length > 0).length;
    console.log(`  Passed: ${passed} | Failed: ${failed}`);

    const avgForYou = mean(e2eResults.map(r => (r.forYouTitles || []).length));
    console.log(`  Avg "For You" titles: ${avgForYou.toFixed(1)}`);

    if (failed > 0) {
      console.log(`  Failed runs:`);
      for (const r of e2eResults.filter(r => r.errors.length > 0)) {
        console.log(`    ${r.id}: ${r.errors[0]}`);
      }
    }
  }

  // === COMBINED SUMMARY ===
  const summary = {
    timestamp: new Date().toISOString(),
    programmatic: {
      totalRuns: programmaticResults.length,
      deadDimensions: deadDimensions.map(d => d.name),
      highCapDimensions: highCapDimensions.map(d => ({ name: d.name, collisions: d.capCollisions })),
      zeroVectors: edgeCases.zeroVectors.length,
      poorClusterPairs: clusterDiff.poorDifferentiation.length,
      adaptivePairsUsed: adaptivePairs.totalUniquePairsUsed
    },
    confidence: {
      avgConfidenceMean: +confidenceCoverage.avgConfidenceMean.toFixed(4),
      avgDimsAbove50: +confidenceCoverage.avgDimsAbove50.toFixed(1),
      avgDimsAbove20: +confidenceCoverage.avgDimsAbove20.toFixed(1),
      quizBlindSpots: confidenceCoverage.quizBlindSpots,
    },
    e2e: {
      totalRuns: e2eResults.length,
      passed: e2eResults.filter(r => r.errors.length === 0).length,
      failed: e2eResults.filter(r => r.errors.length > 0).length,
      avgForYouTitles: e2eResults.length > 0
        ? mean(e2eResults.map(r => (r.forYouTitles || []).length))
        : 0
    },
    warnings: [] as string[]
  };

  // Flag warnings
  if (deadDimensions.length > 0) {
    summary.warnings.push(`${deadDimensions.length} dead dimension(s) detected — these barely vary across inputs`);
  }
  if (edgeCases.zeroVectors.length > 0) {
    summary.warnings.push(`${edgeCases.zeroVectors.length} run(s) produced near-zero vectors — check all-Neither handling`);
  }
  if (highCapDimensions.length > 0) {
    summary.warnings.push(`${highCapDimensions.length} dimension(s) frequently hitting ±0.95 cap — review delta scaling`);
  }
  if (clusterDiff.poorDifferentiation.length > 0) {
    summary.warnings.push(`${clusterDiff.poorDifferentiation.length} cluster pair(s) produce insufficiently distinct vectors`);
  }
  if (confidenceCoverage.quizBlindSpots.length > 0) {
    summary.warnings.push(`Quiz blind spots (zero confidence in >80% of runs): ${confidenceCoverage.quizBlindSpots.join(', ')}`);
  }

  writeFileSync(
    join(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log('\n=== Report Complete ===');
  console.log(`Output: ${outputDir}`);
  if (summary.warnings.length > 0) {
    console.log(`\n⚠ ${summary.warnings.length} warning(s):`);
    for (const w of summary.warnings) {
      console.log(`  • ${w}`);
    }
  }
}

main().catch(console.error);
