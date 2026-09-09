import { describe, expect, it } from 'vitest';

import { PRESET_SENTENCES } from '../../content/presets';
import type { ContentItem } from '../../types/content';
import {
  CONFIDENT_TITLE_HIT,
  looksLikeDescription,
  normaliseForMatch,
  selectTitleHit,
  titleMatchScore,
} from '../titleHit';

// The free-text routing decision (recommendation 2026-09-08-002 §9.2).
// Getting this wrong in the retrieval direction is the expensive mistake —
// a lookup that waits on an embedding round trip — so the bias under test is
// "only a confident hit skips the grid".

function item(over: Partial<ContentItem> & { title: string }): ContentItem {
  return {
    id: 'movie-1',
    image: '',
    services: [],
    type: 'movie',
    voteCount: 2000,
    ...over,
  } as ContentItem;
}

describe('normaliseForMatch', () => {
  it('folds case, punctuation and accents', () => {
    expect(normaliseForMatch('Amélie!')).toBe('amelie');
    expect(normaliseForMatch('  The   Matrix: Reloaded ')).toBe('the matrix reloaded');
  });
});

describe('titleMatchScore', () => {
  it('scores an exact title 1', () => {
    expect(titleMatchScore('Severance', 'severance')).toBe(1);
    expect(titleMatchScore('The Bear', '  the bear ')).toBe(1);
  });

  it('discounts a partial prefix by how much of the title it covers', () => {
    // Mid-typing. The grid is the right answer until the word is finished.
    expect(titleMatchScore('Severance', 'sever')).toBeLessThan(0.5);
  });

  it('does not let a common article name a film', () => {
    expect(titleMatchScore('The Matrix', 'the')).toBeLessThan(0.5);
  });

  it('tolerates reordering and dropped articles', () => {
    expect(titleMatchScore('The Matrix Reloaded', 'matrix reloaded')).toBeGreaterThan(0);
  });

  it('scores unrelated text 0', () => {
    expect(titleMatchScore('Conclave', 'something recent')).toBe(0);
  });
});

describe('looksLikeDescription', () => {
  it('is true for every preset sentence', () => {
    // The eight sentences are the canonical descriptions. If one of them
    // ever reads as a title, the banner copy is lying.
    for (const sentence of PRESET_SENTENCES) {
      expect(looksLikeDescription(sentence), sentence).toBe(true);
    }
  });

  it('is false for plain title lookups', () => {
    for (const title of ['severance', 'the bear', 'dune part two', 'anora']) {
      expect(looksLikeDescription(title), title).toBe(false);
    }
  });

  it('yields to an exact title match', () => {
    // A film really is called "Tonight You're Mine"; typing its full name is
    // a lookup, whatever words it happens to contain.
    expect(looksLikeDescription("tonight you're mine")).toBe(true);
    expect(looksLikeDescription("tonight you're mine", true)).toBe(false);
  });
});

describe('selectTitleHit', () => {
  it('returns the top hit for an exact, prominent title', () => {
    const hit = selectTitleHit([item({ title: 'Severance', voteCount: 3000 })], 'severance');
    expect(hit?.item.title).toBe('Severance');
    expect(hit?.confidence).toBeGreaterThanOrEqual(CONFIDENT_TITLE_HIT);
  });

  it('returns an exact match even when nobody has voted on it', () => {
    // An obscure title is still the title the user typed.
    const hit = selectTitleHit([item({ title: 'Conclave', voteCount: 0 })], 'conclave');
    expect(hit).not.toBeNull();
  });

  it('returns null for every preset sentence', () => {
    for (const sentence of PRESET_SENTENCES) {
      const hit = selectTitleHit([item({ title: 'Anora' })], sentence);
      expect(hit, sentence).toBeNull();
    }
  });

  it('returns null while the user is still typing the title', () => {
    expect(selectTitleHit([item({ title: 'Severance' })], 'sever')).toBeNull();
  });

  it('returns null when a description happens to prefix a real title', () => {
    // "Something Wild" is a real film; "something" is not a lookup for it.
    expect(selectTitleHit([item({ title: 'Something Wild' })], 'something')).toBeNull();
  });

  it('returns null for an empty or missing result list', () => {
    expect(selectTitleHit([], 'severance')).toBeNull();
    expect(selectTitleHit(undefined, 'severance')).toBeNull();
  });

  it('only ever considers the head of the list', () => {
    const hit = selectTitleHit(
      [item({ title: 'Unrelated Film' }), item({ title: 'Severance', id: 'tv-2' })],
      'severance',
    );
    expect(hit).toBeNull();
  });

  it('honours a caller-supplied threshold', () => {
    const items = [item({ title: 'Severance', voteCount: 0 })];
    expect(selectTitleHit(items, 'severance', 0.99)).toBeNull();
    expect(selectTitleHit(items, 'severance', 0.5)).not.toBeNull();
  });
});
