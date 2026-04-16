/**
 * Recommendations V2 — Hard Filters
 *
 * Constructs filter sets for the ranker: thumbs-down, watchlist, service availability.
 * Reuses existing Phase 0 infrastructure (getDismissedIds is already done).
 */

import { supabase } from '../supabase';
import { getAuthUserId, isSupabaseActive } from '../storage';
import { getWatchlist } from '../storage/watchlist';
import { getDismissedIds } from '../storage/recommendations';

/**
 * Get IDs of titles the user has thumbs-downed.
 * Returns Set<string> in "movie-12345" format.
 */
export async function getThumbsDownIds(): Promise<Set<string>> {
  if (!isSupabaseActive()) return new Set();

  const userId = getAuthUserId();
  if (!userId) return new Set();

  try {
    const { data, error } = await supabase
      .from('user_interactions' as any)
      .select('content_id, media_type')
      .eq('user_id', userId)
      .eq('event_type', 'thumbs_down');

    if (error || !data) return new Set();

    return new Set(
      (data as any[]).map((r: any) => `${r.media_type}-${r.content_id}`)
    );
  } catch {
    return new Set();
  }
}

/**
 * Get IDs of all titles on the user's watchlist.
 * Returns Set<string> in "movie-12345" format.
 */
export async function getWatchlistIds(): Promise<Set<string>> {
  try {
    const watchlist = await getWatchlist();
    return new Set(watchlist.items.map(item => `${item.type}-${item.id}`));
  } catch {
    return new Set();
  }
}

/**
 * Get TMDb IDs of titles available on the user's selected services.
 * Returns Set<number> of tmdb_ids.
 *
 * Uses the get_available_tmdb_ids RPC (migration 028) for DISTINCT
 * results, with 20 parallel page fetches instead of 42 sequential.
 * PostgREST caps at 1000 rows per request regardless of .limit(),
 * so parallel pagination is necessary.
 */
export async function getAvailableTmdbIds(
  serviceIds: string[],
): Promise<Set<number>> {
  if (serviceIds.length === 0) return new Set();

  try {
    const PAGE_COUNT = 20;
    const PAGE_SIZE = 1000;

    const pages = Array.from({ length: PAGE_COUNT }, (_, i) =>
      supabase.rpc('get_available_tmdb_ids', { service_ids: serviceIds })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
    );

    const results = await Promise.all(pages);
    const allIds = new Set<number>();

    for (const r of results) {
      for (const row of ((r.data as any[]) || [])) {
        allIds.add(row.tmdb_id as number);
      }
    }

    return allIds;
  } catch {
    return new Set();
  }
}

export interface FilterSets {
  dismissedIds: Set<string>;
  thumbsDownIds: Set<string>;
  watchlistIds: Set<string>;
  availableTmdbIds: Set<number>;
}

/**
 * Build all filter sets in parallel for the ranker.
 */
export async function buildFilterSets(serviceIds: string[]): Promise<FilterSets> {
  const [dismissedIds, thumbsDownIds, watchlistIds, availableTmdbIds] = await Promise.all([
    getDismissedIds(),
    getThumbsDownIds(),
    getWatchlistIds(),
    getAvailableTmdbIds(serviceIds),
  ]);

  return { dismissedIds, thumbsDownIds, watchlistIds, availableTmdbIds };
}

export { getDismissedIds };
