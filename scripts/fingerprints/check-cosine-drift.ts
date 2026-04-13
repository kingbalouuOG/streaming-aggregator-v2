/**
 * Phase 2.5 — Cosine Drift Check (WU-2)
 *
 * Parses the Phase 2 baseline pairwise cosine similarity matrix from
 * docs/v2/phase-2-service-discrimination-eval.md, then reads current
 * fingerprints from service_fingerprints and computes fresh pairwise
 * cosines for the original 10 services. Reports max absolute drift.
 *
 * Exit code 1 if any pair drifts more than the threshold (default 0.02).
 * Reusable for every future fingerprint rebuild.
 *
 * Usage:
 *   npx tsx scripts/fingerprints/check-cosine-drift.ts
 *   npx tsx scripts/fingerprints/check-cosine-drift.ts --threshold 0.03
 *
 * Prerequisites (.env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { cosineSimilarity } from '../../supabase/functions/_shared/centroidMath.ts';

// ── Load .env manually (no Vite in script context) ───────

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '..', '..', '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

const ENV = loadEnv();
const SUPABASE_URL = ENV.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Check .env has:');
  console.error('  VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── CLI args ─────────────────────────────────────────────

const args = process.argv.slice(2);
const threshold = args.includes('--threshold')
  ? parseFloat(args[args.indexOf('--threshold') + 1])
  : 0.02;

// ── Parse Phase 2 baseline matrix from markdown ─────────

interface BaselinePair {
  service_a: string;
  service_b: string;
  cosine: number;
}

function parseBaselineMatrix(): BaselinePair[] {
  const reportPath = resolve(__dirname, '..', '..', 'docs', 'v2', 'phase-2-service-discrimination-eval.md');
  const content = readFileSync(reportPath, 'utf-8');
  const lines = content.split('\n');

  // Find the matrix header line: "| | apple | channel4 | ..."
  const headerIdx = lines.findIndex(l =>
    l.startsWith('| |') && l.includes('apple') && l.includes('netflix')
  );
  if (headerIdx === -1) {
    throw new Error('Could not find pairwise cosine similarity matrix header in eval report');
  }

  // Parse column headers
  const headerCells = lines[headerIdx].split('|').map(c => c.trim()).filter(Boolean);
  const colServices = headerCells; // first cell is empty, but filter(Boolean) removes it

  // Skip separator line (|---|---|...)
  const dataStartIdx = headerIdx + 2;

  const pairs: BaselinePair[] = [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break; // end of table

    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) break;

    // Row header: "**apple**" → "apple"
    const rowService = cells[0].replace(/\*\*/g, '');
    const values = cells.slice(1);

    for (let j = 0; j < values.length && j < colServices.length; j++) {
      const colService = colServices[j];
      if (rowService >= colService) continue; // upper triangle only, skip diagonal + lower

      const cosine = parseFloat(values[j]);
      if (isNaN(cosine)) continue;

      pairs.push({ service_a: rowService, service_b: colService, cosine });
    }
  }

  return pairs;
}

// ── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Phase 2.5 — Cosine Drift Check');
  console.log(`  threshold: ${threshold}`);
  console.log();

  // Parse baseline
  const baseline = parseBaselineMatrix();
  console.log(`  baseline pairs parsed: ${baseline.length}`);

  // Get the set of services from the baseline (the original 10)
  const baselineServices = new Set<string>();
  for (const p of baseline) {
    baselineServices.add(p.service_a);
    baselineServices.add(p.service_b);
  }
  console.log(`  baseline services: ${[...baselineServices].sort().join(', ')}`);
  console.log();

  // Fetch current fingerprints for baseline services only
  const { data: fingerprints, error } = await supabase
    .from('service_fingerprints')
    .select('service_id, centroid')
    .eq('region', 'GB')
    .in('service_id', [...baselineServices]);

  if (error) {
    console.error('Failed to fetch fingerprints:', error.message);
    process.exit(1);
  }

  if (!fingerprints || fingerprints.length === 0) {
    console.error('No fingerprints found for baseline services');
    process.exit(1);
  }

  // Parse centroids
  const centroids = new Map<string, number[]>();
  for (const fp of fingerprints) {
    const centroid = typeof fp.centroid === 'string' ? JSON.parse(fp.centroid) : fp.centroid;
    centroids.set(fp.service_id, centroid);
  }

  // Check for missing services
  const missing = [...baselineServices].filter(s => !centroids.has(s));
  if (missing.length > 0) {
    console.error(`Missing fingerprints for baseline services: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Compute current pairwise cosines and compare to baseline
  let maxDrift = 0;
  let maxDriftPair = '';
  const drifted: { pair: string; baseline: number; current: number; drift: number }[] = [];

  for (const bp of baseline) {
    const vecA = centroids.get(bp.service_a)!;
    const vecB = centroids.get(bp.service_b)!;
    const current = cosineSimilarity(vecA, vecB);
    const drift = Math.abs(current - bp.cosine);

    if (drift > maxDrift) {
      maxDrift = drift;
      maxDriftPair = `${bp.service_a} x ${bp.service_b}`;
    }

    if (drift > threshold) {
      drifted.push({
        pair: `${bp.service_a} x ${bp.service_b}`,
        baseline: bp.cosine,
        current: parseFloat(current.toFixed(4)),
        drift: parseFloat(drift.toFixed(4)),
      });
    }
  }

  // Report
  if (drifted.length > 0) {
    console.log(`DRIFT DETECTED — ${drifted.length} pair(s) exceed threshold ${threshold}:`);
    console.log();
    console.log('  Pair                         Baseline  Current   Drift');
    console.log('  ' + '-'.repeat(60));
    for (const d of drifted) {
      const pair = d.pair.padEnd(30);
      console.log(`  ${pair} ${d.baseline.toFixed(4)}    ${d.current.toFixed(4)}    ${d.drift.toFixed(4)}`);
    }
    console.log();
  }

  console.log(`Max drift: ${maxDrift.toFixed(4)} (${maxDriftPair})`);
  console.log(`Threshold: ${threshold}`);
  console.log(`Result: ${maxDrift <= threshold ? 'PASS' : 'FAIL'}`);

  if (maxDrift > threshold) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
