/**
 * Quick-filter vocabulary and selection rules (recommendation
 * 2026-09-08-002 §1).
 *
 * The pure half of the feature. The React store that holds which chip is
 * active lives in `native/src/state/quickFilter.ts`; everything that can be
 * decided without a component — what a category means, which rails survive,
 * which chips a payload can honestly offer — lives here, because the root
 * vitest suite only covers `src/` and this is the logic worth testing.
 *
 * Dependency-free apart from type imports and `documentary.ts`, so it is
 * safe to import from the Worker bundle as well as the app.
 */

import type { ContentItem } from '../types/content';
import { contentMediaType, isDocumentary } from './documentary';

/** Chip labels, in strip order. "All" always renders (§1.5). */
export const QUICK_FILTER_CATEGORIES = ['All', 'Movies', 'TV', 'Documentaries'] as const;

export type QuickFilterCategory = (typeof QUICK_FILTER_CATEGORIES)[number];

/**
 * Below this a rail hides rather than showing a stub (§1.2). Cheap to
 * tune — it is one number and nothing else depends on its value.
 */
export const THIN_RAIL_MIN = 4;

/**
 * A chip renders only when the surface's current payload holds at least
 * this many matching items (§1.5). This is what keeps a Documentaries chip
 * off a For You page whose taste vector never surfaces any, without needing
 * a per-surface config — and what makes Anime cheap to reintroduce later,
 * once `originalLanguage` is populated on both adapter paths.
 */
export const CHIP_MIN_MATCHES = 8;

/**
 * The predicate, shared by filtering and by chip-visibility counting so the
 * two cannot disagree about what a chip promises.
 *
 * Documentaries is a genre test; Movies and TV are media-type tests that
 * INCLUDE documentaries — a documentary film is still a film (§1.1).
 * Neither reads `item.type`, which the TMDb adapters overwrite with 'doc'.
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
 * {@link CHIP_MIN_MATCHES} matches across the items passed in — the union of
 * everything the surface renders, so the count answers "is there enough here
 * to be worth filtering to" rather than "does any single rail have enough".
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

/**
 * Chip → the `BrowseFilters.contentType` value. The vocabulary is unchanged
 * (§1.1) — only the meaning of 'doc' was fixed.
 */
export function categoryToContentType(
  category: QuickFilterCategory,
): 'all' | 'movie' | 'tv' | 'doc' {
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
