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
import type { MatchedTitle } from './types';

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
 *
 * Cold-start dominates For You's time-to-first-render — 20 paginated
 * RPCs over residential WAN was the 5s spinner Joe saw on first open.
 * We cache the resolved Set in localStorage keyed on the sorted service
 * id list with a 10-minute TTL. Service changes invalidate via key
 * change (different sorted list). On cache hit, this function returns
 * synchronously-ish from JSON parse, no RPC.
 */
const AVAILABLE_IDS_CACHE_PREFIX = 'videx.available_tmdb_ids.v1';
const AVAILABLE_IDS_TTL_MS = 10 * 60 * 1000;

interface AvailableIdsCacheEntry {
  ids: number[];
  computedAt: string;
}

function buildAvailableIdsCacheKey(serviceIds: string[]): string {
  const sorted = [...serviceIds].sort().join(',');
  return `${AVAILABLE_IDS_CACHE_PREFIX}.${sorted}`;
}

function readAvailableIdsCache(key: string): Set<number> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AvailableIdsCacheEntry;
    if (!Array.isArray(parsed.ids) || typeof parsed.computedAt !== 'string') return null;
    const age = Date.now() - new Date(parsed.computedAt).getTime();
    if (age > AVAILABLE_IDS_TTL_MS) return null;
    return new Set(parsed.ids);
  } catch {
    return null;
  }
}

function writeAvailableIdsCache(key: string, ids: Set<number>): void {
  try {
    const entry: AvailableIdsCacheEntry = {
      ids: Array.from(ids),
      computedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota exhausted or storage disabled — drop silently.
  }
}

export async function getAvailableTmdbIds(
  serviceIds: string[],
): Promise<Set<number>> {
  if (serviceIds.length === 0) return new Set();

  const cacheKey = buildAvailableIdsCacheKey(serviceIds);
  const cached = readAvailableIdsCache(cacheKey);
  if (cached) return cached;

  try {
    // Migration 035 changed the RPC return shape from TABLE → jsonb
    // (single-row JSONB array). One round trip instead of 20 paginated
    // calls; saves ~1.5-2s on cold start over WAN.
    const { data, error } = await supabase.rpc('get_available_tmdb_ids', {
      service_ids: serviceIds,
    });
    if (error || !data) return new Set();

    // Migration 035 changed get_available_tmdb_ids to return a JSONB
    // number array; database.types.ts still reflects the pre-035
    // TABLE return shape until regenerated. Cast through unknown.
    const ids = Array.isArray(data) ? data : [];
    const allIds = new Set<number>(ids as unknown as number[]);

    if (allIds.size > 0) writeAvailableIdsCache(cacheKey, allIds);
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
 *
 * NOTE: signature INTENTIONALLY diverges from the Edge mirror at
 * supabase/functions/_shared/recommendations-v2/hardFilters.ts which
 * takes `(client, scope, serviceIds)` because it can't use the Supabase
 * client singleton or the localStorage-backed getAuthUserId(). Drift CI
 * catches file-level drift; this comment exists so the next person to
 * "fix the mirror" doesn't break the divergence.
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


/**
 * Apply hard filters to a list of matched titles for an anchored row
 * (Because You Watched, anchored mood rooms, future detail-page rooms).
 *
 * Differs from the pipeline's internal `applyHardFilters` only in that
 * watchlist exclusion is opt-out: anchored mood rooms keep watchlist
 * titles in the room (the row is "this neighbourhood as a place"; a
 * shortlisted title belongs alongside its neighbours), while Because
 * You Watched excludes them (the row is "more like X you haven't
 * shortlisted yet").
 *
 * Availability filtering is skipped when `availableTmdbIds` is empty
 * (treated as "no service constraint" rather than "no titles available")
 * — same convention as the pipeline.
 */
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
