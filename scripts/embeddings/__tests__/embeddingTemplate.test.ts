/**
 * Tests for the shared buildEmbeddingText() module.
 *
 * Run via: npm run test:embeddings
 *           (which is: npx tsx scripts/embeddings/__tests__/embeddingTemplate.test.ts)
 *
 * Uses node:assert/strict — no test runner dependency. Same pattern as
 * scripts/enrichment/extract_fields.test.ts.
 */

import assert from 'node:assert/strict';
import { buildEmbeddingText, type EmbeddingInput } from '../../../supabase/functions/_shared/embeddingTemplate.ts';

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

// ── Helper ──────────────────────────────────────────────────────

function fullInput(): EmbeddingInput {
  return {
    title: 'The Dark Knight',
    release_year: 2008,
    media_type: 'movie',
    genre_ids: [28, 80, 18], // Action, Crime, Drama
    overview: 'Batman raises the stakes in his war on crime.',
    keywords: ['dc comics', 'vigilante', 'superhero'],
    cast_top_5: ['Christian Bale', 'Heath Ledger', 'Aaron Eckhart'],
    runtime: 152,
  };
}

// ── Full data ───────────────────────────────────────────────────

test('full movie: all lines present, correct format', () => {
  const text = buildEmbeddingText(fullInput());
  const lines = text.split('\n');
  assert.equal(lines[0], 'The Dark Knight (2008) - Movie');
  assert.equal(lines[1], 'Genres: Action, Crime, Drama');
  assert.equal(lines[2], 'Overview: Batman raises the stakes in his war on crime.');
  assert.equal(lines[3], 'Keywords: dc comics, vigilante, superhero');
  assert.equal(lines[4], 'Cast: Christian Bale, Heath Ledger, Aaron Eckhart');
  assert.equal(lines[5], 'Runtime: 152 minutes');
  assert.equal(lines.length, 6);
});

test('full TV: media_type displays as TV Series', () => {
  const input = fullInput();
  input.media_type = 'tv';
  input.title = 'Breaking Bad';
  input.genre_ids = [18, 80]; // Drama, Crime
  const text = buildEmbeddingText(input);
  assert.ok(text.startsWith('Breaking Bad (2008) - TV Series'));
});

// ── Empty keywords → line omitted ──────────────────────────────

test('empty keywords: Keywords line omitted', () => {
  const input = fullInput();
  input.keywords = [];
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Keywords:'));
  // Other lines still present
  assert.ok(text.includes('Genres:'));
  assert.ok(text.includes('Cast:'));
});

// ── Empty cast → line omitted ──────────────────────────────────

test('empty cast: Cast line omitted', () => {
  const input = fullInput();
  input.cast_top_5 = [];
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Cast:'));
  assert.ok(text.includes('Keywords:'));
});

// ── NULL runtime → line omitted ─────────────────────────────────

test('null runtime: Runtime line omitted', () => {
  const input = fullInput();
  input.runtime = null;
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Runtime:'));
});

// ── runtime: 0 treated as NULL (Phase 0.5 Deviation 2) ─────────

test('runtime 0: treated as NULL, Runtime line omitted', () => {
  const input = fullInput();
  input.runtime = 0;
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Runtime:'));
});

// ── NULL overview → line omitted ────────────────────────────────

test('null overview: Overview line omitted', () => {
  const input = fullInput();
  input.overview = null;
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Overview:'));
  // 5 lines: header, genres, keywords, cast, runtime
  assert.equal(text.split('\n').length, 5);
});

// ── Empty overview string → line omitted ────────────────────────

test('empty overview string: Overview line omitted', () => {
  const input = fullInput();
  input.overview = '';
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Overview:'));
});

// ── Unknown genre IDs → skipped silently ────────────────────────

test('unknown genre IDs: skipped silently', () => {
  const input = fullInput();
  input.genre_ids = [28, 99999, 80]; // 99999 is not a valid TMDb genre
  const text = buildEmbeddingText(input);
  assert.ok(text.includes('Genres: Action, Crime'));
  assert.ok(!text.includes('99999'));
});

// ── All genre IDs unknown → Genres line omitted ─────────────────

test('all genre IDs unknown: Genres line omitted entirely', () => {
  const input = fullInput();
  input.genre_ids = [99999, 88888];
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Genres:'));
});

// ── Empty genre_ids → Genres line omitted ───────────────────────

test('empty genre_ids: Genres line omitted', () => {
  const input = fullInput();
  input.genre_ids = [];
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Genres:'));
});

// ── Trim at 2000 characters ─────────────────────────────────────

test('trim at 2000 chars: long overview is truncated', () => {
  const input = fullInput();
  input.overview = 'A '.repeat(1500); // 3000 chars
  const text = buildEmbeddingText(input);
  assert.ok(text.length <= 2000);
});

// ── TV-specific genre IDs resolve correctly ─────────────────────

test('TV-specific genres: Action & Adventure, War & Politics', () => {
  const input = fullInput();
  input.media_type = 'tv';
  input.genre_ids = [10759, 10768]; // Action & Adventure, War & Politics
  const text = buildEmbeddingText(input);
  assert.ok(text.includes('Genres: Action & Adventure, War & Politics'));
});

// ── Template fidelity: no Director line even with director data ──

test('template fidelity: no Director line appears in output', () => {
  // Director is intentionally excluded from the §4.1 locked template.
  // This test confirms no "Director:" line appears regardless of what
  // data might be available in the database.
  const input = fullInput();
  const text = buildEmbeddingText(input);
  assert.ok(!text.includes('Director:'));
  assert.ok(!text.includes('Director'));
  // Specifically check it doesn't appear anywhere in the output
  const lines = text.split('\n');
  for (const line of lines) {
    assert.ok(!line.startsWith('Director'), `Unexpected Director line: ${line}`);
  }
});

// ── Minimal input: only header line ─────────────────────────────

test('minimal input: only header line when all optional fields empty/null', () => {
  const input: EmbeddingInput = {
    title: 'Bare',
    release_year: 2020,
    media_type: 'movie',
    genre_ids: [],
    overview: null,
    keywords: [],
    cast_top_5: [],
    runtime: null,
  };
  const text = buildEmbeddingText(input);
  assert.equal(text, 'Bare (2020) - Movie');
});

// ── Summary ─────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
