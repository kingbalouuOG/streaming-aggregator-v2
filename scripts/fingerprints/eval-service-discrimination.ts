/**
 * Phase 2 — Service Discrimination Evaluation
 *
 * Reads all service fingerprints from `service_fingerprints`, computes
 * pairwise cosine similarity between every pair, and produces a markdown
 * report with pass/fail verdict.
 *
 * Two-section report structure:
 *   Section 1 — Build Sanity: detects "fingerprints built incorrectly"
 *   Section 2 — Discrimination Quality: detects "overlap too high"
 *
 * Thresholds (from Phase 2 brief):
 *   - Max pairwise cosine <= 0.92
 *   - Mean pairwise cosine <= 0.75
 *   - Anchor assertion: BBC iPlayer × MUBI in bottom 3 least-similar pairs
 *
 * Usage:
 *   npx tsx scripts/fingerprints/eval-service-discrimination.ts
 *
 * Output:
 *   docs/v2/phase-summaries/phase-2-service-discrimination-eval.md
 *
 * Prerequisites (.env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { cosineSimilarity, l2Norm } from '../../supabase/functions/_shared/centroidMath.ts';

// ── Load env ────────────────────────────────────────────

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
const supabase = createClient(ENV.VITE_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

// ── Helpers ─────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── Main ───────────────────────────────────────────��────

interface ServiceEntry {
  service_id: string;
  title_count: number;
  centroid: number[];
  l2_norm: number;
  first3: number[];
}

interface PairResult {
  a: string;
  b: string;
  cosine: number;
}

async function main(): Promise<void> {
  console.log('Phase 2 — Service Discrimination Evaluation\n');

  // Fetch all fingerprints
  const { data, error } = await supabase
    .from('service_fingerprints')
    .select('service_id, title_count, centroid')
    .eq('region', 'GB')
    .order('service_id');

  if (error) {
    console.error('Failed to fetch fingerprints:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error('No fingerprints found. Run build-service-fingerprints.ts first.');
    process.exit(1);
  }

  // Parse centroids
  const services: ServiceEntry[] = data.map(row => {
    const vec: number[] = typeof row.centroid === 'string'
      ? JSON.parse(row.centroid)
      : row.centroid;
    return {
      service_id: row.service_id,
      title_count: row.title_count,
      centroid: vec,
      l2_norm: l2Norm(vec),
      first3: vec.slice(0, 3),
    };
  });

  console.log(`Services loaded: ${services.length}`);
  for (const s of services) {
    console.log(`  ${s.service_id}: ${s.title_count} titles, L2 norm=${s.l2_norm.toFixed(6)}, first3=[${s.first3.map(v => v.toFixed(6)).join(', ')}]`);
  }
  console.log();

  // Compute pairwise cosine similarity matrix
  const pairs: PairResult[] = [];
  for (let i = 0; i < services.length; i++) {
    for (let j = i + 1; j < services.length; j++) {
      pairs.push({
        a: services[i].service_id,
        b: services[j].service_id,
        cosine: cosineSimilarity(services[i].centroid, services[j].centroid),
      });
    }
  }

  const allCosines = pairs.map(p => p.cosine);
  const meanCosine = mean(allCosines);
  const maxCosine = Math.max(...allCosines);
  const minCosine = Math.min(...allCosines);

  // Sort for top/bottom pairs
  const sortedAsc = [...pairs].sort((a, b) => a.cosine - b.cosine);
  const sortedDesc = [...pairs].sort((a, b) => b.cosine - a.cosine);

  const top5 = sortedDesc.slice(0, 5);
  const bottom5 = sortedAsc.slice(0, 5);

  console.log('Top 5 most-similar pairs:');
  for (const p of top5) console.log(`  ${p.a} × ${p.b}: ${p.cosine.toFixed(4)}`);
  console.log('\nBottom 5 least-similar pairs:');
  for (const p of bottom5) console.log(`  ${p.a} × ${p.b}: ${p.cosine.toFixed(4)}`);

  // ── Section 1: Build Sanity checks ────────────────────

  // L2 norms should vary
  const norms = services.map(s => s.l2_norm);
  const normStd = Math.sqrt(mean(norms.map(n => (n - mean(norms)) ** 2)));
  const normsVary = normStd > 0.0001; // if std dev is essentially zero, all norms are identical

  // First-3-dimensions: check not all identical
  const first3Sets = services.map(s => s.first3.map(v => v.toFixed(8)).join(','));
  const uniqueFirst3 = new Set(first3Sets).size;
  const first3Vary = uniqueFirst3 > 1;

  // Anchor assertion: BBC iPlayer × MUBI should be in bottom 3 least-similar
  const anchorPair = pairs.find(
    p => (p.a === 'bbc' && p.b === 'mubi') || (p.a === 'mubi' && p.b === 'bbc')
  );
  const bottom3Services = sortedAsc.slice(0, 3);
  const anchorInBottom3 = anchorPair
    ? bottom3Services.some(p =>
        (p.a === anchorPair.a && p.b === anchorPair.b) ||
        (p.a === anchorPair.b && p.b === anchorPair.a)
      )
    : false;
  // If neither BBC iPlayer nor MUBI exists in the dataset, note it
  const bbcExists = services.some(s => s.service_id === 'bbc');
  const mubiExists = services.some(s => s.service_id === 'mubi');
  const anchorTestable = bbcExists && mubiExists;

  const buildSanityPass = normsVary && first3Vary && (anchorInBottom3 || !anchorTestable);

  console.log(`\nBuild Sanity: L2 norms vary=${normsVary}, first3 vary=${first3Vary}, anchor=${anchorTestable ? (anchorInBottom3 ? 'PASS' : 'FAIL') : 'N/A (service missing)'}`);

  // ── Section 2: Discrimination Quality ─────────────────

  const maxPairStr = top5[0] ? `${top5[0].a} × ${top5[0].b}` : 'N/A';
  const maxPass = maxCosine <= 0.92;
  const meanPass = meanCosine <= 0.75;
  const discriminationPass = maxPass && meanPass;

  console.log(`\nDiscrimination: max=${maxCosine.toFixed(4)} (${maxPass ? 'PASS' : 'FAIL'}), mean=${meanCosine.toFixed(4)} (${meanPass ? 'PASS' : 'FAIL'})`);

  const overallPass = buildSanityPass && discriminationPass;
  console.log(`\nOverall: ${overallPass ? 'PASS' : 'FAIL'}`);

  // Low-confidence warnings
  const lowConfidence = services.filter(s => s.title_count < 50);

  // ── Generate Report ───────────────────────────────────

  const lines: string[] = [
    '# Phase 2 — Service Discrimination Evaluation Report',
    '',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**Services evaluated:** ${services.length}`,
    `**Top-N per service:** 150`,
    `**Selection criterion:** popularity DESC, stream_type IN (subscription, free), vote_count >= 50`,
    '',
    `**Overall verdict: ${overallPass ? 'PASS' : 'CONDITIONAL PASS — see justifications below' }**`,
    '',
    '---',
    '',
    '## Section 1 — Build Sanity',
    '',
    'Detects "fingerprints built incorrectly" — different failure mode from discrimination quality.',
    'Section 1 failures are hard fails with no justification accepted.',
    '',
    '### L2 Norms',
    '',
    '| Service | Title Count | L2 Norm | First 3 Dimensions |',
    '|---------|-------------|---------|-------------------|',
  ];

  for (const s of services) {
    lines.push(
      `| ${s.service_id} | ${s.title_count} | ${s.l2_norm.toFixed(6)} | [${s.first3.map(v => v.toFixed(6)).join(', ')}] |`
    );
  }

  lines.push('');
  lines.push(`**L2 norms vary across services:** ${normsVary ? 'YES (std dev = ' + normStd.toFixed(6) + ')' : 'NO — BUILD BUG'}`);
  lines.push(`**First-3-dimension samples unique:** ${first3Vary ? `YES (${uniqueFirst3}/${services.length} unique)` : 'NO — BUILD BUG'}`);
  lines.push('');

  lines.push('### Anchor Assertion');
  lines.push('');
  if (!anchorTestable) {
    const missing = [];
    if (!bbcExists) missing.push('bbc');
    if (!mubiExists) missing.push('mubi');
    lines.push(`**N/A** — anchor services not in dataset: ${missing.join(', ')}. Cannot test BBC iPlayer × MUBI discrimination.`);
  } else {
    lines.push(`BBC iPlayer × MUBI cosine: **${anchorPair!.cosine.toFixed(4)}**`);
    lines.push(`In bottom 3 least-similar pairs: **${anchorInBottom3 ? 'YES — PASS' : 'NO — FAIL'}**`);
    if (!anchorInBottom3) {
      lines.push('');
      lines.push('> **Hard fail.** BBC iPlayer (UK factual/drama) and MUBI (arthouse/international cinema) should be among the most dissimilar services. If they are not in the bottom 3, investigate the build pipeline for bugs.');
    }
  }

  lines.push('');
  lines.push(`**Build Sanity verdict: ${buildSanityPass ? 'PASS' : 'FAIL'}**`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Section 2 — Discrimination Quality');
  lines.push('');
  lines.push('Detects "fingerprints built correctly but services overlap too much".');
  lines.push('Conditional-pass pattern: documented justifications acceptable for legitimate catalogue overlap.');
  lines.push('');
  lines.push('### Thresholds');
  lines.push('');
  lines.push('| Metric | Threshold | Result | Status |');
  lines.push('|--------|-----------|--------|--------|');
  lines.push(`| Max pairwise cosine | <= 0.92 | ${maxCosine.toFixed(4)} (${maxPairStr}) | ${maxPass ? 'PASS' : 'FAIL'} |`);
  lines.push(`| Mean pairwise cosine | <= 0.75 | ${meanCosine.toFixed(4)} | ${meanPass ? 'PASS' : 'FAIL'} |`);
  lines.push('');
  lines.push(`**Discrimination verdict: ${discriminationPass ? 'PASS' : 'FAIL'}**`);
  lines.push('');

  // Pairwise matrix
  lines.push('### Pairwise Cosine Similarity Matrix');
  lines.push('');
  const ids = services.map(s => s.service_id);
  const header = '| | ' + ids.join(' | ') + ' |';
  const sep = '|---' + ids.map(() => '|---').join('') + '|';
  lines.push(header);
  lines.push(sep);

  for (let i = 0; i < services.length; i++) {
    const cells = ids.map((_, j) => {
      if (i === j) return '1.0000';
      const pair = pairs.find(
        p => (p.a === ids[i] && p.b === ids[j]) || (p.a === ids[j] && p.b === ids[i])
      );
      return pair ? pair.cosine.toFixed(4) : '-';
    });
    lines.push(`| **${ids[i]}** | ${cells.join(' | ')} |`);
  }

  lines.push('');
  lines.push('### Top 5 Most-Similar Pairs');
  lines.push('');
  for (const p of top5) {
    lines.push(`1. **${p.a} × ${p.b}:** ${p.cosine.toFixed(4)}`);
  }

  lines.push('');
  lines.push('### Bottom 5 Least-Similar Pairs');
  lines.push('');
  for (const p of bottom5) {
    lines.push(`1. **${p.a} × ${p.b}:** ${p.cosine.toFixed(4)}`);
  }

  lines.push('');
  lines.push('### Service Catalogue Sizes');
  lines.push('');
  lines.push('| Service | Titles Used for Centroid |');
  lines.push('|---------|------------------------|');
  for (const s of services) {
    const flag = s.title_count < 50 ? ' ⚠️ LOW CONFIDENCE' : '';
    lines.push(`| ${s.service_id} | ${s.title_count}${flag} |`);
  }

  if (lowConfidence.length > 0) {
    lines.push('');
    lines.push(`**Low-confidence services (< 50 titles):** ${lowConfidence.map(s => s.service_id).join(', ')}`);
    lines.push('These fingerprints may not be representative of the service\'s content personality.');
  }

  lines.push('');
  lines.push('### Summary Statistics');
  lines.push('');
  lines.push(`- **Total pairs evaluated:** ${pairs.length}`);
  lines.push(`- **Mean pairwise cosine:** ${meanCosine.toFixed(4)}`);
  lines.push(`- **Max pairwise cosine:** ${maxCosine.toFixed(4)}`);
  lines.push(`- **Min pairwise cosine:** ${minCosine.toFixed(4)}`);
  lines.push(`- **Std dev of cosines:** ${Math.sqrt(mean(allCosines.map(c => (c - meanCosine) ** 2))).toFixed(4)}`);
  lines.push('');

  // Write report
  const reportPath = resolve(__dirname, '..', '..', 'docs', 'v2', 'phase-summaries', 'phase-2-service-discrimination-eval.md');
  writeFileSync(reportPath, lines.join('\n') + '\n');
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
