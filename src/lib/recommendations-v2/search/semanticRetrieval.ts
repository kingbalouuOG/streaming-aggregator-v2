// Client-side semantic retrieval — Phase Search V2 Cluster B (B3).
//
// Thin adapter over the `./semanticCore.ts` algorithm (relocated
// from _shared/ in PLAT-3). The core module does the work;
// this wrapper:
//   1. Calls the `embed-query` Edge function to embed the user's
//      query string.
//   2. Threads the query embedding + (optional) user taste vector
//      + a FilterState-derived post-filter into the shared ranker.
//   3. Adapts the ScoredSemanticCandidate output back to ContentItem
//      so the BrowsePage grid can render uniformly across Mode A
//      (text search) and Mode C (semantic).
//
// There is no mirror to keep in lockstep any more: PLAT-3 / ADR-014
// dissolved `supabase/functions/_shared/recommendations-v2/` and left this
// tree as the single copy. (The comment claiming a shared-tree-drift check
// on a `_shared/` twin outlived the twin; corrected 2026-09-09.)

import { supabase } from '@/lib/supabase';
import {
  semanticRetrieval as runSemanticRetrieval,
  WEIGHT_RELEVANCE,
  WEIGHT_TASTE,
  WEIGHT_RECENCY,
  type ScoredSemanticCandidate,
  type SemanticCandidateMeta,
} from './semanticCore';
import {
  buildPosterUrl,
  buildBackdropUrl,
} from '@/lib/api/imageUrls';
import { GENRE_NAMES } from '@/lib/constants/genres';
import { DOCUMENTARY_GENRE_ID } from '@/lib/content/documentary';
import { isoToLanguageName } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/lib/types/content';
import type { ServiceId } from '@/lib/types/content';
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
  /**
   * Release-year floor, inclusive. Backs the `released` axis
   * (recommendation 2026-09-08-002 §2.2), which `FilterState` does not
   * carry — it is a native Browse axis, and adding it to FilterState would
   * mean a new URL key on the web for a filter the web has no control for.
   *
   * Pushed into `match_titles_by_vector` since migration 082, and kept as
   * a metadata post-filter behind it. As a post-filter ALONE it left a
   * mean of 7.4 survivors from a 150-candidate pool across the eval
   * fixture — *Newer* emptied the grid rather than narrowing it.
   */
  minReleaseYear?: number | null;
  /**
   * The `cost: 'free'` axis: keep only titles included with one of these
   * services (subscription or genuinely free — never rent, buy or addon).
   * Empty array means "any service", matching the RPC.
   *
   * This one DOES cost an extra round trip. Availability is not in the
   * vector metadata and `titles.available_services` aggregates every stream
   * type, so the free/paid distinction can only come from
   * `streaming_availability.stream_type` — see migration 080 and
   * parking-lot IN-SL-002. Null/undefined skips it entirely.
   */
  subscriptionIncludedOn?: readonly ServiceId[] | null;
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
  const {
    query,
    filters,
    userTasteVector,
    candidateLimit,
    resultLimit,
    minReleaseYear,
    subscriptionIncludedOn,
  } = input;

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
  const postFilter = buildPostFilter(filters, minReleaseYear ?? null);

  // 3. Hand off to the shared ranker. The cast sidesteps TS2589: the
  //    typed singleton's postgrest generics explode when structurally
  //    checked against the core's minimal SupabaseLike interface.
  //
  //    When an availability filter is coming, DON'T truncate here: the
  //    ranker's `resultLimit` would cut the list before we know which of
  //    those titles are actually free, so a user whose top 60 happen to be
  //    rentals would see an empty grid rather than the free titles ranked
  //    61st onward. Rank the whole pool, filter, then truncate.
  const needsAvailability = subscriptionIncludedOn != null;
  const candidates = await runSemanticRetrieval(
    supabase as unknown as Parameters<typeof runSemanticRetrieval>[0],
    embedding,
    userTasteVector ?? null,
    postFilter,
    {
      candidateLimit,
      resultLimit: needsAvailability ? (candidateLimit ?? 100) : resultLimit,
      // Pushed into the RPC (migration 082) so the candidate pool is
      // chosen knowing about the floor. `postFilter` still carries the
      // same rule and is now a no-op for it — deliberately: the push-down
      // falls back to the two-argument RPC on a database that predates
      // 082, and the post-filter is what enforces the floor when it does.
      minReleaseYear: minReleaseYear ?? null,
    },
  );

  const included = needsAvailability
    ? (await filterToSubscriptionIncluded(candidates, subscriptionIncludedOn)).slice(
        0,
        resultLimit ?? 40,
      )
    : candidates;

  // 4. Adapt to ContentItem.
  const items = included.map(candidateToContentItem);

  return { items, candidates: included, cached };
}

