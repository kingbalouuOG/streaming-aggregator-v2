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
 * (Because You Watched, anchored mood rooms) use buildAnchoredRoom() from
 * ./anchoredRoom.
 */

import { supabase } from '../supabase';
import { titleRowToContentItem } from './titleAdapter';
import { computeHomeRecencyScore, computeForYouRecencyScore } from './recency';
import { computeContextualScore } from './contextual';
import { applyGenreSpread, applyMMR, deClusterByService, applyContentMixRatio } from './diversity';
import {
  getModulatedWeights,
  getContentMixMovieRatio,
  getVarietyGenreWindow,
  getMMRLambda,
  distanceToSimilarity,
  scoreToMatchPercentage,
  DEFAULT_CANDIDATE_LIMIT,
  DEFAULT_MAX_PER_GENRE,
} from './weights';
import type {
  MatchedTitle,
  ExtendedTitleRow,
  CandidatePool,
  PipelineContext,
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

// ── Stage 2: Weighted Scoring ──

/**
 * Score all candidates in a pool using the weighted formula.
 * Returns scored candidates sorted by finalScore DESC.
 *
 * @param ctx Optional runtime context for the contextual scorer (Phase 5).
 *   When omitted, the contextual sub-components fall back to neutral 0.5,
 *   reproducing Phase 4 behaviour.
 */
export function scoreCandidates(
  pool: CandidatePool,
  sliders: SliderState,
  surface: 'home' | 'foryou',
  ctx: PipelineContext = {},
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

    // Contextual: Phase 5 — device, time-of-day, viewing context
    const contextual = computeContextualScore({ meta }, ctx);

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
 * Applies content-mix ratio, intra-row diversity, and service de-clustering.
 *
 * Phase 5: when an `embeddingMap` is provided, intra-row diversity uses
 * MMR (applyMMR with lambda derived from the variety slider). When the
 * map is absent, falls back to the Phase 4 applyGenreSpread heuristic
 * — preserves backward compatibility for callers not yet upgraded.
 * applyGenreSpread is removed at Phase 5 close-out (commit 12.5).
 */
export interface BuildRowFromPoolOptions {
  config?: RowConfig;
  getServices?: (tmdbId: number, mediaType: string) => string[];
  embeddingMap?: Map<string, number[]>;
}

export function buildRowFromPool(
  scored: ScoredCandidate[],
  sliders: SliderState,
  opts: BuildRowFromPoolOptions = {},
): ContentItem[] {
  const { config = {}, getServices, embeddingMap } = opts;
  const { limit = 20, excludeIds, maxPerGenre = DEFAULT_MAX_PER_GENRE } = config;

  let candidates = scored;

  // Cross-row dedup
  if (excludeIds && excludeIds.size > 0) {
    candidates = candidates.filter(c => !excludeIds.has(c.contentKey));
  }

  // Stage 2b: Content-mix ratio (applies to taste-vector rows only)
  const movieRatio = getContentMixMovieRatio(sliders.contentMix);
  candidates = applyContentMixRatio(candidates, movieRatio);

  // Stage 2b: intra-row diversity. MMR when embeddings are available,
  // applyGenreSpread fallback otherwise (Phase 4 behaviour). MMR also
  // bails out to applyGenreSpread when partial-coverage erodes its
  // diversity signal (IN-PX-23).
  if (embeddingMap && embeddingMap.size > 0) {
    const lambda = getMMRLambda(sliders.variety);
    const mmr = applyMMR(candidates, embeddingMap, { lambda, k: limit });
    if (mmr.bailedOut) {
      const genreWindow = getVarietyGenreWindow(sliders.variety);
      candidates = applyGenreSpread(candidates, genreWindow, maxPerGenre, limit);
    } else {
      candidates = mmr.selected;
    }
  } else {
    const genreWindow = getVarietyGenreWindow(sliders.variety);
    candidates = applyGenreSpread(candidates, genreWindow, maxPerGenre, limit);
  }

  // Stage 2c: Service de-clustering — runs AFTER intra-row diversity
  // for both MMR and fallback paths (brief §4.5 ordering).
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

