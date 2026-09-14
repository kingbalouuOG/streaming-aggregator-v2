import { describe, expect, it } from 'vitest';

import { parseTitleRef, TITLE_SLUG_MAX, titlePageUrl, titleRef, titleSlug } from '../slug';

describe('titleSlug', () => {
  it('lowercases, hyphenates and appends the year', () => {
    expect(titleSlug('The Matrix', 1999)).toBe('the-matrix-1999');
  });

  it('omits the year when absent or invalid', () => {
    expect(titleSlug('Severance')).toBe('severance');
    expect(titleSlug('Severance', null)).toBe('severance');
    expect(titleSlug('Severance', 0)).toBe('severance');
  });

  it('folds accents and ligatures to ASCII', () => {
    expect(titleSlug('Amélie', 2001)).toBe('amelie-2001');
    expect(titleSlug('Léon: The Professional', 1994)).toBe('leon-the-professional-1994');
    expect(titleSlug('Die Brücke über die Straße')).toBe('die-brucke-uber-die-strasse');
    expect(titleSlug('Æon Flux')).toBe('aeon-flux');
  });

  it('collapses punctuation runs and trims hyphens', () => {
    expect(titleSlug('  Fast & Furious!!  ', 2009)).toBe('fast-furious-2009');
    expect(titleSlug('M*A*S*H')).toBe('m-a-s-h');
    expect(titleSlug('...And Justice for All')).toBe('and-justice-for-all');
  });

  it('returns empty for titles with no ASCII letters or digits', () => {
    expect(titleSlug('千と千尋の神隠し', 2001)).toBe('');
  });

  it('caps at 80 characters, cutting the title and keeping the year', () => {
    const long = 'word '.repeat(40);
    const slug = titleSlug(long, 2020);
    expect(slug.length).toBeLessThanOrEqual(TITLE_SLUG_MAX);
    expect(slug.endsWith('-2020')).toBe(true);
    expect(slug).not.toMatch(/--/);
    expect(titleSlug(long).length).toBeLessThanOrEqual(TITLE_SLUG_MAX);
  });
});

describe('titleRef / titlePageUrl', () => {
  it('joins id and slug', () => {
    expect(titleRef(603, 'The Matrix', 1999)).toBe('603-the-matrix-1999');
    expect(titlePageUrl('movie', 603, 'The Matrix', 1999)).toBe(
      'https://videxstreaming.com/t/movie/603-the-matrix-1999',
    );
  });

  it('falls back to the bare id when the slug is empty', () => {
    expect(titleRef(129, '千と千尋の神隠し', 2001)).toBe('129');
  });
});

describe('parseTitleRef', () => {
  it('parses bare and slugged refs', () => {
    expect(parseTitleRef('603')).toEqual({ id: '603', slug: null });
    expect(parseTitleRef('603-the-matrix-1999')).toEqual({ id: '603', slug: 'the-matrix-1999' });
    expect(parseTitleRef('603-')).toEqual({ id: '603', slug: '' });
  });

  it('rejects refs not starting with digits', () => {
    expect(parseTitleRef('the-matrix')).toBeNull();
    expect(parseTitleRef('603abc')).toBeNull();
    expect(parseTitleRef('')).toBeNull();
  });
});
