/**
 * The refine row's five one-tap axes (recommendation 2026-09-08-002 §9.2).
 *
 * These are not new filters. Every chip is a single, existing `BrowseFilters`
 * field set to one particular value — the five refinements that came up often
 * enough in the brief to deserve a tap instead of a trip through the sheet.
 * §10 is explicit that no new axis may be added here, and the shape of this
 * module enforces it: a chip is `{ field, on, off }` over the existing
 * vocabulary, so there is nowhere to put an axis that does not already exist.
 *
 * Why the shared tree rather than `native/src/components/`: the rules are
 * pure, the root vitest suite covers only `src/`, `scripts/` and `workers/`,
 * and native has no runner. Same split, and the same reason, as
 * `browseFilters.ts` and `quickFilter.ts`. `native/src/components/RefineRow.tsx`
 * adds the icons and the pressables, which are the only parts that cannot
 * live here.
 */

import type { BrowseFilters } from './browseFilters';

/** The `BrowseFilters` fields the row is allowed to touch. */
export type RefineField = 'contentType' | 'released' | 'runtime' | 'cost' | 'minRating';

/**
 * Where a chip's words sit in the zero-result sentence.
 *
 * "No recent films under two hours" is three chips in three grammatical
 * positions, and getting them wrong produces "Nothing free films", which
 * reads as a bug. So each chip declares its part of speech rather than the
 * sentence guessing.
 */
export type RefinePhraseSlot = 'adjective' | 'noun' | 'tail';

interface RefineChipDef<K extends RefineField> {
  field: K;
  /** Chip label. Also what the zero-result copy names ("try removing X"). */
  label: string;
  /** The chip's contribution to the zero-result sentence. */
  phrase: string;
  slot: RefinePhraseSlot;
  /** Value written when the chip is switched on. */
  on: BrowseFilters[K];
  /** Value written when it is switched off — always the neutral default. */
  off: BrowseFilters[K];
  /**
   * Whether the chip should read as lit for these filters.
   *
   * A predicate rather than `f[field] === on`, because the sheet can set a
   * value that is *stronger* than the chip's. A minimum rating of 8.5 chosen
   * in the sheet satisfies "Higher rated" and must light the chip — a chip
   * that stays dark while its constraint is active is the same defect as a
   * chip that does nothing.
   */
  isOn(f: BrowseFilters): boolean;
}

export type RefineChip =
  | RefineChipDef<'contentType'>
  | RefineChipDef<'released'>
  | RefineChipDef<'runtime'>
  | RefineChipDef<'cost'>
  | RefineChipDef<'minRating'>;

/** The rating floor "Higher rated" applies. */
export const HIGHER_RATED_MIN = 7;

/**
 * The five chips, in the order §9.2 fixes them.
 *
 * `Free to watch` is server-side only: `applyBrowseFilters` ignores `cost`
 * because nothing on `ContentItem` carries a stream type. It is real on both
 * paths that fetch — `/discover` (`with_watch_monetization_types`) and the
 * semantic RPC (`subscription_included_titles`, migration 080) — and
 * `orderedRefineChips` withholds it on the one path that does not. See
 * `CLIENT_UNSUPPORTED`.
 */
export const REFINE_CHIPS: readonly RefineChip[] = [
  {
    field: 'contentType',
    label: 'Just films',
    phrase: 'films',
    slot: 'noun',
    on: 'movie',
    off: 'all',
    // Deliberately exact. 'doc' and 'tv' are other type constraints, not
    // stronger versions of "films", so neither may light this chip.
    isOn: (f) => f.contentType === 'movie',
  },
  {
    field: 'released',
    label: 'Newer',
    phrase: 'recent',
    slot: 'adjective',
    on: 'last_12_months',
    off: 'any',
    isOn: (f) => f.released !== 'any',
  },
  {
    field: 'runtime',
    label: 'Under 2h',
    phrase: 'under two hours',
    slot: 'tail',
    on: '60_120',
    off: 'any',
    // `under_60` is also under two hours, so it lights the chip; switching
    // the chip off then clears whichever band was set.
    isOn: (f) => f.runtime === '60_120' || f.runtime === 'under_60',
  },
  {
    field: 'cost',
    label: 'Free to watch',
    phrase: 'free',
    slot: 'adjective',
    on: 'free',
    off: 'any',
    isOn: (f) => f.cost === 'free',
  },
  {
    field: 'minRating',
    label: 'Higher rated',
    phrase: 'highly rated',
    slot: 'adjective',
    on: HIGHER_RATED_MIN,
    off: 0,
    isOn: (f) => f.minRating >= HIGHER_RATED_MIN,
  },
];

