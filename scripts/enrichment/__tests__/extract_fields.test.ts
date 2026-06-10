/**
 * Tests for the shared extractFields() module.
 *
 * Run via: npm test (vitest)
 *
 * Fixtures live at scripts/enrichment/fixtures/ and are minimal but
 * shape-faithful TMDb response slices — they exercise only the fields
 * extractFields() reads.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { extractFields } from '../../../supabase/functions/_shared/extract_fields.ts';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8'));
}

describe('extractFields', () => {
  // ── Movie with full data ────────────────────────────────────────

  it('movie_full: extracts all five fields', () => {
    const r = extractFields(loadFixture('movie_full.json'), 'movie');
    expect(r.keywords).toEqual(['dc comics', 'vigilante', 'superhero', 'anti hero']);
    expect(r.cast_top_5).toEqual([
      'Christian Bale',
      'Heath Ledger',
      'Aaron Eckhart',
      'Michael Caine',
      'Maggie Gyllenhaal',
    ]);
    expect(r.director).toBe('Christopher Nolan');
    expect(r.content_rating).toBe('12A'); // GB beats US
    expect(r.runtime).toBe(152);
  });

  // ── TV with full data ───────────────────────────────────────────

  it('tv_full: director comes from created_by, runtime from episode_run_time[0]', () => {
    const r = extractFields(loadFixture('tv_full.json'), 'tv');
    expect(r.keywords).toEqual(['high school teacher', 'new mexico', 'drug dealer']);
    expect(r.cast_top_5).toEqual([
      'Bryan Cranston',
      'Aaron Paul',
      'Anna Gunn',
      'Dean Norris',
      'Betsy Brandt',
    ]);
    expect(r.director).toBe('Vince Gilligan');
    expect(r.content_rating).toBe('18'); // GB
    expect(r.runtime).toBe(45); // first element of episode_run_time
  });

  // ── Movie with no GB rating falls back to US ────────────────────

  it('movie_no_gb_rating: falls back to US certification', () => {
    const r = extractFields(loadFixture('movie_no_gb_rating.json'), 'movie');
    expect(r.content_rating).toBe('R');
    expect(r.director).toBe('Alex Indie');
    expect(r.cast_top_5).toEqual(['Jane Doe', 'John Smith']);
  });

  // ── Movie with no crew, no keywords, no release dates ───────────

  it('movie_no_crew: missing data produces NULL/empty, never throws', () => {
    const r = extractFields(loadFixture('movie_no_crew.json'), 'movie');
    expect(r.keywords).toEqual([]);
    expect(r.cast_top_5).toEqual(['Unknown Actor One', 'Unknown Actor Two']);
    expect(r.director).toBe(null);
    expect(r.content_rating).toBe(null);
    expect(r.runtime).toBe(62);
  });

  // ── TV with empty episode_run_time ──────────────────────────────

  it('tv_no_episode_runtime: runtime is NULL when episode_run_time is empty', () => {
    const r = extractFields(loadFixture('tv_no_episode_runtime.json'), 'tv');
    expect(r.runtime).toBe(null);
    // Multiple creators joined with ", "
    expect(r.director).toBe('Showrunner A, Showrunner B');
    // Only US rating present → US is the answer
    expect(r.content_rating).toBe('TV-14');
  });

  // ── Movie with fewer than 5 cast and multiple directors ─────────

  it('movie_few_cast: cast_top_5 has fewer than 5; multiple directors joined', () => {
    const r = extractFields(loadFixture('movie_few_cast.json'), 'movie');
    expect(r.cast_top_5).toEqual(['Lead One', 'Lead Two']);
    expect(r.director).toBe('Co Director A, Co Director B');
    // First entry has empty certification, second entry has '15' — should
    // pick the first non-empty one.
    expect(r.content_rating).toBe('15');
  });

  // ── Empty arrays vs NULL distinction ────────────────────────────

  it('keywords distinguishes empty array (TMDb returned none) from missing block', () => {
    // movie_no_crew has `keywords: { keywords: [] }` → empty array, not NULL
    const r = extractFields(loadFixture('movie_no_crew.json'), 'movie');
    expect(Array.isArray(r.keywords)).toBe(true);
    expect(r.keywords.length).toBe(0);
  });

  // ── Defensive: bad input throws cleanly ─────────────────────────

  it('extractFields throws on null response', () => {
    expect(() => extractFields(null, 'movie')).toThrow(/non-null object/);
  });

  it('extractFields throws on bad mediaType', () => {
    expect(() => extractFields({}, 'film' as 'movie')).toThrow(
      /must be 'movie' or 'tv'/
    );
  });

  // ── runtime=0 is a TMDb placeholder, treat as NULL ──────────────

  it('movie with runtime: 0 is treated as NULL (TMDb placeholder)', () => {
    const r = extractFields(
      { id: 1, title: 'Unaired Film', runtime: 0 },
      'movie'
    );
    expect(r.runtime).toBe(null);
  });

  it('movie with runtime: -5 is treated as NULL', () => {
    const r = extractFields(
      { id: 1, title: 'Bad Data', runtime: -5 },
      'movie'
    );
    expect(r.runtime).toBe(null);
  });

  // ── Defensive: TMDb shape drift produces NULL/empty, never throws ─

  it('extractFields tolerates wholly missing optional blocks', () => {
    const r = extractFields({ id: 1, title: 'Bare' }, 'movie');
    expect(r.keywords).toEqual([]);
    expect(r.cast_top_5).toEqual([]);
    expect(r.director).toBe(null);
    expect(r.content_rating).toBe(null);
    expect(r.runtime).toBe(null);
  });

  it('extractFields tolerates wholly missing optional blocks (TV)', () => {
    const r = extractFields({ id: 1, name: 'Bare' }, 'tv');
    expect(r.keywords).toEqual([]);
    expect(r.cast_top_5).toEqual([]);
    expect(r.director).toBe(null);
    expect(r.content_rating).toBe(null);
    expect(r.runtime).toBe(null);
  });
});
