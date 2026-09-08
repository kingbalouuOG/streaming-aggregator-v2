import { useCallback, useSyncExternalStore } from 'react';

import { contentMediaType, isDocumentary, type ContentType } from '@/components/browseFilters';
import type { ContentItem } from '@/lib/types/content';

// Quick filters on New and For You (recommendation 2026-09-08-002 §1).
//
// A chip says "tonight", not "me". So this state is deliberately the least
// durable thing in the app:
//
//   - EPHEMERAL (§1.6). Nothing is persisted. Module scope means the
//     selection survives a tab switch — which screen-local state would
//     not, since the tab bar keeps screens mounted but remounts nothing —
//     and dies with the process on a cold start. A sticky filter on a tab
//     called "New" makes the tab lie, and is the classic "why is my feed
//     empty" support ticket.
//   - PER-SURFACE. New and For You hold their own selection. Filtering
//     "what's new" and filtering "what's for me" are different intents.
//   - NOT A TASTE SIGNAL (§1.7). Changes are logged (see
//     `useQuickFilterLog`) and never learned from. The explicit, visible,
//     reversible control for a movie/TV preference is the contentMix
//     slider in Profile; if the logging later shows someone filtering to
//     Movies on most opens, the right move is to SUGGEST moving that
//     slider, not to nudge their vector behind their back.
//
// Why not Zustand/Context: this is two enum values. `useSyncExternalStore`
// over a module-scoped object is the whole implementation, with no provider
// to thread through the tab layout and no re-render of unrelated screens.

/** Chip labels, in strip order. "All" always renders (§1.5). */
export const QUICK_FILTER_CATEGORIES = ['All', 'Movies', 'TV', 'Documentaries'] as const;

export type QuickFilterCategory = (typeof QUICK_FILTER_CATEGORIES)[number];

/** The two surfaces that carry a strip. Browse is untouched (it has the full sheet). */
export type QuickFilterSurface = 'new' | 'forYou';

/**
 * Below this a rail hides rather than showing a stub (§1.2). Cheap to
 * tune — it is one number and nothing else depends on its value.
 */
export const THIN_RAIL_MIN = 4;

/**
 * A chip renders only when the surface's current payload holds at least
 * this many matching items (§1.5). This is what keeps a Documentaries chip
 * off a For You page whose taste vector never surfaces any, without a
 * per-surface config — and what makes Anime cheap to reintroduce later.
 */
export const CHIP_MIN_MATCHES = 8;

/** The `BrowseFilters` vocabulary, unchanged — chips set `contentType`. */
export function categoryToContentType(category: QuickFilterCategory): ContentType {
  switch (category) {
    case 'Movies':
      return 'movie';
    case 'TV':
      return 'tv';
    case 'Documentaries':
      return 'doc';
    default:
      return 'all';
  }
}

/**
 * The predicate, shared by filtering and by chip-visibility counting so the
 * two cannot disagree about what a chip promises.
 *
 * Documentaries is a genre test; Movies and TV are media-type tests that
 * include documentaries (§1.1). Neither reads `item.type`, which the TMDb
 * adapters overwrite with 'doc'.
 */
export function matchesCategory(item: ContentItem, category: QuickFilterCategory): boolean {
  switch (category) {
    case 'Movies':
      return contentMediaType(item) === 'movie';
    case 'TV':
      return contentMediaType(item) === 'tv';
    case 'Documentaries':
      return isDocumentary(item);
    default:
      return true;
  }
}

/** Filter a rail. Identity for "All", so callers need no special case. */
export function applyQuickFilter<T extends ContentItem>(
  items: readonly T[],
  category: QuickFilterCategory,
): T[] {
  if (category === 'All') return [...items];
  return items.filter((item) => matchesCategory(item, category));
}

/** True when a rail has too few survivors to be worth a row (§1.2). */
export function isThinRail(items: readonly unknown[], min: number = THIN_RAIL_MIN): boolean {
  return items.length < min;
}

/**
 * Which chips this payload can honestly offer.
 *
 * "All" is always in the result. Every other chip needs
 * {@link CHIP_MIN_MATCHES} matches across the items passed in — the union
 * of everything the surface is currently rendering, so the count answers
 * "is there enough here to be worth filtering to" rather than "does any
 * single rail have enough".
 */
export function visibleCategories(items: readonly ContentItem[]): QuickFilterCategory[] {
  return QUICK_FILTER_CATEGORIES.filter((category) => {
    if (category === 'All') return true;
    let n = 0;
    for (const item of items) {
      if (matchesCategory(item, category) && ++n >= CHIP_MIN_MATCHES) return true;
    }
    return false;
  });
}

// ── The store ────────────────────────────────────────────────────────

interface SurfaceState {
  category: QuickFilterCategory;
  /**
   * Increments on every user-driven change. The screens log against this
   * rather than against `category`, so tapping Movies → All → Movies is
   * three events, not two — and so the initial 'All' (nonce 0) is never
   * logged as though someone chose it.
   */
  nonce: number;
}

const INITIAL: SurfaceState = { category: 'All', nonce: 0 };

const state: Record<QuickFilterSurface, SurfaceState> = {
  new: INITIAL,
  forYou: INITIAL,
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Set a surface's chip.
 *
 * Returns nothing and logs nothing: the store cannot know how many rails
 * survived, and a filter event without those counts is not worth writing.
 * The screen owns the emit — see `useQuickFilterLog`.
 */
export function setQuickFilter(
  surface: QuickFilterSurface,
  category: QuickFilterCategory,
): void {
  const current = state[surface];
  if (current.category === category) return;
  state[surface] = { category, nonce: current.nonce + 1 };
  for (const listener of listeners) listener();
}

/**
 * Read a surface's chip state.
 *
 * The snapshot is the per-surface object, which is replaced (not mutated)
 * on every change — `useSyncExternalStore` compares by reference, so
 * returning a fresh object here would loop forever.
 */
export function useQuickFilter(surface: QuickFilterSurface): SurfaceState & {
  setCategory: (category: QuickFilterCategory) => void;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state[surface],
    () => state[surface],
  );
  const setCategory = useCallback(
    (category: QuickFilterCategory) => setQuickFilter(surface, category),
    [surface],
  );
  return { ...snapshot, setCategory };
}

/** Test seam — the store is module state, so suites must be able to clear it. */
export function resetQuickFilters(): void {
  state.new = INITIAL;
  state.forYou = INITIAL;
  for (const listener of listeners) listener();
}
