/**
 * Tests for the shared centroidMath module.
 *
 * Run via: npm run test:fingerprints
 *           (which is: npx tsx scripts/fingerprints/__tests__/centroidMath.test.ts)
 *
 * Uses node:assert/strict — no test runner dependency. Same pattern as
 * scripts/embeddings/__tests__/embeddingTemplate.test.ts.
 */

import assert from 'node:assert/strict';
import { computeCentroid, cosineSimilarity, l2Norm } from '../../../supabase/functions/_shared/centroidMath.ts';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── computeCentroid ────────────────────────────────────────────

test('centroid of a single vector returns that vector', () => {
  const v = [1, 2, 3];
  const result = computeCentroid([v]);
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test('centroid of two vectors returns element-wise mean', () => {
  const result = computeCentroid([[0, 0, 4], [0, 0, 8]]);
  assert.deepStrictEqual(result, [0, 0, 6]);
});

test('centroid of identical vectors returns that vector', () => {
  const v = [0.5, -0.3, 1.2];
  const result = computeCentroid([v, v, v]);
  for (let i = 0; i < v.length; i++) {
    assert.ok(Math.abs(result[i] - v[i]) < 1e-10, `dim ${i}: ${result[i]} !== ${v[i]}`);
  }
});

test('centroid of opposing vectors returns midpoint (zero)', () => {
  const result = computeCentroid([[1, 0, 0], [-1, 0, 0]]);
  assert.deepStrictEqual(result, [0, 0, 0]);
});

test('centroid throws on empty input', () => {
  assert.throws(() => computeCentroid([]), /zero vectors/);
});

// ── cosineSimilarity ───────────────────────────────────────────

test('cosine similarity of identical vectors is 1.0', () => {
  const v = [1, 2, 3, 4, 5];
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 1e-10);
});

test('cosine similarity of orthogonal vectors is 0.0', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0])) < 1e-10);
});

test('cosine similarity of opposite vectors is -1.0', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [-1, 0]) - (-1.0)) < 1e-10);
});

test('cosine similarity with zero vector returns 0', () => {
  assert.strictEqual(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
});

test('cosine similarity is scale-invariant', () => {
  const a = [1, 2, 3];
  const b = [4, 5, 6];
  const scaled = [2, 4, 6]; // 2x of a
  assert.ok(Math.abs(cosineSimilarity(a, b) - cosineSimilarity(scaled, b)) < 1e-10);
});

// ── l2Norm ─────────────────────────────────────────────────────

test('l2Norm of unit vector is 1.0', () => {
  assert.ok(Math.abs(l2Norm([1, 0, 0]) - 1.0) < 1e-10);
});

test('l2Norm of [3,4] is 5.0', () => {
  assert.ok(Math.abs(l2Norm([3, 4]) - 5.0) < 1e-10);
});

test('l2Norm of zero vector is 0', () => {
  assert.strictEqual(l2Norm([0, 0, 0]), 0);
});

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
