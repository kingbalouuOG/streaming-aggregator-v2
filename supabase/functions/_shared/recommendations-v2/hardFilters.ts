// Mirror of src/lib/recommendations-v2/hardFilters.ts — IN-466 / ADR-011.
//
// Edge-side adjustments vs the client copy:
// - No localStorage cache for available_tmdb_ids. Edge Function instances
//   don't share state safely; the RPC round-trip is sub-50ms inside
//   Supabase's network anyway.
// - Watchlist reads from the `watchlist` Supabase table (not localStorage).
//   Documented offline edge cases: an offline add hasn't synced yet, so
//   the Edge Function won't filter it out → the title may appear in
//   Recommended For You until the next render after sync. Self-heals.
// - getDismissedIds + getThumbsDownIds + getWatchlistIds take UserScope
//   instead of using getAuthUserId().
// - getAvailableTmdbIds takes the raw SupabaseClient (no user_id on the
//   RPC).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserScope } from '../userScope.ts';
import type { MatchedTitle } from './types.ts';

export async function getThumbsDownIds(scope: UserScope): Promise<Set<string>> {
  try {
    const { data, error } = await scope
      .select('user_interactions', 'content_id, media_type')
      .eq('event_type', 'thumbs_down');

    if (error || !data) return new Set();

    return new Set(
      (data as any[]).map((r: any) => `${r.media_type}-${r.content_id}`),
    );
  } catch {
    return new Set();
  }
}

export async function getDismissedIds(scope: UserScope): Promise<Set<string>> {
  try {
    const { data, error } = await scope
      .select('user_interactions', 'content_id, media_type')
      .eq('event_type', 'not_interested');

    if (error || !data) return new Set();

    return new Set(
      (data as any[])
        .filter((r) => r.content_id != null && r.media_type != null)
        .map((r: any) => `${r.media_type}-${r.content_id}`),
    );
  } catch {
    return new Set();
  }
}

/**
 * Read watchlist IDs from the `watchlist` Supabase table. The client
 * copy reads from localStorage; the Edge Function relies on the table
 * being kept in sync by the client's writes. See top-of-file note for
 * the offline-add edge case.
 *
 * Note: the `watchlist` table uses `tmdb_id` (not `content_id` like
 * `user_interactions`). The shared filter set keys still use the
 * `${mediaType}-${id}` format.
 */
export async function getWatchlistIds(scope: UserScope): Promise<Set<string>> {
  try {
    const { data, error } = await scope.select('watchlist', 'tmdb_id, media_type');
    if (error || !data) return new Set();

    return new Set(
      (data as any[])
        .filter((r) => r.tmdb_id != null && r.media_type != null)
        .map((r: any) => `${r.media_type}-${r.tmdb_id}`),
    );
  } catch {
    return new Set();
  }
}

export async function getAvailableTmdbIds(
  client: SupabaseClient,
  serviceIds: string[],
): Promise<Set<number>> {
  if (serviceIds.length === 0) return new Set();

  try {
    const { data, error } = await client.rpc('get_available_tmdb_ids', {
      service_ids: serviceIds,
    });
    if (error || !data) return new Set();
    const ids = Array.isArray(data) ? data : [];
    return new Set<number>(ids as number[]);
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
 *
 * NOTE: signature INTENTIONALLY diverges from the client copy in
 * src/lib/recommendations-v2/hardFilters.ts. The client uses
 * `buildFilterSets(serviceIds: string[])` because it has access to a
 * Supabase client singleton + getAuthUserId() globals. The Edge Function
 * passes them explicitly. Drift CI catches file-level drift; this
 * comment exists so the next person to "fix the mirror" doesn't break
 * the divergence.
 */
export async function buildFilterSets(
  client: SupabaseClient,
  scope: UserScope,
  serviceIds: string[],
): Promise<FilterSets> {
  const [dismissedIds, thumbsDownIds, watchlistIds, availableTmdbIds] = await Promise.all([
    getDismissedIds(scope),
    getThumbsDownIds(scope),
    getWatchlistIds(scope),
    getAvailableTmdbIds(client, serviceIds),
  ]);
  return { dismissedIds, thumbsDownIds, watchlistIds, availableTmdbIds };
}

export function applyAnchorHardFilters(
  titles: MatchedTitle[],
  filterSets: FilterSets,
  options: { excludeWatchlist?: boolean } = {},
): MatchedTitle[] {
  const { excludeWatchlist = true } = options;
  return titles.filter((t) => {
    const contentKey = `${t.media_type}-${t.tmdb_id}`;
    if (
      filterSets.availableTmdbIds.size > 0
      && !filterSets.availableTmdbIds.has(t.tmdb_id)
    ) return false;
    if (filterSets.dismissedIds.has(contentKey)) return false;
    if (filterSets.thumbsDownIds.has(contentKey)) return false;
    if (excludeWatchlist && filterSets.watchlistIds.has(contentKey)) return false;
    return true;
  });
}
