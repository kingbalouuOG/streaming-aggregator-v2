/**
 * Tests for the shared buildEmbeddingText() module.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect } from 'vitest';
import { buildEmbeddingText, type EmbeddingInput } from '../../../supabase/functions/_shared/embeddingTemplate.ts';

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

describe('buildEmbeddingText', () => {
  // ── Full data ───────────────────────────────────────────────────

  it('full movie: all lines present, correct format', () => {
    const text = buildEmbeddingText(fullInput());
    const lines = text.split('\n');
    expect(lines[0]).toBe('The Dark Knight (2008) - Movie');
    expect(lines[1]).toBe('Genres: Action, Crime, Drama');
    expect(lines[2]).toBe('Overview: Batman raises the stakes in his war on crime.');
    expect(lines[3]).toBe('Keywords: dc comics, vigilante, superhero');
    expect(lines[4]).toBe('Cast: Christian Bale, Heath Ledger, Aaron Eckhart');
    expect(lines[5]).toBe('Runtime: 152 minutes');
    expect(lines.length).toBe(6);
  });

  it('full TV: media_type displays as TV Series', () => {
    const input = fullInput();
    input.media_type = 'tv';
    input.title = 'Breaking Bad';
    input.genre_ids = [18, 80]; // Drama, Crime
    const text = buildEmbeddingText(input);
    expect(text.startsWith('Breaking Bad (2008) - TV Series')).toBe(true);
  });

  // ── Empty keywords → line omitted ──────────────────────────────

  it('empty keywords: Keywords line omitted', () => {
    const input = fullInput();
    input.keywords = [];
    const text = buildEmbeddingText(input);
    expect(text.includes('Keywords:')).toBe(false);
    // Other lines still present
    expect(text.includes('Genres:')).toBe(true);
    expect(text.includes('Cast:')).toBe(true);
  });

  // ── Empty cast → line omitted ──────────────────────────────────

  it('empty cast: Cast line omitted', () => {
    const input = fullInput();
    input.cast_top_5 = [];
    const text = buildEmbeddingText(input);
    expect(text.includes('Cast:')).toBe(false);
    expect(text.includes('Keywords:')).toBe(true);
  });

  // ── NULL runtime → line omitted ─────────────────────────────────

  it('null runtime: Runtime line omitted', () => {
    const input = fullInput();
    input.runtime = null;
    const text = buildEmbeddingText(input);
    expect(text.includes('Runtime:')).toBe(false);
  });

  // ── runtime: 0 treated as NULL (Phase 0.5 Deviation 2) ─────────

  it('runtime 0: treated as NULL, Runtime line omitted', () => {
    const input = fullInput();
    input.runtime = 0;
    const text = buildEmbeddingText(input);
    expect(text.includes('Runtime:')).toBe(false);
  });

  // ── NULL overview → line omitted ────────────────────────────────

  it('null overview: Overview line omitted', () => {
    const input = fullInput();
    input.overview = null;
    const text = buildEmbeddingText(input);
    expect(text.includes('Overview:')).toBe(false);
    // 5 lines: header, genres, keywords, cast, runtime
    expect(text.split('\n').length).toBe(5);
  });

  // ── Empty overview string → line omitted ────────────────────────

  it('empty overview string: Overview line omitted', () => {
    const input = fullInput();
    input.overview = '';
    const text = buildEmbeddingText(input);
    expect(text.includes('Overview:')).toBe(false);
  });

  // ── Unknown genre IDs → skipped silently ────────────────────────

  it('unknown genre IDs: skipped silently', () => {
    const input = fullInput();
    input.genre_ids = [28, 99999, 80]; // 99999 is not a valid TMDb genre
    const text = buildEmbeddingText(input);
    expect(text.includes('Genres: Action, Crime')).toBe(true);
    expect(text.includes('99999')).toBe(false);
  });

  // ── All genre IDs unknown → Genres line omitted ─────────────────

  it('all genre IDs unknown: Genres line omitted entirely', () => {
    const input = fullInput();
    input.genre_ids = [99999, 88888];
    const text = buildEmbeddingText(input);
    expect(text.includes('Genres:')).toBe(false);
  });

  // ── Empty genre_ids → Genres line omitted ───────────────────────

  it('empty genre_ids: Genres line omitted', () => {
    const input = fullInput();
    input.genre_ids = [];
    const text = buildEmbeddingText(input);
    expect(text.includes('Genres:')).toBe(false);
  });

  // ── Trim at 2000 characters ─────────────────────────────────────

  it('trim at 2000 chars: long overview is truncated', () => {
    const input = fullInput();
    input.overview = 'A '.repeat(1500); // 3000 chars
    const text = buildEmbeddingText(input);
    expect(text.length <= 2000).toBe(true);
  });

  // ── TV-specific genre IDs resolve correctly ─────────────────────

  it('TV-specific genres: Action & Adventure, War & Politics', () => {
    const input = fullInput();
    input.media_type = 'tv';
    input.genre_ids = [10759, 10768]; // Action & Adventure, War & Politics
    const text = buildEmbeddingText(input);
    expect(text.includes('Genres: Action & Adventure, War & Politics')).toBe(true);
  });

  // ── Template fidelity: no Director line even with director data ──

  it('template fidelity: no Director line appears in output', () => {
    // Director is intentionally excluded from the §4.1 locked template.
    // This test confirms no "Director:" line appears regardless of what
    // data might be available in the database.
    const input = fullInput();
    const text = buildEmbeddingText(input);
    expect(text.includes('Director:')).toBe(false);
    expect(text.includes('Director')).toBe(false);
    // Specifically check it doesn't appear anywhere in the output
    const lines = text.split('\n');
    for (const line of lines) {
      expect(line.startsWith('Director'), `Unexpected Director line: ${line}`).toBe(false);
    }
  });

  // ── Minimal input: only header line ─────────────────────────────

  it('minimal input: only header line when all optional fields empty/null', () => {
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
    expect(text).toBe('Bare (2020) - Movie');
  });
});
