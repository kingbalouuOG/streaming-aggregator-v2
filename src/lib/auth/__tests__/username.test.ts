import { describe, expect, it } from 'vitest';

import {
  isPlaceholderUsername,
  isValidUsername,
  normaliseUsernameInput,
  suggestUsername,
} from '../username';

// The placeholder the 089 trigger derives: 'user_' || left(replace(id::text, '-', ''), 8),
// or all 32 hex digits on collision. Mirrored here so the reservation is tested against
// the exact shape the database produces.
const placeholderFor = (uuid: string, full = false) =>
  'user_' + (full ? uuid.replace(/-/g, '') : uuid.replace(/-/g, '').slice(0, 8));

describe('isPlaceholderUsername', () => {
  it('matches both trigger forms', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(placeholderFor(id)).toBe('user_0f8fad5b');
    expect(isPlaceholderUsername(placeholderFor(id))).toBe(true);
    expect(isPlaceholderUsername(placeholderFor(id, true))).toBe(true);
  });

  it('does not match ordinary names that merely start with user_', () => {
    expect(isPlaceholderUsername('user_joe')).toBe(false);
    expect(isPlaceholderUsername('user_0f8fad5')).toBe(false); // 7 hex
    expect(isPlaceholderUsername('user_0f8fad5b1')).toBe(false); // 9 hex
    expect(isPlaceholderUsername('user_0F8FAD5B')).toBe(false); // uuid text is lowercase
  });
});

describe('isValidUsername', () => {
  it.each(['joe', 'joe.green', 'joe_green', 'j0e', 'a1b', 'abcdefghijklmnopqrst'])('accepts %s', (u) => {
    expect(isValidUsername(u)).toBe(true);
  });

  it.each([
    ['too short', 'jo'],
    ['too long', 'abcdefghijklmnopqrstu'],
    ['uppercase', 'Joe'],
    ['leading separator', '_joe'],
    ['trailing separator', 'joe.'],
    ['double separator', 'joe__green'],
    ['mixed double separator', 'joe._green'],
    ['space', 'joe green'],
    ['hyphen', 'joe-green'],
    ['reserved placeholder', 'user_0f8fad5b'],
  ])('rejects %s', (_label, u) => {
    expect(isValidUsername(u)).toBe(false);
  });
});

describe('normaliseUsernameInput', () => {
  it('lowercases, strips whitespace and caps at 20', () => {
    expect(normaliseUsernameInput(' Joe Green ')).toBe('joegreen');
    expect(normaliseUsernameInput('A'.repeat(30))).toBe('a'.repeat(20));
  });
});

describe('suggestUsername', () => {
  it.each([
    ['Joe', 'joe'],
    ['Zoë', 'zoe'],
    ['José', 'jose'],
    ['Mary-Jane', 'maryjane'],
    ["O'Brien", 'obrien'],
    ['Anne Marie', 'annemarie'],
    ['Élodie', 'elodie'],
  ])('%s → %s', (given, expected) => {
    expect(suggestUsername(given)).toBe(expected);
  });

  it('returns empty for nothing usable', () => {
    expect(suggestUsername(null)).toBe('');
    expect(suggestUsername(undefined)).toBe('');
    expect(suggestUsername('')).toBe('');
    expect(suggestUsername('李')).toBe('');
  });

  it('trims separators left at either end after the cap', () => {
    expect(suggestUsername('_joe_')).toBe('joe');
    expect(suggestUsername('abcdefghijklmnopqrs_tuv')).toBe('abcdefghijklmnopqrs');
  });

  it('collapses runs of separators', () => {
    expect(suggestUsername('joe.._green')).toBe('joe_green');
  });

  it('can return a short name the prompt will then flag', () => {
    const s = suggestUsername('Al');
    expect(s).toBe('al');
    expect(isValidUsername(s)).toBe(false);
  });
});
