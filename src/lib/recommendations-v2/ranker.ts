/**
 * Recommendations V2 — Pipeline Orchestrator
 *
 * Full multi-stage ranking pipeline replacing the Phase 3 minimal ranker.
 *
 * Pipeline stages:
 *   Stage 1: Candidate retrieval via match_titles_by_vector RPC
 *   Stage 2: Weighted scoring (taste 62.5% + recency 25% + contextual 12.5%)
 *   Stage 2b: Genre-spread diversity (post-scoring)
 *   Stage 2c: Cross-service de-clustering (post-scoring)
 *
 * The pipeline is designed for a shared candidate pool: one RPC call fetches
 * 500 candidates that serve multiple For You rows. Per-anchor retrievals
 * (Because You Watched) use fetchAnchorNeighbours() with separate calls.
 */

import { supabase } from '../supabase';
import { titleRowToContentItem } from './titleAdapter';
import { computeHomeRecencyScore, computeForYouRecencyScore } from './recency';
import { computeContextualScore } from './contextual';
import { applyGenreSpread, deClusterByService, applyContentMixRatio } from './diversity';
import {
  getModulatedWeights,
  getContentMixMovieRatio,
  getVarietyGenreWindow,
  distanceToSimilarity,
  scoreToMatchPercentage,
  DEFAULT_CANDIDATE_LIMIT,
  DEFAULT_MAX_PER_GENRE,
} from './weights';
import type {
  MatchedTitle,
  ExtendedTitleRow,
  CandidatePool,
  ScoredCandidate,
  PipelineInput,
  ContentItem,
  RowConfig,
} from './types';
import { EXTENDED_TITLE_SELECT as TITLE_SELECT } from './types';
import type { FilterSets } from './hardFilters';
import type { SliderState } from '@/lib/taste-v2/types';

// ── Stage 1: Candidate Retrieval ──

/**
 * Fetch a shared candidate pool from the vector similarity RPC.
 * Returns matched titles + extended metadata for scoring.
 *
 * This is the primary entry point for For You rows — call once,
 * then score and partition for multiple rows.
 */
export async function fetchCandidatePool(
  input: PipelineInput,
): Promise<CandidatePool> {
  const { tasteVector, filterSets, candidateLimit = DEFAULT_CANDIDATE_LIMIT } = input;

  const vectorStr = `[${tasteVector.join(',')}]`;

  // Stage 1: cosine similarity retrieval via RPC
  const { data: matched, error: rpcError } = await supabase
    .rpc('match_titles_by_vector', {
      query_vector: vectorStr,
      match_limit: candidateLimit,
    });

  if (rpcError || !matched) {
    console.error('[Pipeline] match_titles_by_vector failed:', rpcError?.message);
    return { matched: [], metadata: new Map(), fetchedAt: Date.now() };
  }

  const matchedTitles = matched as MatchedTitle[];

  if (matchedTitles.length === 0) {
    return { matched: [], metadata: new Map(), fetchedAt: Date.now() };
  }

  // Hard filter (availability, dismissed, thumbs-down, watchlist)
  const filtered = applyHardFilters(matchedTitles, filterSets);

  console.log(
    '[Pipeline] RPC returned:', matchedTitles.length,
    '→ after hard filters:', filtered.length,
  );

  if (filtered.length === 0) {
    return { matched: filtered, metadata: new Map(), fetchedAt: Date.now() };
  }

  // Fetch extended metadata for top candidates only.
  // We only need ~50 for rows (20 rec + 15 gems + 15 outside) but fetch 100
  // to allow for filtering. The full 'filtered' list is kept in pool.matched
  // for cosine-score distribution calculations.
  const metadataIds = [...new Set(filtered.slice(0, 100).map(t => t.tmdb_id))];
  const metadata = await fetchExtendedMetadata(metadataIds);

  return { matched: filtered, metadata, fetchedAt: Date.now() };
}

/**
 * Fetch neighbours of an anchor title for "Because You Watched" rows.
 * Uses the anchor title's embedding (not the user's taste vector).
 */
