/**
 * Recommendations V2 — Minimal Ranker
 *
 * Stage-1-only: cosine similarity retrieval via match_titles_by_vector,
 * hard filters (services, dismissed, thumbs-down, watchlist), raw sort.
 *
 * No Stage 2 weighting, no slider modulation, no diversity constraints.
 * Those are Phase 4.
 */

import { supabase } from '../supabase';
import { titleRowToContentItem } from './titleAdapter';
import type { RankerInput, MatchedTitle, TitleRow, ContentItem } from './types';
import { HIDDEN_GEMS_FILTERS } from './types';

// Over-fetch enough to find matches after service filtering.
// With ~20k titles and ~300-500 available per user, we need a large
// pool to guarantee overlap. pgvector HNSW is fast even at 2000.
const OVERFETCH_MULTIPLIER = 100;

/**
 * Rank titles by cosine similarity to the user's taste vector.
 * Applies hard filters and returns ContentItem[].
 */
export async function rankTitles(input: RankerInput): Promise<ContentItem[]> {
  const {
    tasteVector,
    availableTmdbIds,
    dismissedIds,
    thumbsDownIds,
    watchlistIds,
    mediaTypeFilter,
    limit = 20,
  } = input;

  // Over-fetch to compensate for hard filtering
  const fetchLimit = limit * OVERFETCH_MULTIPLIER;

  // Stage 1: cosine similarity retrieval via RPC
  const vectorStr = `[${tasteVector.join(',')}]`;

  const { data: matched, error: rpcError } = await supabase
    .rpc('match_titles_by_vector', {
      query_vector: vectorStr,
      match_limit: fetchLimit,
    });

  if (rpcError || !matched) {
    console.error('[Ranker] match_titles_by_vector failed:', (rpcError as any)?.message);
    return [];
  }

  const matchedTitles = matched as MatchedTitle[];

  console.log('[Ranker] RPC returned:', matchedTitles.length, 'titles, available set:', availableTmdbIds.size);

  if (matchedTitles.length === 0) return [];

  // Hard filter (availability set pre-built by caller via buildFilterSets)
  const filtered = matchedTitles.filter(t => {
    const contentKey = `${t.media_type}-${t.tmdb_id}`;

    // Service availability
    if (availableTmdbIds.size > 0 && !availableTmdbIds.has(t.tmdb_id)) return false;

    // Dismissed (not interested)
    if (dismissedIds.has(contentKey)) return false;

    // Thumbs down
    if (thumbsDownIds.has(contentKey)) return false;

    // Already on watchlist
    if (watchlistIds.has(contentKey)) return false;

    // Media type filter
    if (mediaTypeFilter && t.media_type !== mediaTypeFilter) return false;

    return true;
  });

  // Already sorted by cosine distance (ascending = most similar first)
  console.log('[Ranker] After hard filters:', filtered.length, 'titles remain');

  const topIds = filtered.slice(0, limit).map(t => t.tmdb_id);

  if (topIds.length === 0) return [];

  // Fetch full metadata for the top titles
  const { data: titleRows, error: metaError } = await supabase
    .from('titles' as any)
    .select(
      'tmdb_id, media_type, title, poster_path, backdrop_path, overview, ' +
      'release_date, release_year, genre_ids, vote_average, vote_count, ' +
      'popularity, original_language, runtime'
    )
    .in('tmdb_id', topIds);

  if (metaError || !titleRows) {
    console.error('[Ranker] metadata fetch failed:', (metaError as any)?.message);
    return [];
  }

  // Build lookup and preserve cosine distance ordering
  const metaMap = new Map<string, TitleRow>();
  for (const row of (titleRows as any[])) {
    metaMap.set(`${row.media_type}-${row.tmdb_id}`, row as TitleRow);
  }

  // Map distance to a match percentage (0-100) for UI display
  const results: ContentItem[] = [];
  for (const match of filtered.slice(0, limit)) {
    const meta = metaMap.get(`${match.media_type}-${match.tmdb_id}`);
    if (!meta) continue;

    // pgvector <=> returns cosine distance (0 = identical, 2 = opposite)
    // Convert to percentage: 100 - (distance * 50)
    const matchPct = Math.round(Math.max(30, Math.min(99, 100 - match.distance * 50)));

    results.push(titleRowToContentItem(meta, matchPct));
  }

  return results;
}