export function refineChipFor(field: RefineField): RefineChip | undefined {
  return REFINE_CHIPS.find((c) => c.field === field);
}

export function isRefineChipActive(f: BrowseFilters, chip: RefineChip): boolean {
  return chip.isOn(f);
}

/**
 * Apply a chip to the filters.
 *
 * Switching off always writes the neutral default, so `× Higher rated`
 * clears an 8.5 the sheet set rather than dropping it to 7 and leaving a
 * constraint the user thought they had removed.
 */
export function toggleRefineChip(f: BrowseFilters, chip: RefineChip): BrowseFilters {
  const value = chip.isOn(f) ? chip.off : chip.on;
  // Each member of the union pairs its field with its own value type, but TS
  // cannot follow that through a computed key, so the spread is asserted.
  return { ...f, [chip.field]: value } as BrowseFilters;
}

/**
 * Fields the CLIENT-SIDE post-filter can actually honour.
 *
 * `applyBrowseFilters` ignores `cost` — nothing on `ContentItem` carries a
 * stream type — so on the one route that post-filters (Mode A with the
 * `search_semantic` flag off) a *Free to watch* chip would light up and
 * change nothing. That is precisely the defect that got the category pills
 * deleted, and shipping it back in a new pill would be a poor joke.
 *
 * `runtime` is NOT in the exception list. It is honoured, just partially:
 * only the Supabase-sourced hits carry a runtime, so the axis thins those and
 * leaves the TMDb ones alone. A weaker filter is not an inert control.
 */
const CLIENT_UNSUPPORTED: readonly RefineField[] = ['cost'];

/**
 * Chips in render order: active first, canonical order within each group.
 *
 * The prototype's state 4 shows this — a horizontal scroller whose lit chips
 * have drifted left. It matters on a 390pt screen, where five chips do not
 * fit: without it, switching on the fifth chip leaves the thing you just did
 * off the right-hand edge.
 *
 * `clientSideOnly` marks the Mode A grid. An unsupported chip is hidden
 * there — UNLESS it is already lit, in which case it still renders so it can
 * be switched off. A constraint set on the discover or semantic path and then
 * carried into a typed search stays real (it applies again the moment the
 * text goes), and a lit filter with no visible control is worse than a
 * temporarily unenforceable one. Same rule, and the same reasoning, as
 * `BrowseChips` keeping the active category when the payload stops clearing
 * its threshold.
 */
export function orderedRefineChips(
  f: BrowseFilters,
  clientSideOnly = false,
): RefineChip[] {
  const offered = REFINE_CHIPS.filter(
    (c) => !clientSideOnly || !CLIENT_UNSUPPORTED.includes(c.field) || c.isOn(f),
  );
  const active = offered.filter((c) => c.isOn(f));
  const inactive = offered.filter((c) => !c.isOn(f));
  return [...active, ...inactive];
}

/** Field names of the lit chips — the compact form the log rows carry. */
export function activeRefineFields(f: BrowseFilters): RefineField[] {
  return REFINE_CHIPS.filter((c) => c.isOn(f)).map((c) => c.field);
}

/**
 * Zero-result copy that names what to undo.
 *
 * "Nothing matches this filter combination" is true and useless: it does not
 * say which of five taps emptied the grid, so the only recovery is to clear
 * everything and start again. This names the chip the user added last, which
 * is nearly always the one to remove.
 *
 * `lastAdded` is ignored when that chip is no longer lit — the user may have
 * removed it themselves since — and the last chip in canonical order is named
 * instead, so the sentence never points at a control that is already off.
 *
 * Returns null when no chip is active, because then the refine row is not
 * what emptied the grid and the caller should say something else.
 */
export function describeRefineEmptyState(
  f: BrowseFilters,
  lastAdded?: RefineField | null,
): { summary: string; removeLabel: string } | null {
  const active = REFINE_CHIPS.filter((c) => c.isOn(f));
  if (active.length === 0) return null;

  const adjectives = active.filter((c) => c.slot === 'adjective').map((c) => c.phrase);
  const noun = active.find((c) => c.slot === 'noun')?.phrase;
  const tail = active.filter((c) => c.slot === 'tail').map((c) => c.phrase);

  // "No <adj> <noun> <tail>" when there is a noun to attach to, "Nothing
  // <adj> <tail>" when there is not. The difference is grammar, not tone:
  // "No free films" and "Nothing free under two hours" both read; the two
  // openers swapped do not.
  const opener = noun ? 'No' : 'Nothing';
  const words = [...adjectives, noun, ...tail].filter(Boolean) as string[];

  const suggested = active.find((c) => c.field === lastAdded) ?? active[active.length - 1];
  return {
    summary: [opener, ...words].join(' '),
    removeLabel: suggested.label,
  };
}
