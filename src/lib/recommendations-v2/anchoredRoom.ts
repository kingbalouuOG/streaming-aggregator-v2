/**
 * Anchored room generation primitive.
 *
 * Given an anchor title (tmdb_id, media_type), produces a set of
 * available, non-dismissed, non-disliked neighbouring titles from the
 * same embedding neighbourhood. Used by:
 *
 *   - "Because You Watched [Title]" rows (excludes watchlist titles)
 *   - "If you love [Title]" anchored mood rooms (includes watchlist
 *     titles — the row is for discovery within the user's full
 *     catalogue, including titles they've already shortlisted)
 *
 * Per the Phase 4 Title-Anchored Mood Rooms kick-off §1.6, this
 * primitive lives at the package level so future detail-page features
 * ("Mood room from this title") can call the same code path. Anchored
 * mood rooms is the first surface to consume it; Because You Watched
 * is migrated to use it as part of this refactor (one primitive, not
 * two near-duplicate functions).
 */

import { supabase } from '../supabase';
import { applyAnchorHardFilters } from './hardFilters';
import { titleRowToContentItem } from './titleAdapter';
import {
  distanceToSimilarity,
  scoreToMatchPercentage,
} from './weights';
import type {
  MatchedTitle,
  ExtendedTitleRow,
  ContentItem,
} from './types';
import { EXTENDED_TITLE_SELECT as TITLE_SELECT } from './types';
import type { FilterSets } from './hardFilters';


export interface BuildAnchoredRoomOptions {
  anchorTmdbId: number;
  anchorMediaType: 'movie' | 'tv';
  filterSets: FilterSets;
  /** Final cap on returned titles. Default 30 (anchored mood rooms). */
  limit?: number;
  /**
   * Raw NN over-fetch from `match_titles_by_vector`. Default 200, which
   * leaves comfortable headroom for service + exclusion filtering before
   * the cap. The RPC auto-sets `hnsw.ef_search >= 100` (migration 025)
   * so no client-side tuning needed at this match_limit.
   */
  matchLimit?: number;
  /**
   * Whether to exclude titles already on the user's watchlist. Default
   * true (Because You Watched semantics: row is "more like X, things
   * you haven't shortlisted yet"). Anchored mood rooms set false —
   * a room is "this neighbourhood as a place", and watchlist items
   * belong in their neighbourhood.
   */
  excludeWatchlist?: boolean;
}


export interface BuildAnchoredRoomResult {
  /** Cards to render, in cosine-distance order from the anchor. */
  items: ContentItem[];
  /** Raw NN count (post-RPC, pre-filter). Useful for instrumentation. */
  rawMatchCount: number;
  /** Count after service/exclusion filtering. */
  filteredCount: number;
}


/**
 * Build a set of room titles around an anchor.
 *
 * Steps:
 *   1. Read the anchor's embedding from `titles`.
 *   2. Call `match_titles_by_vector` with the anchor's embedding.
 *   3. Drop the anchor itself from results.
 *   4. Apply hard filters (availability, dismissed, thumbs_down,
 *      optionally watchlist).
 *   5. Cap to `limit` and hydrate ContentItems via extended metadata.
 *
 * Returns empty result on any step failure — the caller decides whether
 * an empty room is renderable.
 */
export async function buildAnchoredRoom(
  opts: BuildAnchoredRoomOptions,
): Promise<BuildAnchoredRoomResult> {
  const {
    anchorTmdbId,
    anchorMediaType,
    filterSets,
    limit = 30,
    matchLimit = 200,
    excludeWatchlist = true,
  } = opts;

  // 1. Fetch anchor embedding.
  const { data: anchorRows, error: anchorError } = await supabase
    .from('titles')
    .select('embedding')
    .eq('tmdb_id', anchorTmdbId)
    .eq('media_type', anchorMediaType)
    .limit(1);

  if (anchorError || !anchorRows?.length) {
    console.error('[anchoredRoom] embedding fetch failed:', anchorError?.message);
    return { items: [], rawMatchCount: 0, filteredCount: 0 };
  }

  // pgvector wire format: PostgREST serialises vector(1536) as a string.
  // Locked pattern from Phase 1 wire format spike.
  const embeddingStr = (anchorRows[0] as { embedding: string | null }).embedding;
  if (!embeddingStr) return { items: [], rawMatchCount: 0, filteredCount: 0 };

  let embedding: number[];
  try {
    embedding = JSON.parse(embeddingStr);
  } catch {
    console.error('[anchoredRoom] failed to parse anchor embedding');
    return { items: [], rawMatchCount: 0, filteredCount: 0 };
  }

  // 2. Vector search.
  const vectorStr = `[${embedding.join(',')}]`;
  const { data: matchedRaw, error: rpcError } = await supabase
    .rpc('match_titles_by_vector', {
      query_vector: vectorStr,
      match_limit: matchLimit,
    });

  if (rpcError || !matchedRaw) {
    console.error('[anchoredRoom] match_titles_by_vector failed:', rpcError?.message);
    return { items: [], rawMatchCount: 0, filteredCount: 0 };
  }

  const matched = matchedRaw as MatchedTitle[];
  const rawMatchCount = matched.length;

  // 3. Drop the anchor itself + 4. apply hard filters.
  const withoutAnchor = matched.filter(
    (t) => !(t.tmdb_id === anchorTmdbId && t.media_type === anchorMediaType),
  );
  const filtered = applyAnchorHardFilters(withoutAnchor, filterSets, {
    excludeWatchlist,
  });

  if (filtered.length === 0) {
    return { items: [], rawMatchCount, filteredCount: 0 };
  }

  // 5. Cap and hydrate.
  const top = filtered.slice(0, limit);
  const tmdbIds = [...new Set(top.map((t) => t.tmdb_id))];
  const metadata = await fetchExtendedMetadata(tmdbIds);

  const items: ContentItem[] = [];
  for (const match of top) {
    const meta = metadata.get(`${match.media_type}-${match.tmdb_id}`);
    if (!meta) continue;
    const similarity = distanceToSimilarity(match.distance);
    items.push(titleRowToContentItem(meta, scoreToMatchPercentage(similarity)));
  }

  return { items, rawMatchCount, filteredCount: filtered.length };
}


async function fetchExtendedMetadata(
  tmdbIds: number[],
): Promise<Map<string, ExtendedTitleRow>> {
  const map = new Map<string, ExtendedTitleRow>();
  if (tmdbIds.length === 0) return map;

  const { data: rows, error } = await supabase
    .from('titles')
    .select(TITLE_SELECT)
    .in('tmdb_id', tmdbIds);

  if (error || !rows) {
    console.error('[anchoredRoom] metadata fetch failed:', error?.message);
    return map;
  }

  for (const row of rows) {
    const typed = row as unknown as ExtendedTitleRow;
    map.set(`${typed.media_type}-${typed.tmdb_id}`, typed);
  }

  return map;
}