/**
 * Rank hidden gems: cosine similarity + popularity cap overlay.
 * Returns low-popularity, high-taste-fit titles.
 */
export async function rankHiddenGems(input: RankerInput): Promise<ContentItem[]> {
  const {
    tasteVector,
    availableTmdbIds,
    dismissedIds,
    thumbsDownIds,
    watchlistIds,
    mediaTypeFilter,
    limit = HIDDEN_GEMS_FILTERS.maxResults,
  } = input;

  // Fetch a large pool — need enough for service filtering + popularity filtering
  const fetchLimit = 2000;

  const vectorStr = `[${tasteVector.join(',')}]`;

  const { data: matched, error: rpcError } = await supabase
    .rpc('match_titles_by_vector', {
      query_vector: vectorStr,
      match_limit: fetchLimit,
    });

  if (rpcError || !matched) {
    console.error('[Ranker] Hidden Gems RPC failed:', (rpcError as any)?.message);
    return [];
  }

  const matchedTitles = matched as MatchedTitle[];
  if (matchedTitles.length === 0) return [];

  // Hard filter (availability set pre-built by caller via buildFilterSets)
  const hardFiltered = matchedTitles.filter(t => {
    const contentKey = `${t.media_type}-${t.tmdb_id}`;
    if (availableTmdbIds.size > 0 && !availableTmdbIds.has(t.tmdb_id)) return false;
    if (dismissedIds.has(contentKey)) return false;
    if (thumbsDownIds.has(contentKey)) return false;
    if (watchlistIds.has(contentKey)) return false;
    if (mediaTypeFilter && t.media_type !== mediaTypeFilter) return false;
    return true;
  });

  const candidateIds = hardFiltered.map(t => t.tmdb_id);
  if (candidateIds.length === 0) return [];

  // Fetch metadata with popularity/rating columns for hidden gem filtering
  const { data: titleRows, error: metaError } = await supabase
    .from('titles' as any)
    .select(
      'tmdb_id, media_type, title, poster_path, backdrop_path, overview, ' +
      'release_date, release_year, genre_ids, vote_average, vote_count, ' +
      'popularity, original_language, runtime'
    )
    .in('tmdb_id', candidateIds);

  if (metaError || !titleRows) return [];

  const metaMap = new Map<string, TitleRow>();
  for (const row of (titleRows as any[])) {
    metaMap.set(`${row.media_type}-${row.tmdb_id}`, row as TitleRow);
  }

  // Apply Hidden Gems popularity/quality filters + diversity constraint
  const genreCounts: Record<number, number> = {};
  const gems: ContentItem[] = [];

  for (const match of hardFiltered) {
    const meta = metaMap.get(`${match.media_type}-${match.tmdb_id}`);
    if (!meta) continue;

    const pop = meta.popularity ?? 0;
    const votes = meta.vote_count ?? 0;
    const avg = meta.vote_average ?? 0;

    // Hidden gem filters
    if (pop < HIDDEN_GEMS_FILTERS.minPopularity) continue;
    if (pop > HIDDEN_GEMS_FILTERS.maxPopularity) continue;
    if (votes < HIDDEN_GEMS_FILTERS.minVoteCount) continue;
    if (avg < HIDDEN_GEMS_FILTERS.minVoteAverage) continue;

    // Genre diversity: max N per primary genre
    const primaryGenre = (meta.genre_ids || [])[0];
    if (primaryGenre && (genreCounts[primaryGenre] || 0) >= HIDDEN_GEMS_FILTERS.maxPerGenre) continue;
    if (primaryGenre) genreCounts[primaryGenre] = (genreCounts[primaryGenre] || 0) + 1;

    const matchPct = Math.round(Math.max(30, Math.min(99, 100 - match.distance * 50)));
    gems.push(titleRowToContentItem(meta, matchPct));

    if (gems.length >= limit) break;
  }

  return gems;
}