export async function fetchAnchorNeighbours(
  anchorTmdbId: number,
  anchorMediaType: 'movie' | 'tv',
  filterSets: FilterSets,
  limit: number = 15,
): Promise<ContentItem[]> {
  // Fetch the anchor title's embedding
  const { data: anchorRows, error: anchorError } = await supabase
    .from('titles')
    .select('embedding')
    .eq('tmdb_id', anchorTmdbId)
    .eq('media_type', anchorMediaType)
    .limit(1);

  if (anchorError || !anchorRows?.length) {
    console.error('[Pipeline] Anchor embedding fetch failed:', anchorError?.message);
    return [];
  }

  // PostgREST returns pgvector columns as serialised strings.
  // Locked pattern from Phase 1 wire format spike: JSON.parse(row.embedding as string)
  const embeddingStr = (anchorRows[0] as { embedding: string | null }).embedding;
  if (!embeddingStr) return [];

  let embedding: number[];
  try {
    embedding = JSON.parse(embeddingStr);
  } catch {
    console.error('[Pipeline] Failed to parse anchor embedding');
    return [];
  }

  // Query for similar titles using the anchor's embedding
  const vectorStr = `[${embedding.join(',')}]`;
  const { data: matched, error: rpcError } = await supabase
    .rpc('match_titles_by_vector', {
      query_vector: vectorStr,
      match_limit: limit * 5, // overfetch for hard filtering
    });

  if (rpcError || !matched) {
    console.error('[Pipeline] Anchor RPC failed:', rpcError?.message);
    return [];
  }

  const matchedTitles = (matched as MatchedTitle[]).filter(
    t => !(t.tmdb_id === anchorTmdbId && t.media_type === anchorMediaType),
  );

  const filtered = applyHardFilters(matchedTitles, filterSets);
  const topIds = filtered.slice(0, limit).map(t => t.tmdb_id);
  if (topIds.length === 0) return [];

  const metadata = await fetchExtendedMetadata(topIds);

  return filtered.slice(0, limit).map(match => {
    const meta = metadata.get(`${match.media_type}-${match.tmdb_id}`);
    if (!meta) return null;
    const similarity = distanceToSimilarity(match.distance);
    return titleRowToContentItem(meta, scoreToMatchPercentage(similarity));
  }).filter((item): item is ContentItem => item !== null);
}

// ── Stage 2: Weighted Scoring ──

/**
 * Score all candidates in a pool using the weighted formula.
 * Returns scored candidates sorted by finalScore DESC.
 */
export function scoreCandidates(
  pool: CandidatePool,
  sliders: SliderState,
  surface: 'home' | 'foryou',
): ScoredCandidate[] {
  const weights = getModulatedWeights(sliders.catalogueAge);

  const scored: ScoredCandidate[] = [];

  for (const match of pool.matched) {
    const contentKey = `${match.media_type}-${match.tmdb_id}`;
    const meta = pool.metadata.get(contentKey);
    if (!meta) continue;

    // Taste similarity: convert cosine distance to 0–1 similarity
    const taste = distanceToSimilarity(match.distance);

    // Recency: surface-dependent scoring function
    const recency = surface === 'home'
      ? computeHomeRecencyScore(meta.release_date)
      : computeForYouRecencyScore(meta.release_date);

    // Contextual: Phase 4 placeholder (always 0.5)
    const contextual = computeContextualScore({ meta });

    // Weighted sum
    const finalScore =
      weights.taste * taste +
      weights.recency * recency +
      weights.contextual * contextual;

    scored.push({
      tmdbId: match.tmdb_id,
      mediaType: match.media_type as 'movie' | 'tv',
      contentKey,
      scores: { taste, recency, contextual },
      finalScore,
      meta,
    });
  }

  // Sort by final score descending
  scored.sort((a, b) => b.finalScore - a.finalScore);

  return scored;
}

// ── Stage 2b + 2c: Post-Processing ──

/**
 * Build a row from the scored candidate pool.
 * Applies content-mix ratio, genre spread, and service de-clustering.
 */
export function buildRowFromPool(
  scored: ScoredCandidate[],
  sliders: SliderState,
  config: RowConfig = {},
  getServices?: (tmdbId: number, mediaType: string) => string[],
): ContentItem[] {
  const { limit = 20, excludeIds } = config;

  let candidates = scored;

  // Cross-row dedup
  if (excludeIds && excludeIds.size > 0) {
    candidates = candidates.filter(c => !excludeIds.has(c.contentKey));
  }

  // Stage 2b: Content-mix ratio (applies to taste-vector rows only)
  const movieRatio = getContentMixMovieRatio(sliders.contentMix);
  candidates = applyContentMixRatio(candidates, movieRatio);

  // Stage 2b: Genre spread diversity
  const genreWindow = getVarietyGenreWindow(sliders.variety);
  candidates = applyGenreSpread(candidates, genreWindow, DEFAULT_MAX_PER_GENRE, limit);

  // Stage 2c: Service de-clustering
  if (getServices) {
    candidates = deClusterByService(candidates, getServices);
  }

  // Map to ContentItem for UI
  return candidates.slice(0, limit).map(c =>
    titleRowToContentItem(c.meta, scoreToMatchPercentage(c.finalScore)),
  );
}

// ── Internal Helpers ──

/** Apply hard filters (availability, dismissed, thumbs-down, watchlist) */
function applyHardFilters(
  titles: MatchedTitle[],
  filterSets: FilterSets,
): MatchedTitle[] {
  return titles.filter(t => {
    const contentKey = `${t.media_type}-${t.tmdb_id}`;

    // Service availability
    if (filterSets.availableTmdbIds.size > 0 && !filterSets.availableTmdbIds.has(t.tmdb_id)) {
      return false;
    }

    // Dismissed (not interested)
    if (filterSets.dismissedIds.has(contentKey)) return false;

    // Thumbs down
    if (filterSets.thumbsDownIds.has(contentKey)) return false;

    // Already on watchlist (for Recommended For You; other rows may override)
    if (filterSets.watchlistIds.has(contentKey)) return false;

    return true;
  });
}