/**
 * Keep only candidates included with the given services (migration 080).
 *
 * Fails OPEN — on an RPC error the unfiltered list is returned rather than
 * an empty grid. A cost filter that silently does nothing is a worse result
 * than one that is briefly too generous, and the alternative is a blank
 * screen with no explanation.
 */
async function filterToSubscriptionIncluded(
  candidates: ScoredSemanticCandidate[],
  services: readonly ServiceId[],
): Promise<ScoredSemanticCandidate[]> {
  if (candidates.length === 0) return candidates;
  const { data, error } = await supabase.rpc('subscription_included_titles', {
    p_tmdb_ids: candidates.map((c) => c.meta.tmdb_id),
    // Omitted rather than null when the user has no stack: JSON.stringify
    // drops undefined, so the argument falls to the function's own DEFAULT
    // NULL, which the RPC reads as "any service".
    p_services: services.length > 0 ? [...services] : undefined,
  });
  if (error || !Array.isArray(data)) return candidates;

  // Key on (tmdb_id, media_type): titles.tmdb_id is not unique across media
  // types, so matching on the id alone would admit a film because its
  // same-id series is on Netflix.
  const allowed = new Set(
    (data as Array<{ tmdb_id: number; media_type: string }>).map(
      (row) => `${row.tmdb_id}:${row.media_type}`,
    ),
  );
  return candidates.filter((c) => allowed.has(`${c.meta.tmdb_id}:${c.meta.media_type}`));
}

// ── Helpers ────────────────────────────────────────────────────────

function buildPostFilter(
  filters: FilterState,
  minReleaseYear: number | null,
): ((meta: SemanticCandidateMeta) => boolean) | null {
  // Build only when at least one axis would do work. Returning null
  // tells the ranker to skip the per-row filter check entirely.
  const hasGenre = filters.genres.length > 0;
  const hasLang = filters.languages.length > 0;
  const hasMinRating = filters.minRating > 0;
  const hasContentType = filters.contentType !== 'all';
  const hasRuntime = filters.runtime !== 'any';
  const hasReleased = minReleaseYear !== null;
  if (!hasGenre && !hasLang && !hasMinRating && !hasContentType && !hasRuntime && !hasReleased)
    return null;

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
      // Documentary is a GENRE on either media type, and Movies / TV are
      // media type alone and INCLUDE documentaries — a documentary film is
      // still a film (recommendation 2026-09-08-002 §1.1, and
      // `src/lib/content/documentary.ts`, which is the definition of record).
      //
      // This branch used to say the opposite on both counts: it subtracted
      // genre-99 titles from Movies, and it restricted Docs to the movie
      // table, so a documentary SERIES could not be reached from either
      // segment. That was the §0.2 bug, in its last remaining copy.
      if (filters.contentType === 'movie') {
        if (meta.media_type !== 'movie') return false;
      } else if (filters.contentType === 'tv') {
        if (meta.media_type !== 'tv') return false;
      } else if (filters.contentType === 'doc') {
        if (!meta.genre_ids.includes(DOCUMENTARY_GENRE_ID)) return false;
      }
    }
    if (hasReleased) {
      // Unknown release year fails the filter. "Newer" promising a date is
      // a claim; a null year cannot support it.
      if ((meta.release_year ?? 0) < (minReleaseYear as number)) return false;
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
  const isDoc = m.genre_ids.includes(DOCUMENTARY_GENRE_ID);
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
