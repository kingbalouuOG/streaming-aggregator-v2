/**
 * Phase 2.6 — Bottom-Half Variance Eval (WU-2)
 *
 * For each service under each variant (v1_popularity, v2_exclusivity):
 *   1. Compute cosine similarity to all other 12 services
 *   2. Take the bottom 6 (least similar)
 *   3. Compute variance of those 6 values
 *
 * Higher bottom-half variance = sharper discrimination in the tail
 * (the fingerprint can distinguish between "somewhat dissimilar" and
 * "very dissimilar" services more clearly).
 *
 * Gate: v2 improves (higher variance) for >= 8 of 13 services.
 *
 * Usage:
 *   npx tsx scripts/fingerprints/eval-bottom-half-variance.ts
 *
 * Output: docs/v2/phase-2-6-variance-eval.md
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { cosineSimilarity } from '../../supabase/functions/_shared/centroidMath.ts';

// ── Load .env ────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
}

interface ServiceCentroid {
  service_id: string;
  centroid: number[];
}

async function fetchCentroids(variantName: string): Promise<ServiceCentroid[]> {
  const { data, error } = await supabase
    .from('service_fingerprints')
    .select('service_id, centroid')
    .eq('region', 'GB')
    .eq('variant', variantName)
    .order('service_id');

  if (error) throw new Error(`Failed to fetch ${variantName}: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`No fingerprints for ${variantName}`);

  return data.map(row => ({
    service_id: row.service_id,
    centroid: typeof row.centroid === 'string' ? JSON.parse(row.centroid) : row.centroid,
  }));
}

function computeBottomHalfVariance(
  services: ServiceCentroid[],
): Map<string, { bottomSims: number[]; var: number }> {
  const results = new Map<string, { bottomSims: number[]; var: number }>();
  const bottomN = 6; // bottom half of 12 pairwise similarities

  for (const service of services) {
    // Compute cosine similarity to all other services
    const sims: number[] = [];
    for (const other of services) {
      if (other.service_id === service.service_id) continue;
      sims.push(cosineSimilarity(service.centroid, other.centroid));
    }

    // Sort ascending, take bottom 6
    sims.sort((a, b) => a - b);
    const bottomSims = sims.slice(0, bottomN);
    const v = variance(bottomSims);

    results.set(service.service_id, { bottomSims, var: v });
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Phase 2.6 — Bottom-Half Variance Eval\n');

  const v1Services = await fetchCentroids('v1_popularity');
  const v2Services = await fetchCentroids('v2_exclusivity');

  console.log(`  v1 services: ${v1Services.length}`);
  console.log(`  v2 services: ${v2Services.length}\n`);

  const v1Results = computeBottomHalfVariance(v1Services);
  const v2Results = computeBottomHalfVariance(v2Services);

  // Build comparison table
  const allServiceIds = [...v1Results.keys()];
  let improvedCount = 0;

  const rows: { service: string; v1Var: number; v2Var: number; delta: number; improved: boolean }[] = [];

  for (const sid of allServiceIds) {
    const v1 = v1Results.get(sid)!;
    const v2 = v2Results.get(sid)!;
    const delta = v2.var - v1.var;
    const improved = v2.var > v1.var;
    if (improved) improvedCount++;
    rows.push({ service: sid, v1Var: v1.var, v2Var: v2.var, delta, improved });
  }

  // Console output
  console.log('Per-service bottom-half variance:');
  console.log('  Service       v1 variance   v2 variance   Delta       Improved?');
  console.log('  ' + '-'.repeat(70));
  for (const r of rows) {
    const sid = r.service.padEnd(14);
    console.log(`  ${sid} ${r.v1Var.toFixed(6).padStart(12)} ${r.v2Var.toFixed(6).padStart(12)} ${(r.delta >= 0 ? '+' : '') + r.delta.toFixed(6).padStart(11)} ${r.improved ? 'YES' : 'no'}`);
  }
  console.log();

  const meanV1 = rows.reduce((s, r) => s + r.v1Var, 0) / rows.length;
  const meanV2 = rows.reduce((s, r) => s + r.v2Var, 0) / rows.length;
  const meanDelta = meanV2 - meanV1;

  console.log(`  Mean v1 variance: ${meanV1.toFixed(6)}`);
  console.log(`  Mean v2 variance: ${meanV2.toFixed(6)}`);
  console.log(`  Mean delta:       ${(meanDelta >= 0 ? '+' : '')}${meanDelta.toFixed(6)}`);
  console.log(`  Services improved: ${improvedCount} / ${rows.length}`);
  console.log(`  Gate (>= 8):       ${improvedCount >= 8 ? 'PASS' : 'FAIL'}`);

  // Write report
  const reportPath = resolve(__dirname, '..', '..', 'docs', 'v2', 'phase-2-6-variance-eval.md');
  let md = `# Phase 2.6 — Bottom-Half Variance Eval\n\n`;
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  md += `**Services evaluated:** ${rows.length}\n`;
  md += `**Bottom-N:** 6 (least-similar half of 12 pairwise similarities)\n\n`;
  md += `## Per-Service Results\n\n`;
  md += `| Service | v1 bottom-6 variance | v2 bottom-6 variance | Δ | Improved? |\n`;
  md += `|---------|---------------------|---------------------|---|----------|\n`;
  for (const r of rows) {
    const delta = (r.delta >= 0 ? '+' : '') + r.delta.toFixed(6);
    md += `| ${r.service} | ${r.v1Var.toFixed(6)} | ${r.v2Var.toFixed(6)} | ${delta} | ${r.improved ? 'YES' : 'no'} |\n`;
  }
  md += `\n## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Mean v1 variance | ${meanV1.toFixed(6)} |\n`;
  md += `| Mean v2 variance | ${meanV2.toFixed(6)} |\n`;
  md += `| Mean delta | ${(meanDelta >= 0 ? '+' : '')}${meanDelta.toFixed(6)} |\n`;
  md += `| Services improved | ${improvedCount} / ${rows.length} |\n`;
  md += `| **Gate (>= 8)** | **${improvedCount >= 8 ? 'PASS' : 'FAIL'}** |\n`;

  writeFileSync(reportPath, md);
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