/** Fetch extended metadata for a list of tmdb_ids */
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
    console.error('[Pipeline] Metadata fetch failed:', error?.message);
    return map;
  }

  for (const row of rows) {
    const typed = row as unknown as ExtendedTitleRow;
    map.set(`${typed.media_type}-${typed.tmdb_id}`, typed);
  }

  return map;
}

// ── Backward Compatibility (Phase 3 wrappers — delete in Task 6) ──

import type { RankerInput } from './types';
import { HIDDEN_GEMS_FILTERS } from './types';

/**
 * @deprecated Use fetchCandidatePool + scoreCandidates + buildRowFromPool.
 * Kept for transition period; will be deleted alongside useRecommendations.
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

  const fetchLimit = limit * 25;
  const vectorStr = `[${tasteVector.join(',')}]`;

  const { data: matched, error: rpcError } = await supabase
    .rpc('match_titles_by_vector', {
      query_vector: vectorStr,
      match_limit: fetchLimit,
    });

  if (rpcError || !matched) {
    console.error('[Ranker] match_titles_by_vector failed:', rpcError?.message);
    return [];
  }

  const matchedTitles = matched as MatchedTitle[];
  if (matchedTitles.length === 0) return [];

  const filtered = matchedTitles.filter(t => {
    const contentKey = `${t.media_type}-${t.tmdb_id}`;
    if (availableTmdbIds.size > 0 && !availableTmdbIds.has(t.tmdb_id)) return false;
    if (dismissedIds.has(contentKey)) return false;
    if (thumbsDownIds.has(contentKey)) return false;
    if (watchlistIds.has(contentKey)) return false;
    if (mediaTypeFilter && t.media_type !== mediaTypeFilter) return false;
    return true;
  });

  const topIds = filtered.slice(0, limit).map(t => t.tmdb_id);
  if (topIds.length === 0) return [];

  const { data: titleRows, error: metaError } = await supabase
    .from('titles')
    .select(TITLE_SELECT)
    .in('tmdb_id', topIds);

  if (metaError || !titleRows) {
    console.error('[Ranker] metadata fetch failed:', metaError?.message);
    return [];
  }

  const metaMap = new Map<string, ExtendedTitleRow>();
  for (const row of titleRows) {
    const typed = row as unknown as ExtendedTitleRow;
    metaMap.set(`${typed.media_type}-${typed.tmdb_id}`, typed);
  }

  const results: ContentItem[] = [];
  for (const match of filtered.slice(0, limit)) {
    const meta = metaMap.get(`${match.media_type}-${match.tmdb_id}`);
    if (!meta) continue;
    const matchPct = Math.round(Math.max(30, Math.min(99, 100 - match.distance * 50)));
    results.push(titleRowToContentItem(meta, matchPct));
  }

  return results;
}

/**
 * @deprecated Use fetchCandidatePool + Hidden Gems row builder.
 * Kept for transition period; will be deleted alongside useHiddenGems.
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

  const vectorStr = `[${tasteVector.join(',')}]`;

  const { data: matched, error: rpcError } = await supabase
    .rpc('match_titles_by_vector', {
      query_vector: vectorStr,
      match_limit: 500,
    });

  if (rpcError || !matched) {
    console.error('[Ranker] Hidden Gems RPC failed:', rpcError?.message);
    return [];
  }

  const matchedTitles = matched as MatchedTitle[];
  if (matchedTitles.length === 0) return [];

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

  const { data: titleRows, error: metaError } = await supabase
    .from('titles')
    .select(TITLE_SELECT)
    .in('tmdb_id', candidateIds);

  if (metaError || !titleRows) return [];

  const metaMap = new Map<string, ExtendedTitleRow>();
  for (const row of titleRows) {
    const typed = row as unknown as ExtendedTitleRow;
    metaMap.set(`${typed.media_type}-${typed.tmdb_id}`, typed);
  }

  const genreCounts: Record<number, number> = {};
  const gems: ContentItem[] = [];

  for (const match of hardFiltered) {
    const meta = metaMap.get(`${match.media_type}-${match.tmdb_id}`);
    if (!meta) continue;

    const pop = meta.popularity ?? 0;
    const votes = meta.vote_count ?? 0;
    const avg = meta.vote_average ?? 0;

    if (pop < HIDDEN_GEMS_FILTERS.minPopularity) continue;
    if (pop > HIDDEN_GEMS_FILTERS.maxPopularity) continue;
    if (votes < HIDDEN_GEMS_FILTERS.minVoteCount) continue;
    if (avg < HIDDEN_GEMS_FILTERS.minVoteAverage) continue;

    const primaryGenre = (meta.genre_ids || [])[0];
    if (primaryGenre && (genreCounts[primaryGenre] || 0) >= HIDDEN_GEMS_FILTERS.maxPerGenre) continue;
    if (primaryGenre) genreCounts[primaryGenre] = (genreCounts[primaryGenre] || 0) + 1;

    const matchPct = Math.round(Math.max(30, Math.min(99, 100 - match.distance * 50)));
    gems.push(titleRowToContentItem(meta, matchPct));

    if (gems.length >= limit) break;
  }

  return gems;
}
