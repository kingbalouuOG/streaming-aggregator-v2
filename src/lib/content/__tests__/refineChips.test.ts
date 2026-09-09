import { describe, expect, it } from 'vitest';

import { DEFAULT_FILTERS, countActiveFilters, type BrowseFilters } from '../browseFilters';
import {
  REFINE_CHIPS,
  activeRefineFields,
  describeRefineEmptyState,
  orderedRefineChips,
  refineChipFor,
  toggleRefineChip,
  type RefineField,
} from '../refineChips';

/** Apply chips by field name, the way the row does. */
function withChips(...fields: RefineField[]): BrowseFilters {
  return fields.reduce<BrowseFilters>((f, field) => {
    const chip = refineChipFor(field);
    if (!chip) throw new Error(`no chip for ${field}`);
    return toggleRefineChip(f, chip);
  }, DEFAULT_FILTERS);
}

describe('the chip set', () => {
  it('adds no axis that BrowseFilters does not already have (§10)', () => {
    for (const chip of REFINE_CHIPS) {
      expect(Object.keys(DEFAULT_FILTERS)).toContain(chip.field);
    }
  });

  it('is the five §9.2 names, in order', () => {
    expect(REFINE_CHIPS.map((c) => c.label)).toEqual([
      'Just films',
      'Newer',
      'Under 2h',
      'Free to watch',
      'Higher rated',
    ]);
  });

  it('switches off to a value countActiveFilters treats as inactive', () => {
    for (const chip of REFINE_CHIPS) {
      const on = toggleRefineChip(DEFAULT_FILTERS, chip);
      expect(countActiveFilters(on)).toBe(1);
      expect(countActiveFilters(toggleRefineChip(on, chip))).toBe(0);
    }
  });
});

describe('toggling', () => {
  it('round-trips back to the defaults', () => {
    for (const chip of REFINE_CHIPS) {
      expect(toggleRefineChip(toggleRefineChip(DEFAULT_FILTERS, chip), chip)).toEqual(
        DEFAULT_FILTERS,
      );
    }
  });

  it('composes rather than replaces — chips stack', () => {
    const f = withChips('contentType', 'cost', 'released');
    expect(f.contentType).toBe('movie');
    expect(f.cost).toBe('free');
    expect(f.released).toBe('last_12_months');
    expect(countActiveFilters(f)).toBe(3);
  });

  it('leaves untouched axes alone', () => {
    const seeded: BrowseFilters = { ...DEFAULT_FILTERS, genres: ['Horror'], showWatched: 'hide' };
    const next = toggleRefineChip(seeded, refineChipFor('cost')!);
    expect(next.genres).toEqual(['Horror']);
    expect(next.showWatched).toBe('hide');
  });
});

describe('staying in sync with the sheet', () => {
  it('lights Higher rated for a stronger rating the sheet set', () => {
    const fromSheet: BrowseFilters = { ...DEFAULT_FILTERS, minRating: 8.5 };
    expect(activeRefineFields(fromSheet)).toContain('minRating');
  });

  it('clears the constraint outright rather than weakening it to 7', () => {
    const fromSheet: BrowseFilters = { ...DEFAULT_FILTERS, minRating: 8.5 };
    expect(toggleRefineChip(fromSheet, refineChipFor('minRating')!).minRating).toBe(0);
  });

  it('lights Under 2h for the shorter band too', () => {
    const fromSheet: BrowseFilters = { ...DEFAULT_FILTERS, runtime: 'under_60' };
    expect(activeRefineFields(fromSheet)).toContain('runtime');
    expect(toggleRefineChip(fromSheet, refineChipFor('runtime')!).runtime).toBe('any');
  });

  it('does not light Just films for the other type constraints', () => {
    for (const contentType of ['tv', 'doc'] as const) {
      expect(activeRefineFields({ ...DEFAULT_FILTERS, contentType })).not.toContain('contentType');
    }
  });
});

describe('render order', () => {
  it('is canonical when nothing is active', () => {
    expect(orderedRefineChips(DEFAULT_FILTERS)).toEqual([...REFINE_CHIPS]);
  });

  it('floats active chips to the front, canonical within each group', () => {
    // The prototype's state 4: Just films and Free to watch lit.
    const f = withChips('contentType', 'cost');
    expect(orderedRefineChips(f).map((c) => c.label)).toEqual([
      'Just films',
      'Free to watch',
      'Newer',
      'Under 2h',
      'Higher rated',
    ]);
  });
});

describe('zero-result copy', () => {
  it('is the §10 sentence for free + under 2h', () => {
    const f = withChips('cost', 'runtime');
    expect(describeRefineEmptyState(f, 'runtime')).toEqual({
      summary: 'Nothing free under two hours',
      removeLabel: 'Under 2h',
    });
  });

  it('switches opener when a noun is present', () => {
    expect(describeRefineEmptyState(withChips('contentType', 'cost'), 'cost')?.summary).toBe(
      'No free films',
    );
    expect(
      describeRefineEmptyState(withChips('contentType', 'released', 'runtime'), 'runtime')?.summary,
    ).toBe('No recent films under two hours');
  });

  it('names the chip added last', () => {
    const f = withChips('cost', 'released', 'minRating');
    expect(describeRefineEmptyState(f, 'cost')?.removeLabel).toBe('Free to watch');
    expect(describeRefineEmptyState(f, 'released')?.removeLabel).toBe('Newer');
  });

  it('never names a chip that is already off', () => {
    // The user added Newer, then removed it by hand — pointing at it would
    // send them to a control that is already dark.
    const f = withChips('cost');
    expect(describeRefineEmptyState(f, 'released')?.removeLabel).toBe('Free to watch');
  });

  it('says nothing when no chip is active', () => {
    expect(describeRefineEmptyState(DEFAULT_FILTERS, null)).toBeNull();
    // A sheet-only constraint is not a refine chip, so the row is not what
    // emptied the grid and the caller keeps its own copy.
    expect(describeRefineEmptyState({ ...DEFAULT_FILTERS, genres: ['Horror'] }, null)).toBeNull();
  });
});
