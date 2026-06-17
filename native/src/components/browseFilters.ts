import type { ContentItem, ServiceId } from '@/lib/types/content';

// Browse filter model + client-side apply/sort (native v1). The web supports
// 9 axes; native filters the axes ContentItem actually carries: services,
// type, genre, rating, runtime, watched. (cost / language need per-item
// availability the native search doesn't fetch yet — deferred.)

export type ContentType = 'all' | 'movie' | 'tv' | 'doc';
export type RuntimeBand = 'any' | 'under_60' | '60_120' | 'over_120';
export type WatchedFilter = 'all' | 'hide' | 'only';
export type SortMode = 'best' | 'popularity' | 'rating' | 'a_z' | 'z_a';

export interface BrowseFilters {
  services: ServiceId[]; // empty = all
  contentType: ContentType;
  genres: string[]; // display names; empty = all
  minRating: number; // 0–10
  runtime: RuntimeBand;
  showWatched: WatchedFilter;
}

export const DEFAULT_FILTERS: BrowseFilters = {
  services: [],
  contentType: 'all',
  genres: [],
  minRating: 0,
  runtime: 'any',
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
  if (f.showWatched !== 'all') n += 1;
  return n;
}

export function applyBrowseFilters(
  items: ContentItem[],
  f: BrowseFilters,
  isWatched: (id: string) => boolean,
): ContentItem[] {
  return items.filter((it) => {
    // Only exclude by service when the item actually carries a service set.
    // Search-result items leave services: [] (resolved lazily for badges),
    // so dropping unknowns here would empty the grid the moment a service
    // chip is active. Service-scoped browsing happens server-side via
    // /discover (useBrowseDiscover) instead.
    if (f.services.length && it.services.length > 0 && !it.services.some((s) => f.services.includes(s)))
      return false;
    if (f.contentType !== 'all') {
      const t = it.type === 'tv' ? 'tv' : it.type === 'doc' ? 'doc' : 'movie';
      if (t !== f.contentType) return false;
    }
    if (f.genres.length && (!it.genre || !f.genres.includes(it.genre))) return false;
    if (f.minRating > 0 && (it.rating ?? 0) < f.minRating) return false;
    if (f.runtime !== 'any') {
      const r = it.runtime ?? 0;
      if (f.runtime === 'under_60' && !(r > 0 && r < 60)) return false;
      if (f.runtime === '60_120' && !(r >= 60 && r <= 120)) return false;
      if (f.runtime === 'over_120' && !(r > 120)) return false;
    }
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
