// Mirror of src/lib/recommendations-v2/ranker.ts — IN-466 / ADR-011.
//
// Edge-side adjustments vs the client copy:
// - Takes SupabaseClient as a parameter (no `import { supabase } from ...`).
// - Otherwise bit-for-bit identical so drift can be enforced by the CI check.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { titleRowToContentItem } from './titleAdapter.ts';
import { computeHomeRecencyScore, computeForYouRecencyScore } from './recency.ts';
import { computeContextualScore } from './contextual.ts';
import { applyGenreSpread, deClusterByService, applyContentMixRatio } from './diversity.ts';
import {
  getModulatedWeights,
  getContentMixMovieRatio,
  getVarietyGenreWindow,
  distanceToSimilarity,
  scoreToMatchPercentage,
  DEFAULT_CANDIDATE_LIMIT,
  DEFAULT_MAX_PER_GENRE,
} from './weights.ts';
import type {
  MatchedTitle,
  ExtendedTitleRow,
  CandidatePool,
  ScoredCandidate,
  PipelineInput,
  ContentItem,
  RowConfig,
} from './types.ts';
import { EXTENDED_TITLE_SELECT as TITLE_SELECT } from './types.ts';
import type { FilterSets } from './hardFilters.ts';
import type { SliderState } from '../taste-v2/types.ts';

export async function fetchCandidatePool(
  client: SupabaseClient,
  input: PipelineInput,
): Promise<CandidatePool> {
  const { tasteVector, filterSets, candidateLimit = DEFAULT_CANDIDATE_LIMIT } = input;

  const vectorStr = `[${tasteVector.join(',')}]`;

  const { data: matched, error: rpcError } = await client.rpc('match_titles_by_vector', {
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

  const filtered = applyHardFilters(matchedTitles, filterSets);

  console.log(
    '[Pipeline] RPC returned:', matchedTitles.length,
    '→ after hard filters:', filtered.length,
  );

  if (filtered.length === 0) {
    return { matched: filtered, metadata: new Map(), fetchedAt: Date.now() };
  }

  const metadataIds = [...new Set(filtered.slice(0, 100).map((t) => t.tmdb_id))];
  const metadata = await fetchExtendedMetadata(client, metadataIds);

  return { matched: filtered, metadata, fetchedAt: Date.now() };
}

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

    const taste = distanceToSimilarity(match.distance);
    const recency = surface === 'home'
      ? computeHomeRecencyScore(meta.release_date)
      : computeForYouRecencyScore(meta.release_date);
    const contextual = computeContextualScore({ meta });

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

  scored.sort((a, b) => b.finalScore - a.finalScore);

  return scored;
}

export function buildRowFromPool(
  scored: ScoredCandidate[],
  sliders: SliderState,
  config: RowConfig = {},
  getServices?: (tmdbId: number, mediaType: string) => string[],
): ContentItem[] {
  const { limit = 20, excludeIds, maxPerGenre = DEFAULT_MAX_PER_GENRE } = config;

  let candidates = scored;

  if (excludeIds && excludeIds.size > 0) {
    candidates = candidates.filter((c) => !excludeIds.has(c.contentKey));
  }

  const movieRatio = getContentMixMovieRatio(sliders.contentMix);
  candidates = applyContentMixRatio(candidates, movieRatio);

  const genreWindow = getVarietyGenreWindow(sliders.variety);
  candidates = applyGenreSpread(candidates, genreWindow, maxPerGenre, limit);

  if (getServices) {
    candidates = deClusterByService(candidates, getServices);
  }

  return candidates.slice(0, limit).map((c) =>
    titleRowToContentItem(c.meta, scoreToMatchPercentage(c.finalScore)),
  );
}

function applyHardFilters(
  titles: MatchedTitle[],
  filterSets: FilterSets,
): MatchedTitle[] {
  return titles.filter((t) => {
    const contentKey = `${t.media_type}-${t.tmdb_id}`;
    if (filterSets.availableTmdbIds.size > 0 && !filterSets.availableTmdbIds.has(t.tmdb_id)) {
      return false;
    }
    if (filterSets.dismissedIds.has(contentKey)) return false;
    if (filterSets.thumbsDownIds.has(contentKey)) return false;
    if (filterSets.watchlistIds.has(contentKey)) return false;
    return true;
  });
}

async function fetchExtendedMetadata(
  client: SupabaseClient,
  tmdbIds: number[],
): Promise<Map<string, ExtendedTitleRow>> {
  const map = new Map<string, ExtendedTitleRow>();
  if (tmdbIds.length === 0) return map;

  const { data: rows, error } = await client
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
