/**
 * Interaction Signal Audit
 *
 * Analyses how user interactions shift the taste vector away from the quiz baseline.
 * Runs 6 phases: Data Audit, Vector Replay, Dimension Analysis, Dominance Ratio,
 * Root Cause Scoring, and Fix Simulation.
 *
 * Usage (from project root):
 *   npx tsx scripts/interaction-signal-audit.ts --profile <path.json>
 *   npx tsx --env-file=.env scripts/interaction-signal-audit.ts --supabase --user-id <uuid>
 *
 * The --profile input is a JSON export of the taste profile, obtained from either:
 *   - Browser DevTools: localStorage.getItem('@taste_profile')
 *   - Supabase dashboard export of the taste_profiles row
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ── Imports from Videx source (pure-logic, no browser deps) ─────

import {
  ALL_DIMENSIONS,
  GENRE_DIMENSIONS,
  META_DIMENSIONS,
  DIMENSION_WEIGHTS,
  cosineSimilarity,
  createEmptyVector,
  createEmptyConfidence,
  clampVector,
  blendVector,
  blendVectorAway,
  type TasteVector,
  type ConfidenceVector,
  type Dimension,
} from '../src/lib/taste/tasteVector';

import { computeQuizVector, computeQuizConfidence } from '../src/lib/taste/quizScoring';
import { getQuizPairs } from '../src/lib/taste/quizConfig';
import { arrayToVector, arrayToConfidence } from '../src/lib/taste/vectorSerialisation';

// Type-only import — doesn't execute the module
import type { QuizAnswer, Interaction } from '../src/lib/storage/tasteProfile';

// ── Constants (copied from tasteProfile.ts to avoid browser deps) ─

const LEARNING_RATE = 0.05;

const INTERACTION_WEIGHTS: Record<Interaction['action'], number> = {
  thumbs_up: 1.0,
  thumbs_down: 0.6,
  watchlist_add: 0.3,
  watched: 0.5,
  removed: 0.4,
};

const CONFIDENCE_GAINS: Record<Interaction['action'], number> = {
  thumbs_up: 0.05,
  watched: 0.04,
  thumbs_down: 0.04,
  watchlist_add: 0.02,
  removed: 0.03,
};

function getRecencyWeight(timestampStr: string): number {
  const age = Date.now() - new Date(timestampStr).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days <= 7) return 1.0;
  if (days <= 30) return 0.8;
  if (days <= 90) return 0.5;
  return 0.3;
}

const NEGATIVE_ACTIONS = new Set(['thumbs_down', 'removed']);

// ── Types ───────────────────────────────────────────────────────

interface TasteProfileData {
  vector: TasteVector;
  confidence?: ConfidenceVector;
  quizCompleted: boolean;
  quizAnswers: QuizAnswer[];
  interactionLog: Interaction[];
  lastUpdated: string;
  version: number;
  seedVector?: TasteVector;
}

interface VectorSnapshot {
  index: number;
  contentId: number;
  action: string;
  timestamp: string;
  vectorAfter: TasteVector;
  deltaFromPrevious: Record<Dimension, number>;
}

// ── CLI parsing ─────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  return {
    profilePath: getArg('--profile'),
    useSupabase: args.includes('--supabase'),
    userId: getArg('--user-id'),
    outputDir: getArg('--output') || './scripts/audit-results',
  };
}

// ── Profile loading ─────────────────────────────────────────────

async function loadProfile(opts: ReturnType<typeof parseArgs>): Promise<TasteProfileData> {
  if (opts.profilePath) {
    const raw = readFileSync(opts.profilePath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Detect Supabase format (vector is a number array, not an object)
    if (Array.isArray(parsed.vector)) {
      return {
        vector: arrayToVector(parsed.vector),
        confidence: parsed.confidence ? arrayToConfidence(parsed.confidence) : undefined,
        quizCompleted: parsed.quiz_completed ?? parsed.quizCompleted ?? false,
        quizAnswers: parsed.quiz_answers ?? parsed.quizAnswers ?? [],
        interactionLog: parsed.interaction_log ?? parsed.interactionLog ?? [],
        lastUpdated: parsed.last_updated ?? parsed.lastUpdated ?? '',
        version: parsed.version ?? 1,
        seedVector: parsed.seed_vector ? arrayToVector(parsed.seed_vector) : undefined,
      };
    }

    // localStorage format — vector is already a TasteVector record
    return {
      vector: parsed.vector,
      confidence: parsed.confidence,
      quizCompleted: parsed.quizCompleted ?? false,
      quizAnswers: parsed.quizAnswers ?? [],
      interactionLog: parsed.interactionLog ?? [],
      lastUpdated: parsed.lastUpdated ?? '',
      version: parsed.version ?? 1,
      seedVector: parsed.seedVector,
    };
  }

  if (opts.useSupabase && opts.userId) {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env');

    const client = createClient(url, key);
    const { data, error } = await client
      .from('taste_profiles')
      .select('*')
      .eq('user_id', opts.userId)
      .maybeSingle();
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    if (!data) throw new Error(`No taste_profiles row found for user_id: ${opts.userId}`);

    return {
      vector: arrayToVector(data.vector),
      confidence: data.confidence ? arrayToConfidence(data.confidence) : undefined,
      quizCompleted: data.quiz_completed,
      quizAnswers: data.quiz_answers || [],
      interactionLog: data.interaction_log || [],
      lastUpdated: data.last_updated,
      version: data.version,
      seedVector: data.seed_vector ? arrayToVector(data.seed_vector) : undefined,
    };
  }

  throw new Error('Must provide --profile <path> or --supabase --user-id <uuid>');
}

// ── Helpers ──────────────────────────────────────────────────────

function vectorNorm(a: TasteVector, b: TasteVector): number {
  let sum = 0;
  for (const d of ALL_DIMENSIONS) {
    const diff = a[d] - b[d];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function eraToYearBucket(era: number): string {
  if (era <= -0.6) return 'pre-1985';
  if (era <= -0.2) return '1985-1995';
  if (era < 0.15) return '1995-2010';
  if (era < 0.45) return '2010-2017';
  return '2018+';
}

function pad(s: string | number, w: number, align: 'left' | 'right' = 'left'): string {
  const str = String(s);
  return align === 'right' ? str.padStart(w) : str.padEnd(w);
}

function formatTable(headers: string[], rows: (string | number)[][], colWidths?: number[]): string {
  const widths = colWidths || headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i]).length))
  );
  const sep = widths.map(w => '-'.repeat(w + 2)).join('+');
  const fmt = (row: (string | number)[]) =>
    row.map((cell, i) => ` ${pad(cell, widths[i])} `).join('|');
  return [fmt(headers), sep, ...rows.map(fmt)].join('\n');
}

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0.0%';
}

// ── Phase 1: Data Audit ─────────────────────────────────────────

interface Phase1Result {
  totalInteractions: number;
  actionBreakdown: Record<string, number>;
  contentTypeBreakdown: { movie: number; tv: number };
  eraBuckets: Record<string, number>;
  preModernCount: number;   // era <= 0 (pre-2010 approx)
  modernCount: number;      // era >= 0.3 (post-2015 approx)
  eraRatio: string;
  bulkSessions: { start: string; end: string; count: number }[];
  quizAnswerCount: number;
}

function phase1(profile: TasteProfileData): Phase1Result {
  const log = profile.interactionLog;
  const actionBreakdown: Record<string, number> = {};
  const contentType = { movie: 0, tv: 0 };
  const eraBuckets: Record<string, number> = {};
  let preModern = 0;
  let modern = 0;

  for (const i of log) {
    actionBreakdown[i.action] = (actionBreakdown[i.action] || 0) + 1;
    contentType[i.contentType] = (contentType[i.contentType] || 0) + 1;

    const era = i.contentVector?.era ?? 0;
    const bucket = eraToYearBucket(era);
    eraBuckets[bucket] = (eraBuckets[bucket] || 0) + 1;
    if (era <= 0) preModern++;
    if (era >= 0.3) modern++;
  }

  // Detect bulk sessions (>5 interactions within 60 min)
  const sorted = [...log].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const bulkSessions: Phase1Result['bulkSessions'] = [];
  let sessionStart = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (
      i === sorted.length ||
      new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime() > 60 * 60 * 1000
    ) {
      const count = i - sessionStart;
      if (count > 5) {
        bulkSessions.push({
          start: sorted[sessionStart].timestamp,
          end: sorted[i - 1].timestamp,
          count,
        });
      }
      sessionStart = i;
    }
  }

  return {
    totalInteractions: log.length,
    actionBreakdown,
    contentTypeBreakdown: contentType,
    eraBuckets,
    preModernCount: preModern,
    modernCount: modern,
    eraRatio: modern > 0 ? `${(preModern / modern).toFixed(1)}:1` : `${preModern}:0`,
    bulkSessions,
    quizAnswerCount: profile.quizAnswers.length,
  };
}

function printPhase1(r: Phase1Result) {
  console.log('\n━━━ PHASE 1: DATA AUDIT ━━━\n');
  console.log(`Total interactions: ${r.totalInteractions}`);
  console.log(`Quiz answers: ${r.quizAnswerCount}\n`);

  console.log('Action breakdown:');
  const actionRows = Object.entries(r.actionBreakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([action, count]) => [action, count, pct(count, r.totalInteractions)]);
  console.log(formatTable(['Action', 'Count', '%'], actionRows));

  console.log(`\nContent type: ${r.contentTypeBreakdown.movie} movies, ${r.contentTypeBreakdown.tv} TV\n`);

  console.log('Content era distribution:');
  const eraRows = Object.entries(r.eraBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, count]) => [bucket, count, pct(count, r.totalInteractions)]);
  console.log(formatTable(['Era Bucket', 'Count', '%'], eraRows));

  console.log(`\nPre-2010 (era<=0): ${r.preModernCount} | Post-2015 (era>=0.3): ${r.modernCount} | Ratio: ${r.eraRatio}`);

  if (r.bulkSessions.length > 0) {
    console.log(`\nBulk sessions detected: ${r.bulkSessions.length}`);
    for (const s of r.bulkSessions) {
      const start = new Date(s.start).toLocaleString();
      const end = new Date(s.end).toLocaleString();
      console.log(`  ${start} — ${end} (${s.count} interactions)`);
    }
  } else {
    console.log('\nNo bulk sessions detected (>5 within 60 min)');
  }
}

// ── Phase 2: Vector Replay ──────────────────────────────────────

interface Phase2Result {
  quizBaseline: TasteVector;
  quizBaselineWarning?: string;
  replayA: { timeSeries: VectorSnapshot[]; finalVector: TasteVector };  // no recency (incremental path)
  replayB: { timeSeries: VectorSnapshot[]; finalVector: TasteVector };  // with recency, from quiz baseline (correct)
  replayC: { timeSeries: VectorSnapshot[]; finalVector: TasteVector };  // double-applied (bug reproduction)
  storedVector: TasteVector;
}

function replayInteractions(
  baseVector: TasteVector,
  interactions: Interaction[],
  options: { useRecency: boolean; learningRate?: number; diminishingReturns?: boolean }
): { timeSeries: VectorSnapshot[]; finalVector: TasteVector } {
  let vector = { ...baseVector };
  const timeSeries: VectorSnapshot[] = [];
  const actionCounts: Record<string, number> = {};

  const sorted = [...interactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const lr = options.learningRate ?? LEARNING_RATE;

  for (let idx = 0; idx < sorted.length; idx++) {
    const interaction = sorted[idx];
    const previous = { ...vector };

    const baseWeight = INTERACTION_WEIGHTS[interaction.action];
    const recency = options.useRecency ? getRecencyWeight(interaction.timestamp) : 1.0;

    let effectiveWeight = baseWeight * recency;

    if (options.diminishingReturns) {
      actionCounts[interaction.action] = (actionCounts[interaction.action] || 0) + 1;
      effectiveWeight *= 1 / (1 + Math.log2(actionCounts[interaction.action]));
    }

    const isNegative = NEGATIVE_ACTIONS.has(interaction.action);
    vector = isNegative
      ? blendVectorAway(vector, interaction.contentVector, effectiveWeight, lr)
      : blendVector(vector, interaction.contentVector, effectiveWeight, lr);

    const delta = {} as Record<Dimension, number>;
    for (const d of ALL_DIMENSIONS) {
      delta[d] = vector[d] - previous[d];
    }

    timeSeries.push({
      index: idx,
      contentId: interaction.contentId,
      action: interaction.action,
      timestamp: interaction.timestamp,
      vectorAfter: { ...vector },
      deltaFromPrevious: delta,
    });
  }

  return { timeSeries, finalVector: clampVector(vector) };
}

function phase2(profile: TasteProfileData): Phase2Result {
  const allPairs = getQuizPairs();
  let quizBaseline: TasteVector;
  let warning: string | undefined;

  if (profile.quizCompleted && profile.quizAnswers.length > 0) {
    const seed = profile.seedVector || createEmptyVector();
    if (!profile.seedVector) {
      warning = 'No seedVector available — using empty vector as quiz base (imprecise for cluster-seeded profiles)';
    }
    quizBaseline = computeQuizVector(seed, profile.quizAnswers, allPairs);
  } else {
    quizBaseline = createEmptyVector();
    for (const d of GENRE_DIMENSIONS) {
      if (profile.vector[d] > 0) quizBaseline[d] = 0.2;
    }
    warning = 'No quiz answers — using genre-default vector as baseline';
  }

  // Replay (a): no recency — matches incremental recordInteraction() path
  const replayA = replayInteractions(quizBaseline, profile.interactionLog, { useRecency: false });

  // Replay (b): with recency, from quiz baseline — what recomputeVector() SHOULD do
  const replayB = replayInteractions(quizBaseline, profile.interactionLog, { useRecency: true });

  // Replay (c): double-applied — starts from replay-A result, replays again with recency
  // This matches the current bugged recomputeVector() behavior
  const replayC = replayInteractions(replayA.finalVector, profile.interactionLog, { useRecency: true });

  return {
    quizBaseline,
    quizBaselineWarning: warning,
    replayA,
    replayB,
    replayC,
    storedVector: profile.vector,
  };
}

function printPhase2(r: Phase2Result) {
  console.log('\n━━━ PHASE 2: VECTOR REPLAY ━━━\n');
  if (r.quizBaselineWarning) console.log(`WARNING: ${r.quizBaselineWarning}\n`);

  const headers = ['Dimension', 'Quiz', 'Replay-A', 'Replay-B', 'Replay-C', 'Stored'];
  const rows = ALL_DIMENSIONS.map(d => [
    d,
    r.quizBaseline[d].toFixed(3),
    r.replayA.finalVector[d].toFixed(3),
    r.replayB.finalVector[d].toFixed(3),
    r.replayC.finalVector[d].toFixed(3),
    r.storedVector[d].toFixed(3),
  ]);
  console.log(formatTable(headers, rows));

  console.log('\nReplay key:');
  console.log('  A = no recency (incremental path as-built)');
  console.log('  B = with recency from quiz baseline (correct behavior)');
  console.log('  C = double-applied from A (current recomputeVector bug)');
}

// ── Phase 3: Dimension Analysis ─────────────────────────────────

interface Phase3Result {
  metaDimensions: {
    dimension: string;
    quizValue: number;
    currentValue: number;
    delta: number;
    direction: string;
    weight: number;
  }[];
  eraAnalysis: {
    avgEraAcrossInteractions: number;
    pushingNegative: number;
    pushingPositive: number;
    pushingNeutral: number;
    quizEra: number;
    currentEra: number;
    eraDelta: number;
  };
  genreShifts: { dimension: string; quizValue: number; currentValue: number; delta: number }[];
  euclideanPerDimension: Record<string, number>;
  totalEuclidean: number;
}

function phase3(quizBaseline: TasteVector, currentVector: TasteVector, interactions: Interaction[]): Phase3Result {
  // Meta dimension analysis
  const metaDims = META_DIMENSIONS.map(d => {
    const delta = currentVector[d] - quizBaseline[d];
    return {
      dimension: d,
      quizValue: quizBaseline[d],
      currentValue: currentVector[d],
      delta,
      direction: Math.abs(delta) < 0.01 ? 'stable' : delta > 0 ? 'pushed_positive' : 'pushed_negative',
      weight: DIMENSION_WEIGHTS[d],
    };
  });

  // Era analysis
  let eraSum = 0;
  let eraNeg = 0;
  let eraPos = 0;
  let eraNeutral = 0;
  for (const i of interactions) {
    const era = i.contentVector?.era ?? 0;
    eraSum += era;
    if (era < -0.05) eraNeg++;
    else if (era > 0.05) eraPos++;
    else eraNeutral++;
  }

  // Genre shifts
  const genreShifts = GENRE_DIMENSIONS.map(d => ({
    dimension: d,
    quizValue: quizBaseline[d],
    currentValue: currentVector[d],
    delta: Math.abs(currentVector[d] - quizBaseline[d]),
  })).sort((a, b) => b.delta - a.delta);

  // Euclidean per dimension
  const euclidean: Record<string, number> = {};
  let totalSq = 0;
  for (const d of ALL_DIMENSIONS) {
    const diff = currentVector[d] - quizBaseline[d];
    euclidean[d] = Math.abs(diff);
    totalSq += diff * diff;
  }

  return {
    metaDimensions: metaDims,
    eraAnalysis: {
      avgEraAcrossInteractions: interactions.length > 0 ? eraSum / interactions.length : 0,
      pushingNegative: eraNeg,
      pushingPositive: eraPos,
      pushingNeutral: eraNeutral,
      quizEra: quizBaseline.era,
      currentEra: currentVector.era,
      eraDelta: currentVector.era - quizBaseline.era,
    },
    genreShifts,
    euclideanPerDimension: euclidean,
    totalEuclidean: Math.sqrt(totalSq),
  };
}

function printPhase3(r: Phase3Result) {
  console.log('\n━━━ PHASE 3: DIMENSION ANALYSIS ━━━\n');

  console.log('Meta dimensions:');
  const metaRows = r.metaDimensions.map(m => [
    m.dimension, m.quizValue.toFixed(3), m.currentValue.toFixed(3),
    (m.delta >= 0 ? '+' : '') + m.delta.toFixed(3), m.direction, m.weight.toFixed(1),
  ]);
  console.log(formatTable(['Dimension', 'Quiz', 'Current', 'Delta', 'Direction', 'Weight'], metaRows));

  const e = r.eraAnalysis;
  console.log(`\nEra deep dive:`);
  console.log(`  Avg era across interaction content: ${e.avgEraAcrossInteractions.toFixed(3)}`);
  console.log(`  Pushing negative (older): ${e.pushingNegative} | Pushing positive (modern): ${e.pushingPositive} | Neutral: ${e.pushingNeutral}`);
  console.log(`  Quiz era: ${e.quizEra.toFixed(3)} → Current era: ${e.currentEra.toFixed(3)} (delta: ${e.eraDelta >= 0 ? '+' : ''}${e.eraDelta.toFixed(3)})`);

  console.log('\nTop 10 genre shifts from quiz baseline:');
  const genreRows = r.genreShifts.slice(0, 10).map(g => [
    g.dimension, g.quizValue.toFixed(3), g.currentValue.toFixed(3), g.delta.toFixed(3),
  ]);
  console.log(formatTable(['Genre', 'Quiz', 'Current', '|Delta|'], genreRows));

  console.log(`\nTotal Euclidean distance (quiz → current): ${r.totalEuclidean.toFixed(4)}`);
}

// ── Phase 4: Dominance Ratio ────────────────────────────────────

interface Phase4Result {
  quizMagnitude: number;
  interactionMagnitude: number;
  dominanceRatio: number;
  bugAmplification: number;  // replay-C distance / replay-A distance from quiz
  perAction: { action: string; count: number; avgShift: number; totalShift: number }[];
  convergence: { action: string; to50: number; to75: number; to90: number }[];
}

function phase4(
  quizBaseline: TasteVector,
  replayA: TasteVector,
  replayC: TasteVector,
  timeSeries: VectorSnapshot[]
): Phase4Result {
  const empty = createEmptyVector();
  const quizMag = vectorNorm(quizBaseline, empty);
  const interactionMag = vectorNorm(replayA, quizBaseline);
  const bugMag = vectorNorm(replayC, quizBaseline);

  // Per-action breakdown
  const actionMap: Record<string, { count: number; shifts: number[] }> = {};
  for (const snap of timeSeries) {
    if (!actionMap[snap.action]) actionMap[snap.action] = { count: 0, shifts: [] };
    actionMap[snap.action].count++;
    let shiftMag = 0;
    for (const d of ALL_DIMENSIONS) {
      shiftMag += snap.deltaFromPrevious[d] ** 2;
    }
    actionMap[snap.action].shifts.push(Math.sqrt(shiftMag));
  }

  const perAction = Object.entries(actionMap).map(([action, data]) => ({
    action,
    count: data.count,
    avgShift: data.shifts.reduce((a, b) => a + b, 0) / data.shifts.length,
    totalShift: data.shifts.reduce((a, b) => a + b, 0),
  })).sort((a, b) => b.totalShift - a.totalShift);

  // Convergence model: n = log(1-p) / log(1 - weight*lr)
  const convergence = Object.entries(INTERACTION_WEIGHTS).map(([action, weight]) => {
    const step = weight * LEARNING_RATE;
    const calc = (p: number) => step >= 1 ? 1 : Math.ceil(Math.log(1 - p) / Math.log(1 - step));
    return {
      action,
      to50: calc(0.5),
      to75: calc(0.75),
      to90: calc(0.9),
    };
  });

  return {
    quizMagnitude: quizMag,
    interactionMagnitude: interactionMag,
    dominanceRatio: quizMag > 0 ? interactionMag / quizMag : Infinity,
    bugAmplification: interactionMag > 0 ? bugMag / interactionMag : 1,
    perAction,
    convergence,
  };
}

function printPhase4(r: Phase4Result) {
  console.log('\n━━━ PHASE 4: DOMINANCE RATIO ━━━\n');
  console.log(`Quiz signal magnitude (norm from zero):   ${r.quizMagnitude.toFixed(4)}`);
  console.log(`Interaction signal magnitude (from quiz): ${r.interactionMagnitude.toFixed(4)}`);
  console.log(`Dominance ratio: ${r.dominanceRatio.toFixed(2)}x (>1 = interactions dominate quiz)`);
  console.log(`Bug amplification: ${r.bugAmplification.toFixed(2)}x (replay-C / replay-A distance from quiz)`);

  console.log('\nPer-action type shift:');
  const actionRows = r.perAction.map(a => [
    a.action, a.count, a.avgShift.toFixed(4), a.totalShift.toFixed(4),
  ]);
  console.log(formatTable(['Action', 'Count', 'Avg Shift', 'Total Shift'], actionRows));

  console.log('\nConvergence model (same-direction interactions to reach % of target):');
  const convRows = r.convergence.map(c => [c.action, c.to50, c.to75, c.to90]);
  console.log(formatTable(['Action', '50%', '75%', '90%'], convRows));
}

// ── Phase 5: Root Cause Scoring ─────────────────────────────────

interface Phase5Result {
  factors: { factor: string; score: number; evidence: string }[];
  primary: string;
  secondary: string[];
}

function phase5(p1: Phase1Result, p2: Phase2Result, p3: Phase3Result, p4: Phase4Result): Phase5Result {
  const factors: Phase5Result['factors'] = [];

  // Factor: Double-application bug
  const bugScore = Math.min(10, Math.round((p4.bugAmplification - 1) * 20));
  factors.push({
    factor: 'recomputeVector double-application',
    score: Math.max(0, bugScore),
    evidence: `Bug amplifies drift by ${p4.bugAmplification.toFixed(2)}x. Replay-C Euclidean from quiz: ${vectorNorm(p2.replayC.finalVector, p2.quizBaseline).toFixed(4)} vs Replay-A: ${vectorNorm(p2.replayA.finalVector, p2.quizBaseline).toFixed(4)}`,
  });

  // Factor: Bulk import timing
  const bulkScore = p1.bulkSessions.length > 0
    ? Math.min(10, p1.bulkSessions.reduce((s, b) => s + b.count, 0) / p1.totalInteractions * 10)
    : 0;
  factors.push({
    factor: 'Bulk import timing (no recency on incremental)',
    score: Math.round(bulkScore),
    evidence: `${p1.bulkSessions.length} bulk session(s), ${p1.bulkSessions.reduce((s, b) => s + b.count, 0)}/${p1.totalInteractions} interactions in bursts`,
  });

  // Factor: Learning rate
  const thumbsUpConv = p4.convergence.find(c => c.action === 'thumbs_up');
  const thumbsCount = p1.actionBreakdown['thumbs_up'] || 0;
  const lrScore = thumbsUpConv && thumbsCount >= thumbsUpConv.to75 ? 8 : thumbsCount >= (thumbsUpConv?.to50 || 99) ? 6 : 3;
  factors.push({
    factor: 'Learning rate too aggressive (0.1)',
    score: lrScore,
    evidence: `${thumbsCount} thumbs_up interactions vs ${thumbsUpConv?.to75} needed for 75% convergence. Dominance ratio: ${p4.dominanceRatio.toFixed(2)}x`,
  });

  // Factor: Era sensitivity
  const eraRatio = p1.totalInteractions > 0 ? p3.eraAnalysis.pushingNegative / p1.totalInteractions : 0;
  const eraScore = eraRatio > 0.7 && Math.abs(p3.eraAnalysis.eraDelta) > 0.3 ? 7
    : eraRatio > 0.5 ? 5
    : 3;
  factors.push({
    factor: 'Era dimension sensitivity',
    score: eraScore,
    evidence: `${(eraRatio * 100).toFixed(0)}% of interactions push era negative. Era delta: ${p3.eraAnalysis.eraDelta.toFixed(3)}. Era weight in cosine: 0.4`,
  });

  // Factor: No volume decay
  const recencyDiff = vectorNorm(p2.replayA.finalVector, p2.replayB.finalVector);
  const volumeScore = recencyDiff < 0.05 ? 6 : recencyDiff < 0.1 ? 4 : 2;
  factors.push({
    factor: 'No volume-based diminishing returns',
    score: volumeScore,
    evidence: `Replay-A vs Replay-B Euclidean: ${recencyDiff.toFixed(4)} (small = recency adds little differentiation, volume dominates)`,
  });

  // Factor: 60% recommendation weight
  factors.push({
    factor: '60% taste vector weight in recommendations',
    score: p4.dominanceRatio > 2 ? 7 : p4.dominanceRatio > 1 ? 5 : 3,
    evidence: `With dominance ratio ${p4.dominanceRatio.toFixed(2)}x, the 60% taste weight amplifies interaction-driven skew into recommendations`,
  });

  factors.sort((a, b) => b.score - a.score);
  const primary = factors[0].factor;
  const secondary = factors.slice(1).filter(f => f.score >= 5).map(f => f.factor);

  return { factors, primary, secondary };
}

function printPhase5(r: Phase5Result) {
  console.log('\n━━━ PHASE 5: ROOT CAUSE ASSESSMENT ━━━\n');
  const rows = r.factors.map(f => [f.factor, `${f.score}/10`, f.evidence]);
  console.log(formatTable(['Factor', 'Score', 'Evidence'], rows));
  console.log(`\nPrimary cause: ${r.primary}`);
  if (r.secondary.length > 0) {
    console.log(`Secondary causes: ${r.secondary.join(', ')}`);
  }
}

// ── Phase 6: Fix Simulation ─────────────────────────────────────

interface FixSimulation {
  label: string;
  vector: TasteVector;
  dominanceRatio: number;
  eraDelta: number;
  cosineToQuiz: number;
  euclideanFromQuiz: number;
}

interface Phase6Result {
  fixes: FixSimulation[];
}

function phase6(quizBaseline: TasteVector, interactions: Interaction[], confidence?: ConfidenceVector): Phase6Result {
  const empty = createEmptyVector();
  const quizMag = vectorNorm(quizBaseline, empty);
  const fixes: FixSimulation[] = [];

  const evaluate = (label: string, vector: TasteVector): FixSimulation => {
    const interactionMag = vectorNorm(vector, quizBaseline);
    return {
      label,
      vector,
      dominanceRatio: quizMag > 0 ? interactionMag / quizMag : Infinity,
      eraDelta: vector.era - quizBaseline.era,
      cosineToQuiz: cosineSimilarity(quizBaseline, vector, undefined, confidence),
      euclideanFromQuiz: interactionMag,
    };
  };

  // Bug fix only (replay-B: correct recomputation from quiz baseline with recency)
  const bugFix = replayInteractions(quizBaseline, interactions, { useRecency: true });
  fixes.push(evaluate('Bug fix only (correct recompute)', bugFix.finalVector));

  // Fix A: reduced lr = 0.05
  const fixA05 = replayInteractions(quizBaseline, interactions, { useRecency: true, learningRate: 0.05 });
  fixes.push(evaluate('Fix A: lr=0.05', fixA05.finalVector));

  // Fix A: reduced lr = 0.03
  const fixA03 = replayInteractions(quizBaseline, interactions, { useRecency: true, learningRate: 0.03 });
  fixes.push(evaluate('Fix A: lr=0.03', fixA03.finalVector));

  // Fix B: logarithmic diminishing returns (with current lr)
  const fixB = replayInteractions(quizBaseline, interactions, { useRecency: true, diminishingReturns: true });
  fixes.push(evaluate('Fix B: log diminishing returns', fixB.finalVector));

  // Fix A+B combo: lr=0.05 + diminishing
  const fixAB = replayInteractions(quizBaseline, interactions, { useRecency: true, learningRate: 0.05, diminishingReturns: true });
  fixes.push(evaluate('Fix A+B: lr=0.05 + diminishing', fixAB.finalVector));

  return { fixes };
}

function printPhase6(r: Phase6Result) {
  console.log('\n━━━ PHASE 6: FIX SIMULATION ━━━\n');
  const rows = r.fixes.map(f => [
    f.label,
    f.eraDelta >= 0 ? `+${f.eraDelta.toFixed(3)}` : f.eraDelta.toFixed(3),
    f.dominanceRatio.toFixed(2) + 'x',
    f.cosineToQuiz.toString(),
    f.euclideanFromQuiz.toFixed(4),
  ]);
  console.log(formatTable(['Fix', 'Era Delta', 'Dom. Ratio', 'Cosine→Quiz', 'Euclid→Quiz'], rows));
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('=== INTERACTION SIGNAL AUDIT ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Load profile
  const profile = await loadProfile(opts);
  console.log(`Profile loaded: ${profile.interactionLog.length} interactions, quiz ${profile.quizCompleted ? 'completed' : 'not completed'}`);
  console.log(`Stored vector era: ${profile.vector.era?.toFixed(3)}`);

  // Phase 1
  const p1 = phase1(profile);
  printPhase1(p1);

  // Phase 2
  const p2 = phase2(profile);
  printPhase2(p2);

  // Phase 3 — analyse replay-A (what actually happened via incremental path)
  const p3 = phase3(p2.quizBaseline, p2.replayA.finalVector, profile.interactionLog);
  printPhase3(p3);

  // Phase 4
  const p4 = phase4(p2.quizBaseline, p2.replayA.finalVector, p2.replayC.finalVector, p2.replayA.timeSeries);
  printPhase4(p4);

  // Phase 5
  const p5 = phase5(p1, p2, p3, p4);
  printPhase5(p5);

  // Phase 6
  const p6 = phase6(p2.quizBaseline, profile.interactionLog, profile.confidence);
  printPhase6(p6);

  // Write JSON output
  const outDir = opts.outputDir;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'audit-results.json');

  const results = {
    timestamp: new Date().toISOString(),
    profileSummary: {
      totalInteractions: p1.totalInteractions,
      quizCompleted: profile.quizCompleted,
      quizAnswers: p1.quizAnswerCount,
      hasSeedVector: !!profile.seedVector,
    },
    phase1: p1,
    phase2: {
      quizBaseline: p2.quizBaseline,
      quizBaselineWarning: p2.quizBaselineWarning,
      replayAFinal: p2.replayA.finalVector,
      replayBFinal: p2.replayB.finalVector,
      replayCFinal: p2.replayC.finalVector,
      storedVector: p2.storedVector,
      // Full time series included for detailed analysis
      replayATimeSeries: p2.replayA.timeSeries,
    },
    phase3: p3,
    phase4: p4,
    phase5: p5,
    phase6: {
      fixes: p6.fixes.map(f => ({
        label: f.label,
        eraDelta: f.eraDelta,
        dominanceRatio: f.dominanceRatio,
        cosineToQuiz: f.cosineToQuiz,
        euclideanFromQuiz: f.euclideanFromQuiz,
        vector: f.vector,
      })),
    },
  };

  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n━━━ OUTPUT ━━━\nFull results written to: ${outPath}`);
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
