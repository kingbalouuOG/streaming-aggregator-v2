import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

describe('titleMatchScore — naming whole words vs matching characters', () => {
  // Added 2026-09-09 after device testing. "Hail Mary" found nothing while
  // "Project Hail" found the film: both are substrings of "Project Hail
  // Mary", and the scorer measured only how many CHARACTERS of the title
  // each accounted for. Nine of seventeen is less than "sever" covers of
  // "Severance", so a user who had named two of the title's three words
  // scored below someone who had typed half of one word.

  it('scores a whole-word run at the end of a title above the floor', () => {
    expect(titleMatchScore('Project Hail Mary', 'hail mary')).toBeCloseTo(0.567, 3);
  });

  it('leaves a longer prefix exactly where it was', () => {
    // 12/17 of the characters beats 2/3 of the words, and coverage takes the
    // larger of the two, so this case cannot regress.
    expect(titleMatchScore('Project Hail Mary', 'project hail')).toBeCloseTo(0.6, 3);
  });

  it('still refuses a partial word', () => {
    // The distinction the whole thing rests on: "sever" names nothing, and
    // measuring it in words would have made it a complete one.
    expect(titleMatchScore('Severance', 'sever')).toBeLessThan(0.5);
  });

  it('still refuses one word of a two-word title', () => {
    // Half the words is half the words wherever it sits, so neither of these
    // reaches the floor — "bear" is not a lookup for The Bear.
    expect(titleMatchScore('The Bear', 'bear')).toBeLessThan(0.5);
    expect(titleMatchScore('The Bear', 'the')).toBeLessThan(0.5);
  });

  it('requires the words to be adjacent and in order', () => {
    // Reordered or gapped queries fall to the weaker rung, which is where a
    // half-remembered jumble belongs.
    expect(titleMatchScore('Project Hail Mary', 'mary hail')).toBeLessThan(0.5);
    expect(titleMatchScore('Project Hail Mary', 'project mary')).toBeLessThan(0.5);
  });
});

describe('selectTitleHit — a half-remembered title', () => {
  it('opens the card when the top hit is prominent', () => {
    const hit = selectTitleHit(
      [item({ title: 'Project Hail Mary', voteCount: 2000 })],
      'hail mary',
    );
    expect(hit?.item.title).toBe('Project Hail Mary');
  });

  it('still needs prominence, because the name is only partly given', () => {
    // A partial name can never clear the bar on the match alone (0.567 x 0.7
    // is 0.397), so the other 0.3 has to come from somewhere. That is the
    // guard against opening a card for an obscure title that merely happens
    // to contain the words: roughly 256 votes are needed here.
    expect(
      selectTitleHit([item({ title: 'Project Hail Mary', voteCount: 40 })], 'hail mary'),
    ).toBeNull();
  });

  it('does not open a card for a description that names whole words', () => {
    // "Something Wild" is a real film and "something" is a whole word of it.
    // The description marker is what stops this, not the score.
    expect(selectTitleHit([item({ title: 'Something Wild' })], 'something')).toBeNull();
  });
});

describe('the fixture calibrates this module', () => {
  // titleHit.ts says its thresholds are tuned against the known-title half of
  // scripts/test/search-semantic-fixtures.json. That was true when written and
  // nothing held it true afterwards. These two assertions are the contract:
  // every title a user would plausibly type clears the bar, and not one of the
  // eight preset sentences does.
  const fixture = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../scripts/test/search-semantic-fixtures.json'), 'utf8'),
  ) as { queries: { query: string; kind?: string; expected: { title: string }[] }[] };

  const knownTitles = fixture.queries.filter((q) => q.kind === 'known-title');

  it('has known-title entries to check', () => {
    expect(knownTitles.length).toBeGreaterThanOrEqual(8);
  });

  it('every known title clears the confidence bar', () => {
    for (const entry of knownTitles) {
      const top = item({ title: entry.expected[0].title, voteCount: 2000 });
      expect(selectTitleHit([top], entry.query), entry.query).not.toBeNull();
    }
  });

  it('no preset sentence does, whatever sits at the top of the list', () => {
    for (const sentence of PRESET_SENTENCES) {
      for (const entry of knownTitles) {
        const top = item({ title: entry.expected[0].title, voteCount: 5000 });
        expect(selectTitleHit([top], sentence), `${sentence} / ${entry.expected[0].title}`).toBeNull();
      }
    }
  });
});
