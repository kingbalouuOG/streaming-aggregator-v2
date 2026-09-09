/**
 * The Browse filter model — vocabulary, defaults, client-side apply, sort.
 *
 * Lives in the shared tree for the reason `quickFilter.ts` does: it is pure,
 * the root vitest suite only covers `src/`, and native has no test runner.
 * `native/src/components/browseFilters.ts` re-exports the whole surface, so
 * every native import site is unchanged.
 *
 * Two axes were added by the presets session (recommendation 2026-09-08-002
 * §2.2): `released` and `cost`. They complete the motivating sentence — "a
 * new movie I don't have to pay for that isn't cheesy crap" — which needed a
 * recency axis and a cost axis on top of `contentType` and `minRating`.
 *
 * Dependency-free apart from type imports and `documentary.ts`, so it is
 * safe to import from the Worker bundle as well as the app.
 */

import type { ContentItem, ServiceId } from '../types/content';
import { contentMediaType, isDocumentary } from './documentary';

// `'doc'` is unchanged as a VALUE — only its meaning is fixed. It used to
// mean `item.type === 'doc'`, which the engine path never sets; it now means
// TMDb genre 99 on either media type (recommendation 2026-09-08-002 §1.1).
// 'movie' / 'tv' mean media type alone and INCLUDE documentaries: a
// documentary film is still a film.
export type ContentType = 'all' | 'movie' | 'tv' | 'doc';
export type RuntimeBand = 'any' | 'under_60' | '60_120' | 'over_120';
export type WatchedFilter = 'all' | 'hide' | 'only';
export type SortMode = 'best' | 'popularity' | 'rating' | 'a_z' | 'z_a';

/**
 * Recency window. One value beyond "any" on purpose — this is the *Newer*
 * refinement, not a decade picker. Decades stay a FilterSheet concern.
 */
export type ReleasedWindow = 'any' | 'last_12_months';

/**
 * Cost, in the only sense a subscriber cares about (Joe, 2026-09-08):
 *
 *   free — included in something you already pay for, or genuinely free.
 *          A Netflix title is free. An Amazon or Apple rental is not.
 *   any  — no constraint.
 *
 * Deliberately NOT the web's three-value `Cost` (`free | rent | buy`). The
 * native axis is a one-tap refinement with an honest meaning, and "show me
 * only things I have to pay extra for" is not an intent anyone has.
 */
export type CostFilter = 'any' | 'free';

export interface BrowseFilters {
  services: ServiceId[]; // empty = all
  contentType: ContentType;
  genres: string[]; // display names; empty = all
  minRating: number; // 0–10
  runtime: RuntimeBand;
  released: ReleasedWindow;
  cost: CostFilter;
  showWatched: WatchedFilter;
}

export const DEFAULT_FILTERS: BrowseFilters = {
  services: [],
  contentType: 'all',
  genres: [],
  minRating: 0,
  runtime: 'any',
  released: 'any',
  cost: 'any',
  showWatched: 'all',
};

export const GENRE_OPTIONS = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'Horror',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
] as const;

export function countActiveFilters(f: BrowseFilters): number {
  let n = 0;
  if (f.services.length) n += 1;
  if (f.contentType !== 'all') n += 1;
  if (f.genres.length) n += 1;
  if (f.minRating > 0) n += 1;
  if (f.runtime !== 'any') n += 1;
  if (f.released !== 'any') n += 1;
  if (f.cost !== 'any') n += 1;
  if (f.showWatched !== 'all') n += 1;
  return n;
}

/**
 * The earliest release year still inside the `last_12_months` window.
 *
 * `ContentItem` carries a `year`, not a date, so the client-side test is
 * necessarily coarser than the server-side one: `year >= currentYear - 1`
 * admits up to 24 months rather than exactly 12. Tightening it to
 * `>= currentYear` would empty the grid every January, which is a worse lie
 * than a generous boundary. Both `/discover` (`primary_release_date.gte`)
 * and the semantic path apply the exact window server-side; this is only the
 * post-filter over an already-narrowed list.
 */
export function minYearForWindow(
  window: ReleasedWindow,
  currentYear: number = new Date().getFullYear(),
): number | null {
  return window === 'last_12_months' ? currentYear - 1 : null;
}

export function applyBrowseFilters(
  items: ContentItem[],
  f: BrowseFilters,
  isWatched: (id: string) => boolean,
  currentYear: number = new Date().getFullYear(),
): ContentItem[] {
  const minYear = minYearForWindow(f.released, currentYear);
  return items.filter((it) => {
    // Only exclude by service when the item actually carries a service set.
    // Search-result items leave services: [] (resolved lazily for badges),
    // so dropping unknowns here would empty the grid the moment a service
    // chip is active. Service-scoped browsing happens server-side via
    // /discover (useBrowseDiscover) instead.
    if (f.services.length && it.services.length > 0 && !it.services.some((s) => f.services.includes(s)))
      return false;
    if (f.contentType === 'doc') {
      if (!isDocumentary(it)) return false;
    } else if (f.contentType !== 'all') {
      // Media type only — deliberately NOT `it.type`, which the TMDb
      // adapters overwrite with 'doc' and so cannot answer this.
      if (contentMediaType(it) !== f.contentType) return false;
    }
    if (f.genres.length && (!it.genre || !f.genres.includes(it.genre))) return false;
    if (f.minRating > 0 && (it.rating ?? 0) < f.minRating) return false;
    if (f.runtime !== 'any') {
      const r = it.runtime ?? 0;
      if (f.runtime === 'under_60' && !(r > 0 && r < 60)) return false;
      if (f.runtime === '60_120' && !(r >= 60 && r <= 120)) return false;
      if (f.runtime === 'over_120' && !(r > 120)) return false;
    }
    if (minYear !== null && (it.year ?? 0) < minYear) return false;
    // `cost` is deliberately absent. Nothing on ContentItem carries a stream
    // type, so a client-side free/paid test would have to guess — and would
    // guess wrong in the one direction that matters, hiding titles the user
    // *can* watch. The axis is applied server-side only: TMDb
    // `with_watch_monetization_types` on the /discover path
    // (useBrowseDiscover) and the `subscription_included_titles` RPC on the
    // semantic path (migration 080). A caller that filters client-side and
    // finds `cost` ignored is seeing the intended behaviour.
    if (f.showWatched === 'hide' && isWatched(it.id)) return false;
    if (f.showWatched === 'only' && !isWatched(it.id)) return false;
    return true;
  });
}

export function sortItems(items: ContentItem[], mode: SortMode): ContentItem[] {
  if (mode === 'best') return items;
  const out = [...items];
  switch (mode) {
    case 'popularity':
      out.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      break;
    case 'rating':
      out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case 'a_z':
      out.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'z_a':
      out.sort((a, b) => b.title.localeCompare(a.title));
      break;
  }
  return out;
}

export const SORT_LABELS: Record<SortMode, string> = {
  best: 'Best match',
  popularity: 'Popularity',
  rating: 'Rating',
  a_z: 'A–Z',
  z_a: 'Z–A',
};
