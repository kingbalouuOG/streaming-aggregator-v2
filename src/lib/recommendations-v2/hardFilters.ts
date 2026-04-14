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
 * Paginates through all results since Supabase default limit is 1000 rows
 * but streaming_availability can have 40k+ rows across services.
 */
export async function getAvailableTmdbIds(
  serviceIds: string[],
): Promise<Set<number>> {
  if (serviceIds.length === 0) return new Set();

  try {
    const allIds = new Set<number>();
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from('streaming_availability' as any)
        .select('tmdb_id')
        .in('service_id', serviceIds)
        .range(offset, offset + pageSize - 1);

      if (error || !data || data.length === 0) break;

      for (const r of (data as any[])) {
        allIds.add(r.tmdb_id as number);
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return allIds;
  } catch {
    return new Set();
  }
}

/**
 * Build all filter sets in parallel for the ranker.
 */
export async function buildFilterSets(serviceIds: string[]) {
  const [dismissedIds, thumbsDownIds, watchlistIds, availableTmdbIds] = await Promise.all([
    getDismissedIds(),
    getThumbsDownIds(),
    getWatchlistIds(),
    getAvailableTmdbIds(serviceIds),
  ]);

  return { dismissedIds, thumbsDownIds, watchlistIds, availableTmdbIds };
}

export { getDismissedIds };
