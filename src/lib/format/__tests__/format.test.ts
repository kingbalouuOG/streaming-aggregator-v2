import { describe, expect, it } from 'vitest';
import { MONTH_NAMES } from '../months';
import { countLabel, pluralise } from '../plural';

describe('MONTH_NAMES', () => {
  it('is the twelve English months, indexed like Date#getUTCMonth', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[new Date('2026-01-15T00:00:00Z').getUTCMonth()]).toBe('January');
    expect(MONTH_NAMES[new Date('2026-09-14T00:00:00Z').getUTCMonth()]).toBe('September');
    expect(MONTH_NAMES[11]).toBe('December');
  });
});

describe('pluralise / countLabel', () => {
  it('uses the singular only for exactly one', () => {
    expect(pluralise(1, 'title')).toBe('title');
    expect(pluralise(0, 'title')).toBe('titles');
    expect(pluralise(2, 'title')).toBe('titles');
  });

  it('takes an irregular plural', () => {
    expect(pluralise(3, 'person', 'people')).toBe('people');
    expect(pluralise(1, 'person', 'people')).toBe('person');
  });

  it('prefixes the count', () => {
    expect(countLabel(1, 'title')).toBe('1 title');
    expect(countLabel(12, 'title')).toBe('12 titles');
    expect(countLabel(0, 'title')).toBe('0 titles');
  });
});
