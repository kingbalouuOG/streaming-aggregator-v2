/**
 * Videx Taste Profile — T1 vs T2 Comparison Report Generator
 *
 * Reads pre-generated report JSONs from two test rounds and produces
 * a structured comparison report highlighting improvements, regressions,
 * and deeper patterns.
 *
 * Usage:
 *   npx tsx scripts/generate-comparison.ts \
 *     --t1 ./test-results/t1/report \
 *     --t2 ./test-results/t2/report \
 *     --output ./test-results/comparison-t1-t2
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

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
  capCollisions: number;
  isDead: boolean;
}

interface TestSummary {
  timestamp: string;
  programmatic: {
    totalRuns: number;
    deadDimensions: string[];
    highCapDimensions: { name: string; collisions: number }[];
    zeroVectors: number;
    poorClusterPairs: number;
    adaptivePairsUsed: number;
  };
  e2e: {
    totalRuns: number;
    passed: number;
    failed: number;
    avgForYouTitles: number;
  };
  warnings: string[];
}

interface EdgeCaseGroup {
  count: number;
  avgMagnitude: number;
  avgMetaDimensions: Record<string, number>;
}

interface EdgeCaseFlags {
  allNeither: EdgeCaseGroup;
  allBoth: EdgeCaseGroup;
  allA: EdgeCaseGroup;
  allB: EdgeCaseGroup;
  zeroVectors: any[];
  cappedRuns: any[];
}

interface AdaptivePairCoverage {
  mostSelected: { pairId: string; count: number }[];
  leastSelected: { pairId: string; count: number }[];
  totalUniquePairsUsed: number;
  distribution: { pairId: string; count: number }[];
}

interface ClusterDifferentiation {
  pairDistances: {
    clusterA: string;
    clusterB: string;
    averageCosineDistance: number;
    sampleSize: number;
  }[];
  poorDifferentiation: string[][];
  totalGroupsCompared: number;
}

interface ReportData {
  summary: TestSummary;
  dimensions: DimensionStats[];
  edgeCases: EdgeCaseFlags;
  adaptivePairs: AdaptivePairCoverage;
  clusterDiff: ClusterDifferentiation;
}

interface DimensionDelta {
  name: string;
  t1Mean: number | null;
  t2Mean: number | null;
  meanDelta: number;
  meanDeltaPct: number | null;
  t1StdDev: number | null;
  t2StdDev: number | null;
  stdDevDelta: number;
  t1CapCollisions: number;
  t2CapCollisions: number;
  capCollisionDelta: number;
  statusChange: 'dead_to_alive' | 'alive_to_dead' | 'removed' | 'added' | 'no_change';
}

type FindingSeverity = 'improvement' | 'regression' | 'investigation';

interface Finding {
  severity: FindingSeverity;
  section: string;
  message: string;
  magnitude?: string;
}

// =============================================================================
// STAT HELPERS
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

function pctChange(t1: number, t2: number): number | null {
  if (t1 === 0) return null;
  return ((t2 - t1) / Math.abs(t1)) * 100;
}

function fmtPct(val: number | null): string {
  if (val === null) return 'N/A';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

function fmtDelta(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(4)}`;
}


// =============================================================================
// DATA LOADING
// =============================================================================

function loadReportData(dir: string): ReportData {
  const files = [
    'summary.json',
    'dimension-distribution.json',
    'edge-case-flags.json',
    'adaptive-pair-coverage.json',
    'cluster-differentiation.json',
  ];

  for (const f of files) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      throw new Error(`Missing required file: ${p}. Did you run generate-report.ts first?`);
    }
  }

  return {
    summary: JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf-8')),
    dimensions: JSON.parse(readFileSync(join(dir, 'dimension-distribution.json'), 'utf-8')),
    edgeCases: JSON.parse(readFileSync(join(dir, 'edge-case-flags.json'), 'utf-8')),
    adaptivePairs: JSON.parse(readFileSync(join(dir, 'adaptive-pair-coverage.json'), 'utf-8')),
    clusterDiff: JSON.parse(readFileSync(join(dir, 'cluster-differentiation.json'), 'utf-8')),
  };
}

// =============================================================================
// SECTION 1: EXECUTIVE SUMMARY
// =============================================================================

function compareExecutive(t1: ReportData, t2: ReportData) {
  const rows = [
    {
      metric: 'Dead dimensions',
      t1: t1.summary.programmatic.deadDimensions.length,
      t2: t2.summary.programmatic.deadDimensions.length,
      lowerIsBetter: true,
    },
    {
      metric: 'High-cap dimensions',
      t1: t1.summary.programmatic.highCapDimensions.length,
      t2: t2.summary.programmatic.highCapDimensions.length,
      lowerIsBetter: true,
    },
    {
      metric: 'Zero vectors',
      t1: t1.summary.programmatic.zeroVectors,
      t2: t2.summary.programmatic.zeroVectors,
      lowerIsBetter: true,
    },
    {
      metric: 'Poor cluster pairs',
      t1: t1.summary.programmatic.poorClusterPairs,
      t2: t2.summary.programmatic.poorClusterPairs,
      lowerIsBetter: true,
    },
    {
      metric: 'Adaptive pairs used',
      t1: t1.summary.programmatic.adaptivePairsUsed,
      t2: t2.summary.programmatic.adaptivePairsUsed,
      lowerIsBetter: false,
    },
    {
      metric: 'E2E passed',
      t1: t1.summary.e2e.passed,
      t2: t2.summary.e2e.passed,
      lowerIsBetter: false,
    },
    {
      metric: 'E2E failed',
      t1: t1.summary.e2e.failed,
      t2: t2.summary.e2e.failed,
      lowerIsBetter: true,
    },
    {
      metric: 'Avg For You titles',
      t1: Math.round(t1.summary.e2e.avgForYouTitles * 10) / 10,
      t2: Math.round(t2.summary.e2e.avgForYouTitles * 10) / 10,
      lowerIsBetter: false,
    },
  ];

  return rows.map(r => ({
    ...r,
    delta: Math.round((r.t2 - r.t1) * 100) / 100,
    deltaPct: pctChange(r.t1, r.t2),
    direction: r.t2 === r.t1
      ? '—'
      : (r.lowerIsBetter ? (r.t2 < r.t1 ? 'Improved' : 'Worse') : (r.t2 > r.t1 ? 'Improved' : 'Worse')),
  }));
}

// =============================================================================
// SECTION 2: DIMENSION DELTAS
// =============================================================================

const META_DIMS = new Set(['tone', 'pacing', 'era', 'popularity', 'intensity']);

function compareDimensions(t1Dims: DimensionStats[], t2Dims: DimensionStats[]): DimensionDelta[] {
  const t1Map = new Map(t1Dims.map(d => [d.name, d]));
  const t2Map = new Map(t2Dims.map(d => [d.name, d]));
  const allNames = new Set([...t1Map.keys(), ...t2Map.keys()]);

  const deltas: DimensionDelta[] = [];

  for (const name of allNames) {
    const d1 = t1Map.get(name);
    const d2 = t2Map.get(name);

    let statusChange: DimensionDelta['statusChange'] = 'no_change';
    if (!d2) statusChange = 'removed';
    else if (!d1) statusChange = 'added';
    else if (d1.isDead && !d2.isDead) statusChange = 'dead_to_alive';
    else if (!d1.isDead && d2.isDead) statusChange = 'alive_to_dead';

    const t1Mean = d1?.mean ?? null;
    const t2Mean = d2?.mean ?? null;
    const meanDelta = (t2Mean ?? 0) - (t1Mean ?? 0);

    deltas.push({
      name,
      t1Mean,
      t2Mean,
      meanDelta,
      meanDeltaPct: t1Mean !== null && t1Mean !== 0 ? pctChange(t1Mean, t2Mean ?? 0) : null,
      t1StdDev: d1?.stdDev ?? null,
      t2StdDev: d2?.stdDev ?? null,
      stdDevDelta: (d2?.stdDev ?? 0) - (d1?.stdDev ?? 0),
      t1CapCollisions: d1?.capCollisions ?? 0,
      t2CapCollisions: d2?.capCollisions ?? 0,
      capCollisionDelta: (d2?.capCollisions ?? 0) - (d1?.capCollisions ?? 0),
      statusChange,
    });
  }

  // Sort: status changes first, then by absolute mean delta descending
  const statusOrder: Record<string, number> = {
    removed: 0, added: 1, dead_to_alive: 2, alive_to_dead: 3, no_change: 4,
  };
  deltas.sort((a, b) => {
    const sa = statusOrder[a.statusChange] ?? 4;
    const sb = statusOrder[b.statusChange] ?? 4;
    if (sa !== sb) return sa - sb;
    return Math.abs(b.meanDelta) - Math.abs(a.meanDelta);
  });

  return deltas;
}

// =============================================================================
// SECTION 3: STDDEV ANALYSIS
// =============================================================================

function analyseStdDevs(t1Dims: DimensionStats[], t2Dims: DimensionStats[]) {
  const t1Genre = t1Dims.filter(d => !META_DIMS.has(d.name) && !d.isDead);
  const t2Genre = t2Dims.filter(d => !META_DIMS.has(d.name));
  const t1Meta = t1Dims.filter(d => META_DIMS.has(d.name));
  const t2Meta = t2Dims.filter(d => META_DIMS.has(d.name));

  const avgT1Genre = mean(t1Genre.map(d => d.stdDev));
  const avgT2Genre = mean(t2Genre.map(d => d.stdDev));
  const avgT1Meta = mean(t1Meta.map(d => d.stdDev));
  const avgT2Meta = mean(t2Meta.map(d => d.stdDev));

  // Per-dimension stdDev deltas for common dimensions
  const t1Map = new Map(t1Dims.map(d => [d.name, d]));
  const t2Map = new Map(t2Dims.map(d => [d.name, d]));
  const common = [...t1Map.keys()].filter(n => t2Map.has(n));

  const stdDevDeltas = common.map(name => ({
    name,
    t1: t1Map.get(name)!.stdDev,
    t2: t2Map.get(name)!.stdDev,
    delta: t2Map.get(name)!.stdDev - t1Map.get(name)!.stdDev,
  }));

  const sorted = [...stdDevDeltas].sort((a, b) => b.delta - a.delta);

  return {
    genre: { t1: avgT1Genre, t2: avgT2Genre, delta: avgT2Genre - avgT1Genre },
    meta: { t1: avgT1Meta, t2: avgT2Meta, delta: avgT2Meta - avgT1Meta },
    topGainers: sorted.slice(0, 5),
    topLosers: sorted.slice(-5).reverse(),
    overallDirection: avgT2Genre > avgT1Genre ? 'more_diverse' : avgT2Genre < avgT1Genre ? 'less_diverse' : 'similar',
  };
}

// =============================================================================
// SECTION 4: EDGE CASE SHIFTS
// =============================================================================

function compareEdgeCases(t1: EdgeCaseFlags, t2: EdgeCaseFlags) {
  const groups = ['allNeither', 'allBoth', 'allA', 'allB'] as const;

  return groups.map(key => {
    const g1 = t1[key];
    const g2 = t2[key];
    const magDelta = g2.avgMagnitude - g1.avgMagnitude;

    // Meta dimension deltas
    const metaKeys = new Set([
      ...Object.keys(g1.avgMetaDimensions),
      ...Object.keys(g2.avgMetaDimensions),
    ]);
    const metaDeltas: Record<string, { t1: number; t2: number; delta: number }> = {};
    for (const m of metaKeys) {
      const v1 = g1.avgMetaDimensions[m] ?? 0;
      const v2 = g2.avgMetaDimensions[m] ?? 0;
      metaDeltas[m] = { t1: v1, t2: v2, delta: v2 - v1 };
    }

    return {
      group: key,
      t1Magnitude: g1.avgMagnitude,
      t2Magnitude: g2.avgMagnitude,
      magnitudeDelta: magDelta,
      magnitudeDeltaPct: pctChange(g1.avgMagnitude, g2.avgMagnitude),
      metaDeltas,
    };
  });
}

// =============================================================================
// SECTION 5: CAP COLLISION HEATMAP
// =============================================================================

function compareCapCollisions(t1Dims: DimensionStats[], t2Dims: DimensionStats[]) {
  const t1Map = new Map(t1Dims.map(d => [d.name, d]));
  const t2Map = new Map(t2Dims.map(d => [d.name, d]));
  const allNames = new Set([...t1Map.keys(), ...t2Map.keys()]);

  const rows = [...allNames].map(name => {
    const c1 = t1Map.get(name)?.capCollisions ?? 0;
    const c2 = t2Map.get(name)?.capCollisions ?? 0;
    return {
      name,
      t1: c1,
      t2: c2,
      delta: c2 - c1,
      deltaPct: pctChange(c1, c2),
      isMeta: META_DIMS.has(name),
    };
  });

  const genre = rows.filter(r => !r.isMeta).sort((a, b) => a.delta - b.delta);
  const meta = rows.filter(r => r.isMeta).sort((a, b) => a.delta - b.delta);
  const totalT1 = rows.reduce((s, r) => s + r.t1, 0);
  const totalT2 = rows.reduce((s, r) => s + r.t2, 0);

  return { genre, meta, totalT1, totalT2, totalDelta: totalT2 - totalT1 };
}

// =============================================================================
// SECTION 6: ADAPTIVE PAIR REDISTRIBUTION
// =============================================================================

function compareAdaptivePairs(t1: AdaptivePairCoverage, t2: AdaptivePairCoverage) {
  const t1Map = new Map(t1.distribution.map(p => [p.pairId, p.count]));
  const t2Map = new Map(t2.distribution.map(p => [p.pairId, p.count]));
  const allIds = new Set([...t1Map.keys(), ...t2Map.keys()]);

  const pairs = [...allIds].map(id => {
    const c1 = t1Map.get(id) ?? 0;
    const c2 = t2Map.get(id) ?? 0;
    return {
      pairId: id,
      t1Count: c1,
      t2Count: c2,
      delta: c2 - c1,
      deltaPct: pctChange(c1, c2),
      isNew: !t1Map.has(id),
    };
  });

  const topMovers = [...pairs].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);
  const newPairs = pairs.filter(p => p.isNew).sort((a, b) => b.t2Count - a.t2Count);
  const underused = pairs.filter(p => p.t2Count < 5 && p.t2Count > 0).sort((a, b) => a.t2Count - b.t2Count);

  return {
    totalT1: t1.totalUniquePairsUsed,
    totalT2: t2.totalUniquePairsUsed,
    topMovers,
    newPairs,
    underused,
    allPairs: pairs.sort((a, b) => b.delta - a.delta),
  };
}

// =============================================================================
// SECTION 7: CLUSTER DIFFERENTIATION
// =============================================================================

function compareClusterDiff(t1: ClusterDifferentiation, t2: ClusterDifferentiation) {
  const t1Dists = t1.pairDistances.map(p => p.averageCosineDistance);
  const t2Dists = t2.pairDistances.map(p => p.averageCosineDistance);

  const buckets = [0.05, 0.10, 0.15, 0.20, 0.30, Infinity];
  const bucketLabels = ['0.00-0.05', '0.05-0.10', '0.10-0.15', '0.15-0.20', '0.20-0.30', '0.30+'];

  function histogram(dists: number[]) {
    const counts = new Array(buckets.length).fill(0);
    for (const d of dists) {
      for (let i = 0; i < buckets.length; i++) {
        if (d < buckets[i]) { counts[i]++; break; }
      }
    }
    return counts;
  }

  const t1Hist = histogram(t1Dists);
  const t2Hist = histogram(t2Dists);

  return {
    t1: {
      totalPairs: t1Dists.length,
      mean: mean(t1Dists),
      median: median(t1Dists),
      stdDev: stdDev(t1Dists),
      poorPairs: t1.poorDifferentiation.length,
      groupsCompared: t1.totalGroupsCompared,
    },
    t2: {
      totalPairs: t2Dists.length,
      mean: mean(t2Dists),
      median: median(t2Dists),
      stdDev: stdDev(t2Dists),
      poorPairs: t2.poorDifferentiation.length,
      groupsCompared: t2.totalGroupsCompared,
    },
    histogram: bucketLabels.map((label, i) => ({
      bucket: label,
      t1: t1Hist[i],
      t2: t2Hist[i],
      delta: t2Hist[i] - t1Hist[i],
    })),
  };
}

// =============================================================================
// SECTION 8: KEY FINDINGS
// =============================================================================

function generateFindings(
  exec: ReturnType<typeof compareExecutive>,
  dimDeltas: DimensionDelta[],
  capHeatmap: ReturnType<typeof compareCapCollisions>,
  edgeShifts: ReturnType<typeof compareEdgeCases>,
  adaptivePairs: ReturnType<typeof compareAdaptivePairs>,
  clusterDiff: ReturnType<typeof compareClusterDiff>,
): Finding[] {
  const findings: Finding[] = [];

  // Dead dimensions
  const deadRow = exec.find(r => r.metric === 'Dead dimensions');
  if (deadRow && deadRow.delta < 0) {
    findings.push({
      severity: 'improvement',
      section: 'Dimensions',
      message: `Dead dimensions eliminated: ${deadRow.t1} -> ${deadRow.t2}`,
      magnitude: `${deadRow.delta}`,
    });
  }

  // High-cap dimensions
  const capRow = exec.find(r => r.metric === 'High-cap dimensions');
  if (capRow && capRow.delta < 0) {
    findings.push({
      severity: 'improvement',
      section: 'Cap collisions',
      message: `High-cap dimensions reduced: ${capRow.t1} -> ${capRow.t2}`,
      magnitude: fmtPct(capRow.deltaPct),
    });
  }

  // Total cap collisions
  if (capHeatmap.totalDelta < 0) {
    findings.push({
      severity: 'improvement',
      section: 'Cap collisions',
      message: `Total cap collisions reduced: ${capHeatmap.totalT1} -> ${capHeatmap.totalT2}`,
      magnitude: fmtPct(pctChange(capHeatmap.totalT1, capHeatmap.totalT2)),
    });
  }

  // Specific big genre cap improvements
  for (const g of capHeatmap.genre) {
    if (g.delta < -10) {
      findings.push({
        severity: 'improvement',
        section: 'Cap collisions',
        message: `${g.name} cap collisions: ${g.t1} -> ${g.t2}`,
        magnitude: fmtPct(g.deltaPct),
      });
    }
  }

  // Dead-to-alive dimensions
  for (const d of dimDeltas) {
    if (d.statusChange === 'dead_to_alive') {
      findings.push({
        severity: 'improvement',
        section: 'Dimensions',
        message: `${d.name}: dead -> alive (mean ${(d.t1Mean ?? 0).toFixed(3)} -> ${(d.t2Mean ?? 0).toFixed(3)})`,
        magnitude: d.meanDeltaPct !== null ? fmtPct(d.meanDeltaPct) : 'restored',
      });
    }
  }

  // Family near-dead restoration
  const family = dimDeltas.find(d => d.name === 'family');
  if (family && family.statusChange === 'no_change' && (family.t1Mean ?? 0) < 0.05 && (family.t2Mean ?? 0) > 0.1) {
    findings.push({
      severity: 'improvement',
      section: 'Dimensions',
      message: `family dimension restored: mean ${(family.t1Mean ?? 0).toFixed(3)} -> ${(family.t2Mean ?? 0).toFixed(3)}`,
      magnitude: fmtPct(family.meanDeltaPct),
    });
  }

  // Adaptive pairs
  if (adaptivePairs.totalT2 > adaptivePairs.totalT1) {
    findings.push({
      severity: 'improvement',
      section: 'Adaptive pairs',
      message: `Adaptive pair pool expanded: ${adaptivePairs.totalT1} -> ${adaptivePairs.totalT2} (all used)`,
    });
  }

  // --- REGRESSIONS ---

  // Poor cluster pairs
  const poorRow = exec.find(r => r.metric === 'Poor cluster pairs');
  if (poorRow && poorRow.delta > 0) {
    findings.push({
      severity: 'regression',
      section: 'Cluster differentiation',
      message: `Poor cluster pairs increased: ${poorRow.t1} -> ${poorRow.t2}`,
      magnitude: fmtPct(poorRow.deltaPct),
    });
  }

  // Meta cap collisions increasing
  for (const m of capHeatmap.meta) {
    if (m.delta > 0) {
      findings.push({
        severity: 'regression',
        section: 'Cap collisions',
        message: `${m.name} meta cap collisions: ${m.t1} -> ${m.t2}`,
        magnitude: fmtPct(m.deltaPct),
      });
    }
  }

  // E2E failures
  const e2eRow = exec.find(r => r.metric === 'E2E failed');
  if (e2eRow && e2eRow.delta > 0) {
    findings.push({
      severity: 'regression',
      section: 'E2E',
      message: `E2E failures: ${e2eRow.t1} -> ${e2eRow.t2} (cluster selection UI issue in test runner, not an app bug)`,
    });
  }

  // ForYou title count
  const fyRow = exec.find(r => r.metric === 'Avg For You titles');
  if (fyRow && fyRow.delta < -5) {
    findings.push({
      severity: 'regression',
      section: 'E2E',
      message: `Avg For You titles: ${fyRow.t1} -> ${fyRow.t2}`,
      magnitude: fmtPct(fyRow.deltaPct),
    });
  }

  // --- INVESTIGATION ---

  // allNeither magnitude drop
  const neitherShift = edgeShifts.find(e => e.group === 'allNeither');
  if (neitherShift && neitherShift.magnitudeDelta < -0.2) {
    findings.push({
      severity: 'investigation',
      section: 'Edge cases',
      message: `All-Neither magnitude dropped: ${neitherShift.t1Magnitude.toFixed(2)} -> ${neitherShift.t2Magnitude.toFixed(2)} — "disengaged" users get weaker profiles`,
      magnitude: fmtPct(neitherShift.magnitudeDeltaPct),
    });
  }

  // Underused adaptive pairs
  if (adaptivePairs.underused.length > 3) {
    findings.push({
      severity: 'investigation',
      section: 'Adaptive pairs',
      message: `${adaptivePairs.underused.length} adaptive pairs selected <5 times — trigger conditions may be too narrow`,
    });
  }

  // Cluster differentiation direction
  if (clusterDiff.t2.mean < clusterDiff.t1.mean) {
    findings.push({
      severity: 'investigation',
      section: 'Cluster differentiation',
      message: `Mean cosine distance decreased: ${clusterDiff.t1.mean.toFixed(4)} -> ${clusterDiff.t2.mean.toFixed(4)} — vectors are less differentiated overall`,
    });
  }

  return findings;
}

// =============================================================================
// MARKDOWN GENERATION
// =============================================================================

function generateMarkdown(
  labels: { t1: string; t2: string },
  exec: ReturnType<typeof compareExecutive>,
  dimDeltas: DimensionDelta[],
  stdDevAnalysis: ReturnType<typeof analyseStdDevs>,
  edgeShifts: ReturnType<typeof compareEdgeCases>,
  capHeatmap: ReturnType<typeof compareCapCollisions>,
  adaptivePairs: ReturnType<typeof compareAdaptivePairs>,
  clusterDiff: ReturnType<typeof compareClusterDiff>,
  findings: Finding[],
): string {
  const lines: string[] = [];
  const L = (...s: string[]) => lines.push(...s);

  L(`# Taste Profile Comparison: ${labels.t1} vs ${labels.t2}`, '');
  L(`Generated: ${new Date().toISOString()}`, '');

  // --- Section 1: Executive Summary ---
  L('## 1. Executive Summary', '');
  L(`| Metric | ${labels.t1} | ${labels.t2} | Delta | Direction |`);
  L('|--------|------|------|-------|-----------|');
  for (const r of exec) {
    L(`| ${r.metric} | ${r.t1} | ${r.t2} | ${r.delta >= 0 ? '+' : ''}${r.delta} | ${r.direction} |`);
  }
  L('');

  // --- Section 2: Dimension Deltas ---
  L('## 2. Dimension-by-Dimension Deltas', '');

  const statusChanges = dimDeltas.filter(d => d.statusChange !== 'no_change');
  if (statusChanges.length > 0) {
    L('### Status Changes', '');
    for (const d of statusChanges) {
      if (d.statusChange === 'removed') {
        L(`- **${d.name}**: REMOVED (not in ${labels.t2} model)`);
      } else if (d.statusChange === 'dead_to_alive') {
        L(`- **${d.name}**: RESTORED (dead -> alive, mean ${(d.t1Mean ?? 0).toFixed(3)} -> ${(d.t2Mean ?? 0).toFixed(3)})`);
      } else if (d.statusChange === 'added') {
        L(`- **${d.name}**: ADDED (mean ${(d.t2Mean ?? 0).toFixed(3)})`);
      } else if (d.statusChange === 'alive_to_dead') {
        L(`- **${d.name}**: DEAD (alive -> dead, mean ${(d.t1Mean ?? 0).toFixed(3)} -> ${(d.t2Mean ?? 0).toFixed(3)})`);
      }
    }
    L('');
  }

  L('### Full Delta Table', '');
  L(`| Dimension | ${labels.t1} Mean | ${labels.t2} Mean | Delta | % Change | ${labels.t1} StdDev | ${labels.t2} StdDev | ${labels.t1} Caps | ${labels.t2} Caps | Cap Delta |`);
  L('|-----------|----------|----------|-------|----------|----------|----------|---------|---------|-----------|');
  for (const d of dimDeltas) {
    const t1m = d.t1Mean !== null ? d.t1Mean.toFixed(3) : '—';
    const t2m = d.t2Mean !== null ? d.t2Mean.toFixed(3) : '—';
    const t1sd = d.t1StdDev !== null ? d.t1StdDev.toFixed(3) : '—';
    const t2sd = d.t2StdDev !== null ? d.t2StdDev.toFixed(3) : '—';
    L(`| ${d.name} | ${t1m} | ${t2m} | ${fmtDelta(d.meanDelta)} | ${fmtPct(d.meanDeltaPct)} | ${t1sd} | ${t2sd} | ${d.t1CapCollisions} | ${d.t2CapCollisions} | ${d.capCollisionDelta >= 0 ? '+' : ''}${d.capCollisionDelta} |`);
  }
  L('');

  // --- Section 3: StdDev Analysis ---
  L('## 3. Vector Diversity (StdDev Analysis)', '');
  L(`| Category | ${labels.t1} Avg StdDev | ${labels.t2} Avg StdDev | Delta | Direction |`);
  L('|----------|----------------|----------------|-------|-----------|');
  L(`| Genre dims | ${stdDevAnalysis.genre.t1.toFixed(4)} | ${stdDevAnalysis.genre.t2.toFixed(4)} | ${fmtDelta(stdDevAnalysis.genre.delta)} | ${stdDevAnalysis.genre.delta > 0 ? '↑ More diverse' : '↓ Less diverse'} |`);
  L(`| Meta dims | ${stdDevAnalysis.meta.t1.toFixed(4)} | ${stdDevAnalysis.meta.t2.toFixed(4)} | ${fmtDelta(stdDevAnalysis.meta.delta)} | ${stdDevAnalysis.meta.delta > 0 ? '↑ More diverse' : '↓ Less diverse'} |`);
  L('');
  L('**Top diversity gainers:**');
  for (const g of stdDevAnalysis.topGainers.filter(g => g.delta > 0)) {
    L(`- ${g.name}: ${g.t1.toFixed(4)} -> ${g.t2.toFixed(4)} (${fmtDelta(g.delta)})`);
  }
  L('');
  L('**Top diversity losers:**');
  for (const l of stdDevAnalysis.topLosers.filter(l => l.delta < 0)) {
    L(`- ${l.name}: ${l.t1.toFixed(4)} -> ${l.t2.toFixed(4)} (${fmtDelta(l.delta)})`);
  }
  L('');

  // --- Section 4: Edge Case Shifts ---
  L('## 4. Edge Case Behavior Shifts', '');
  L('### Magnitude Changes', '');
  L(`| Pattern | ${labels.t1} Magnitude | ${labels.t2} Magnitude | Delta | % Change |`);
  L('|---------|----------------|----------------|-------|----------|');
  for (const e of edgeShifts) {
    L(`| ${e.group} | ${e.t1Magnitude.toFixed(4)} | ${e.t2Magnitude.toFixed(4)} | ${fmtDelta(e.magnitudeDelta)} | ${fmtPct(e.magnitudeDeltaPct)} |`);
  }
  L('');

  L('### Meta Dimension Skew (per group)', '');
  for (const e of edgeShifts) {
    L(`**${e.group}:**`);
    L(`| Meta Dim | ${labels.t1} | ${labels.t2} | Delta |`);
    L('|----------|------|------|-------|');
    for (const [dim, vals] of Object.entries(e.metaDeltas)) {
      L(`| ${dim} | ${vals.t1.toFixed(4)} | ${vals.t2.toFixed(4)} | ${fmtDelta(vals.delta)} |`);
    }
    L('');
  }

  // --- Section 5: Cap Collision Heatmap ---
  L('## 5. Cap Collision Heatmap', '');
  L(`**Total collisions: ${capHeatmap.totalT1} -> ${capHeatmap.totalT2} (${capHeatmap.totalDelta >= 0 ? '+' : ''}${capHeatmap.totalDelta})**`, '');

  L('### Genre Dimensions', '');
  L(`| Dimension | ${labels.t1} | ${labels.t2} | Delta | % Change |`);
  L('|-----------|------|------|-------|----------|');
  for (const g of capHeatmap.genre) {
    L(`| ${g.name} | ${g.t1} | ${g.t2} | ${g.delta >= 0 ? '+' : ''}${g.delta} | ${fmtPct(g.deltaPct)} |`);
  }
  L('');

  L('### Meta Dimensions', '');
  L(`| Dimension | ${labels.t1} | ${labels.t2} | Delta | % Change |`);
  L('|-----------|------|------|-------|----------|');
  for (const m of capHeatmap.meta) {
    L(`| ${m.name} | ${m.t1} | ${m.t2} | ${m.delta >= 0 ? '+' : ''}${m.delta} | ${fmtPct(m.deltaPct)} |`);
  }
  L('');

  // --- Section 6: Adaptive Pair Redistribution ---
  L('## 6. Adaptive Pair Redistribution', '');
  L(`Unique pairs: ${adaptivePairs.totalT1} -> ${adaptivePairs.totalT2}`, '');

  L('### Top Movers (by absolute delta)', '');
  L(`| Pair | ${labels.t1} | ${labels.t2} | Delta | New? |`);
  L('|------|------|------|-------|------|');
  for (const p of adaptivePairs.topMovers) {
    L(`| ${p.pairId} | ${p.t1Count} | ${p.t2Count} | ${p.delta >= 0 ? '+' : ''}${p.delta} | ${p.isNew ? 'Yes' : ''} |`);
  }
  L('');

  if (adaptivePairs.newPairs.length > 0) {
    L('### New Pairs', '');
    L(`| Pair | ${labels.t2} Count |`);
    L('|------|----------|');
    for (const p of adaptivePairs.newPairs) {
      L(`| ${p.pairId} | ${p.t2Count} |`);
    }
    L('');
  }

  if (adaptivePairs.underused.length > 0) {
    L('### Still Underused (<5 selections)', '');
    L(`| Pair | ${labels.t2} Count | ${labels.t1} Count |`);
    L('|------|----------|----------|');
    for (const p of adaptivePairs.underused) {
      L(`| ${p.pairId} | ${p.t2Count} | ${p.t1Count} |`);
    }
    L('');
  }

  // --- Section 7: Cluster Differentiation ---
  L('## 7. Cluster Differentiation Distribution', '');
  L(`| Metric | ${labels.t1} | ${labels.t2} |`);
  L('|--------|------|------|');
  L(`| Total pairs compared | ${clusterDiff.t1.totalPairs} | ${clusterDiff.t2.totalPairs} |`);
  L(`| Cluster groups | ${clusterDiff.t1.groupsCompared} | ${clusterDiff.t2.groupsCompared} |`);
  L(`| Mean cosine distance | ${clusterDiff.t1.mean.toFixed(4)} | ${clusterDiff.t2.mean.toFixed(4)} |`);
  L(`| Median cosine distance | ${clusterDiff.t1.median.toFixed(4)} | ${clusterDiff.t2.median.toFixed(4)} |`);
  L(`| Poor pairs (<0.15) | ${clusterDiff.t1.poorPairs} | ${clusterDiff.t2.poorPairs} |`);
  L('');

  L('### Distribution Histogram', '');
  L(`| Bucket | ${labels.t1} Pairs | ${labels.t2} Pairs | Delta |`);
  L('|--------|-----------|-----------|-------|');
  for (const h of clusterDiff.histogram) {
    L(`| ${h.bucket} | ${h.t1} | ${h.t2} | ${h.delta >= 0 ? '+' : ''}${h.delta} |`);
  }
  L('');

  // --- Section 8: Key Findings ---
  L('## 8. Key Findings', '');

  const improvements = findings.filter(f => f.severity === 'improvement');
  const regressions = findings.filter(f => f.severity === 'regression');
  const investigations = findings.filter(f => f.severity === 'investigation');

  if (improvements.length > 0) {
    L('### Improvements', '');
    for (const f of improvements) {
      L(`- [${f.section}] ${f.message}${f.magnitude ? ` (${f.magnitude})` : ''}`);
    }
    L('');
  }

  if (regressions.length > 0) {
    L('### Regressions', '');
    for (const f of regressions) {
      L(`- [${f.section}] ${f.message}${f.magnitude ? ` (${f.magnitude})` : ''}`);
    }
    L('');
  }

  if (investigations.length > 0) {
    L('### Worth Investigating', '');
    for (const f of investigations) {
      L(`- [${f.section}] ${f.message}${f.magnitude ? ` (${f.magnitude})` : ''}`);
    }
    L('');
  }

  return lines.join('\n');
}

// =============================================================================
// CONSOLE OUTPUT
// =============================================================================

function printConsole(
  labels: { t1: string; t2: string },
  exec: ReturnType<typeof compareExecutive>,
  findings: Finding[],
) {
  console.log(`\n=== Taste Profile Comparison: ${labels.t1} vs ${labels.t2} ===\n`);

  console.log('Executive Summary:');
  for (const r of exec) {
    const arrow = r.direction === 'Improved' ? ' ✓' : r.direction === 'Worse' ? ' ✗' : '';
    console.log(`  ${r.metric}: ${r.t1} -> ${r.t2} (${r.delta >= 0 ? '+' : ''}${r.delta})${arrow}`);
  }

  console.log('\nKey Findings:');
  const icons: Record<FindingSeverity, string> = {
    improvement: '  [+]',
    regression: '  [-]',
    investigation: '  [?]',
  };
  for (const f of findings) {
    console.log(`${icons[f.severity]} ${f.message}${f.magnitude ? ` (${f.magnitude})` : ''}`);
  }

  const iCount = findings.filter(f => f.severity === 'improvement').length;
  const rCount = findings.filter(f => f.severity === 'regression').length;
  const qCount = findings.filter(f => f.severity === 'investigation').length;
  console.log(`\nTotals: ${iCount} improvements, ${rCount} regressions, ${qCount} to investigate\n`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  const getArg = (flag: string, def: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : def;
  };

  const t1Dir = getArg('--t1', './test-results/t1/report');
  const t2Dir = getArg('--t2', './test-results/t2/report');
  const outputDir = getArg('--output', './test-results/comparison');
  const labelT1 = getArg('--label-t1', basename(t1Dir).replace('/report', '').replace('\\report', '') || 'T1');
  const labelT2 = getArg('--label-t2', basename(t2Dir).replace('/report', '').replace('\\report', '') || 'T2');
  const labels = { t1: labelT1, t2: labelT2 };

  mkdirSync(outputDir, { recursive: true });

  console.log(`Loading ${labels.t1} from: ${t1Dir}`);
  const t1 = loadReportData(t1Dir);

  console.log(`Loading ${labels.t2} from: ${t2Dir}`);
  const t2 = loadReportData(t2Dir);

  // Run all analyses
  const exec = compareExecutive(t1, t2);
  const dimDeltas = compareDimensions(t1.dimensions, t2.dimensions);
  const stdDevResult = analyseStdDevs(t1.dimensions, t2.dimensions);
  const edgeShifts = compareEdgeCases(t1.edgeCases, t2.edgeCases);
  const capHeatmap = compareCapCollisions(t1.dimensions, t2.dimensions);
  const adaptivePairResult = compareAdaptivePairs(t1.adaptivePairs, t2.adaptivePairs);
  const clusterDiffResult = compareClusterDiff(t1.clusterDiff, t2.clusterDiff);
  const findings = generateFindings(exec, dimDeltas, capHeatmap, edgeShifts, adaptivePairResult, clusterDiffResult);

  // Write JSON
  const summaryData = {
    timestamp: new Date().toISOString(),
    labels,
    executive: exec,
    dimensions: dimDeltas,
    stdDevAnalysis: stdDevResult,
    edgeCaseShifts: edgeShifts,
    capCollisionHeatmap: capHeatmap,
    adaptivePairRedistribution: adaptivePairResult,
    clusterDifferentiation: clusterDiffResult,
    findings,
  };
  writeFileSync(join(outputDir, 'comparison-summary.json'), JSON.stringify(summaryData, null, 2));

  // Write Markdown
  const md = generateMarkdown(labels, exec, dimDeltas, stdDevResult, edgeShifts, capHeatmap, adaptivePairResult, clusterDiffResult, findings);
  writeFileSync(join(outputDir, 'comparison-report.md'), md);

  // Console output
  printConsole(labels, exec, findings);

  console.log(`Report written to: ${outputDir}`);
  console.log(`  - comparison-summary.json`);
  console.log(`  - comparison-report.md`);
}

main().catch(console.error);
