// Client-side semantic retrieval — Phase Search V2 Cluster B (B3).
//
// Thin adapter over the shared `_shared/recommendations-v2/search/
// semanticRetrieval.ts` algorithm. The shared module does the work;
// this wrapper:
//   1. Calls the `embed-query` Edge function to embed the user's
//      query string.
//   2. Threads the query embedding + (optional) user taste vector
//      + a FilterState-derived post-filter into the shared ranker.
//   3. Adapts the ScoredSemanticCandidate output back to ContentItem
//      so the BrowsePage grid can render uniformly across Mode A
//      (text search) and Mode C (semantic).
//
// shared-tree-drift CI keeps this file's mirror at
// `supabase/functions/_shared/recommendations-v2/search/
// semanticRetrieval.ts` in lockstep.

import { supabase } from '@/lib/supabase';
import {
  semanticRetrieval as runSemanticRetrieval,
  WEIGHT_RELEVANCE,
  WEIGHT_TASTE,
  WEIGHT_RECENCY,
  type ScoredSemanticCandidate,
  type SemanticCandidateMeta,
} from '../../../../supabase/functions/_shared/recommendations-v2/search/semanticRetrieval.ts';
import {
  buildPosterUrl,
  buildBackdropUrl,
} from '@/lib/api/tmdb';
import { GENRE_NAMES } from '@/lib/constants/genres';
import { isoToLanguageName } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import type { FilterState } from '@/lib/search/filterState';

export { WEIGHT_RELEVANCE, WEIGHT_TASTE, WEIGHT_RECENCY };
export type { ScoredSemanticCandidate };

export interface SemanticSearchInput {
  query: string;
  filters: FilterState;
  /** User taste vector (1536D). When omitted the taste-fit component
   *  falls back to neutral. */
  userTasteVector?: number[] | null;
  candidateLimit?: number;
  resultLimit?: number;
}

export interface SemanticSearchResult {
  items: ContentItem[];
  candidates: ScoredSemanticCandidate[];
  /** True when the embed-query response served from its in-memory
   *  cache. Useful for the eval rig to spot suspicious hit rates. */
  cached: boolean;
}

/**
 * Run a Mode C semantic search end-to-end. Throws on embed-query
 * failure; callers (useSearch's mode dispatcher) handle the fallback
 * to Mode A.
 */
export async function semanticSearch(input: SemanticSearchInput): Promise<SemanticSearchResult> {
  const { query, filters, userTasteVector, candidateLimit, resultLimit } = input;

  // 1. Embed the query via the JWT-gated Edge function.
  const embedRes = await supabase.functions.invoke<{ embedding: number[]; cached: boolean }>(
    'embed-query',
    { body: { query } },
  );
  if (embedRes.error || !embedRes.data?.embedding) {
    throw new Error(embedRes.error?.message ?? 'embed-query failed');
  }
  const embedding = embedRes.data.embedding;
  const cached = !!embedRes.data.cached;

  // 2. Build a post-retrieval filter from FilterState. match_titles_
  //    by_vector doesn't accept filter args, so we narrow client-side
  //    on the metadata returned by the shared module.
  const postFilter = buildPostFilter(filters);

  // 3. Hand off to the shared ranker.
  const candidates = await runSemanticRetrieval(
    supabase,
    embedding,
    userTasteVector ?? null,
    postFilter,
    { candidateLimit, resultLimit },
  );

  // 4. Adapt to ContentItem.
  const items = candidates.map(candidateToContentItem);

  return { items, candidates, cached };
}

// ── Helpers ────────────────────────────────────────────────────────

function buildPostFilter(filters: FilterState): ((meta: SemanticCandidateMeta) => boolean) | null {
  // Build only when at least one axis would do work. Returning null
  // tells the ranker to skip the per-row filter check entirely.
  const hasGenre = filters.genres.length > 0;
  const hasLang = filters.languages.length > 0;
  const hasMinRating = filters.minRating > 0;
  const hasContentType = filters.contentType !== 'all';
  const hasRuntime = filters.runtime !== 'any';
  if (!hasGenre && !hasLang && !hasMinRating && !hasContentType && !hasRuntime) return null;

  // Convert genre names → TMDb genre IDs once, outside the loop.
  const genreIdSet = hasGenre
    ? new Set(
        filters.genres
          .map((name) => Object.entries(GENRE_NAMES).find(([, n]) => n === name)?.[0])
          .filter((id): id is string => id !== undefined)
          .map((id) => parseInt(id, 10)),
      )
    : null;

  const langSet = hasLang
    ? new Set(filters.languages.map((l) => l.toLowerCase()))
    : null;

  return (meta) => {
    if (hasContentType) {
      // ContentType maps: 'movie' → 'movie', 'tv' → 'tv', 'doc' is
      // genre-driven (Documentary genre id = 99) on the movie table.
      if (filters.contentType === 'movie') {
        if (meta.media_type !== 'movie') return false;
        if (meta.genre_ids.includes(99)) return false; // exclude docs from movies
      } else if (filters.contentType === 'tv') {
        if (meta.media_type !== 'tv') return false;
      } else if (filters.contentType === 'doc') {
        if (meta.media_type !== 'movie' || !meta.genre_ids.includes(99)) return false;
      }
    }
    if (genreIdSet) {
      if (!meta.genre_ids.some((id) => genreIdSet.has(id))) return false;
    }
    if (langSet) {
      const langName = meta.original_language
        ? isoToLanguageName(meta.original_language)?.toLowerCase()
        : undefined;
      if (!langName || !langSet.has(langName)) return false;
    }
    if (hasMinRating) {
      if ((meta.vote_average ?? 0) < filters.minRating) return false;
    }
    if (hasRuntime && meta.media_type === 'movie') {
      const rt = meta.runtime ?? 0;
      if (filters.runtime === 'under_60' && rt >= 60) return false;
      if (filters.runtime === '60_120' && (rt < 60 || rt > 120)) return false;
      if (filters.runtime === 'over_120' && rt <= 120) return false;
    }
    return true;
  };
}

function candidateToContentItem(c: ScoredSemanticCandidate): ContentItem {
  const m = c.meta;
  const isDoc = m.media_type === 'movie' && m.genre_ids.includes(99);
  return {
    id: `${m.media_type}-${m.tmdb_id}`,
    title: m.title || 'Untitled',
    image: buildPosterUrl(m.poster_path) || '',
    backdrop: buildBackdropUrl(m.backdrop_path, 'w780') || undefined,
    services: [] as ServiceId[],
    rating: m.vote_average ?? undefined,
    year: m.release_year ?? undefined,
    type: m.media_type === 'tv' ? 'tv' : isDoc ? 'doc' : 'movie',
    genre: m.genre_ids[0] != null ? GENRE_NAMES[m.genre_ids[0]] : undefined,
    language: m.original_language ? isoToLanguageName(m.original_language) : undefined,
    genreIds: m.genre_ids,
    originalLanguage: m.original_language ?? undefined,
    popularity: m.popularity ?? undefined,
    voteCount: m.vote_count ?? undefined,
    runtime: m.runtime ?? undefined,
  };
}
