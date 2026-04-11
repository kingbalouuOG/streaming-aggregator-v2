/**
 * Tests for the shared extractFields() module.
 *
 * Run via: npm run test:enrichment
 *           (which is: npx tsx scripts/enrichment/extract_fields.test.ts)
 *
 * Uses node:assert/strict — no test runner dependency. Each test is a
 * top-level call wrapped in a try/catch so a single failure doesn't
 * mask others. Exit code is non-zero iff any test failed.
 *
 * Fixtures live at scripts/enrichment/fixtures/ and are minimal but
 * shape-faithful TMDb response slices — they exercise only the fields
 * extractFields() reads.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { extractFields } from '../../supabase/functions/_shared/extract_fields.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8'));
}

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

// ── Movie with full data ────────────────────────────────────────

test('movie_full: extracts all five fields', () => {
  const r = extractFields(loadFixture('movie_full.json'), 'movie');
  assert.deepEqual(r.keywords, ['dc comics', 'vigilante', 'superhero', 'anti hero']);
  assert.deepEqual(r.cast_top_5, [
    'Christian Bale',
    'Heath Ledger',
    'Aaron Eckhart',
    'Michael Caine',
    'Maggie Gyllenhaal',
  ]);
  assert.equal(r.director, 'Christopher Nolan');
  assert.equal(r.content_rating, '12A'); // GB beats US
  assert.equal(r.runtime, 152);
});

// ── TV with full data ───────────────────────────────────────────

test('tv_full: director comes from created_by, runtime from episode_run_time[0]', () => {
  const r = extractFields(loadFixture('tv_full.json'), 'tv');
  assert.deepEqual(r.keywords, ['high school teacher', 'new mexico', 'drug dealer']);
  assert.deepEqual(r.cast_top_5, [
    'Bryan Cranston',
    'Aaron Paul',
    'Anna Gunn',
    'Dean Norris',
    'Betsy Brandt',
  ]);
  assert.equal(r.director, 'Vince Gilligan');
  assert.equal(r.content_rating, '18'); // GB
  assert.equal(r.runtime, 45); // first element of episode_run_time
});

// ── Movie with no GB rating falls back to US ────────────────────

test('movie_no_gb_rating: falls back to US certification', () => {
  const r = extractFields(loadFixture('movie_no_gb_rating.json'), 'movie');
  assert.equal(r.content_rating, 'R');
  assert.equal(r.director, 'Alex Indie');
  assert.deepEqual(r.cast_top_5, ['Jane Doe', 'John Smith']);
});

// ── Movie with no crew, no keywords, no release dates ───────────

test('movie_no_crew: missing data produces NULL/empty, never throws', () => {
  const r = extractFields(loadFixture('movie_no_crew.json'), 'movie');
  assert.deepEqual(r.keywords, []);
  assert.deepEqual(r.cast_top_5, ['Unknown Actor One', 'Unknown Actor Two']);
  assert.equal(r.director, null);
  assert.equal(r.content_rating, null);
  assert.equal(r.runtime, 62);
});

// ── TV with empty episode_run_time ──────────────────────────────

test('tv_no_episode_runtime: runtime is NULL when episode_run_time is empty', () => {
  const r = extractFields(loadFixture('tv_no_episode_runtime.json'), 'tv');
  assert.equal(r.runtime, null);
  // Multiple creators joined with ", "
  assert.equal(r.director, 'Showrunner A, Showrunner B');
  // Only US rating present → US is the answer
  assert.equal(r.content_rating, 'TV-14');
});

// ── Movie with fewer than 5 cast and multiple directors ─────────

test('movie_few_cast: cast_top_5 has fewer than 5; multiple directors joined', () => {
  const r = extractFields(loadFixture('movie_few_cast.json'), 'movie');
  assert.deepEqual(r.cast_top_5, ['Lead One', 'Lead Two']);
  assert.equal(r.director, 'Co Director A, Co Director B');
  // First entry has empty certification, second entry has '15' — should
  // pick the first non-empty one.
  assert.equal(r.content_rating, '15');
});

// ── Empty arrays vs NULL distinction ────────────────────────────

test('keywords distinguishes empty array (TMDb returned none) from missing block', () => {
  // movie_no_crew has `keywords: { keywords: [] }` → empty array, not NULL
  const r = extractFields(loadFixture('movie_no_crew.json'), 'movie');
  assert.ok(Array.isArray(r.keywords));
  assert.equal(r.keywords.length, 0);
});

// ── Defensive: bad input throws cleanly ─────────────────────────

test('extractFields throws on null response', () => {
  assert.throws(() => extractFields(null, 'movie'), /non-null object/);
});

test('extractFields throws on bad mediaType', () => {
  assert.throws(
    () => extractFields({}, 'film' as 'movie'),
    /must be 'movie' or 'tv'/
  );
});

// ── Defensive: TMDb shape drift produces NULL/empty, never throws ─

test('extractFields tolerates wholly missing optional blocks', () => {
  const r = extractFields({ id: 1, title: 'Bare' }, 'movie');
  assert.deepEqual(r.keywords, []);
  assert.deepEqual(r.cast_top_5, []);
  assert.equal(r.director, null);
  assert.equal(r.content_rating, null);
  assert.equal(r.runtime, null);
});

test('extractFields tolerates wholly missing optional blocks (TV)', () => {
  const r = extractFields({ id: 1, name: 'Bare' }, 'tv');
  assert.deepEqual(r.keywords, []);
  assert.deepEqual(r.cast_top_5, []);
  assert.equal(r.director, null);
  assert.equal(r.content_rating, null);
  assert.equal(r.runtime, null);
});

// ── Summary ─────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
