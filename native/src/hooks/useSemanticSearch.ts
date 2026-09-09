import { useQuery } from '@tanstack/react-query';

import { minYearForWindow, type BrowseFilters } from '@/components/browseFilters';
import { getFlag } from '@/lib/featureFlags';
import { semanticSearch } from '@/lib/recommendations-v2/search/semanticRetrieval';
import { defaultFor, type FilterState } from '@/lib/search/filterState';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import type { ContentItem, ServiceId } from '@/lib/types/content';

// Semantic ("vector") search on native — the Option-2 port. Reuses the
// shared engine end-to-end: getFlag (per-user gate), semanticSearch (embed
// via the JWT-gated embed-query Edge fn → match_titles_by_vector → rank →
// ContentItem). Gated behind the `search_semantic` flag; when OFF, the Browse
// screen falls back to the deterministic preset filters.
//
// Since the presets session the query is no longer only a preset phrase:
// free text that does not read as a title is routed here too (recommendation
// 2026-09-08-002 §9.2), and the live `BrowseFilters` are applied SERVER-SIDE
// rather than thinning the returned grid. That is what makes a preset and a
// refinement compose — "Comfort" + "Free to watch" is one query with two
// constraints, not a semantic search post-filtered down to nothing.

export function useSemanticFlag() {
  return useQuery({
    queryKey: ['native', 'flag', 'search_semantic'],
    queryFn: () => getFlag('search_semantic', false),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * `BrowseFilters` → the axes the semantic post-filter understands.
 *
 * `services` is deliberately NOT mapped onto `FilterState.services`: the
 * vector metadata carries no availability, so that field would do nothing.
 * Service scope reaches the semantic path only through the cost axis, which
 * has a real availability lookup behind it (migration 080).
 */
function toFilterState(f: BrowseFilters): FilterState {
  return {
    ...defaultFor([]),
    contentType: f.contentType,
    genres: f.genres,
    minRating: f.minRating,
    runtime: f.runtime,
  };
}

async function runSemantic(
  query: string,
  filters: BrowseFilters,
  userServices: ServiceId[],
): Promise<ContentItem[]> {
  // Taste vector drives the 25% taste-fit component; null is a neutral 0.5.
  const profile = await getV2TasteProfile().catch(() => null);
  const res = await semanticSearch({
    query,
    filters: toFilterState(filters),
    minReleaseYear: minYearForWindow(filters.released),
    // The user's own stack is the scope for "free": a title included with a
    // service they don't subscribe to is not free to them. Picked services
    // win over the stack, mirroring /discover.
    subscriptionIncludedOn:
      filters.cost === 'free' ? (filters.services.length ? filters.services : userServices) : null,
    userTasteVector: profile?.tasteVector ?? null,
    candidateLimit: 150,
    resultLimit: 60,
  });
  // Quality floor — drop unrated/obscure entries and sub-40-min movie shorts
  // (TV episodes are legitimately short). Mirrors scripts/search/eval-moods.ts.
  // This is also the vote floor the "New & actually good" preset relies on:
  // a 9.0 with twelve votes never reaches the grid.
  return res.items.filter(
    (it) =>
      (it.rating ?? 0) > 0 &&
      (it.voteCount ?? 0) >= 20 &&
      (it.type === 'tv' || !it.runtime || it.runtime >= 40),
  );
}

export function useSemanticSearch(
  query: string | null,
  enabled: boolean,
  filters: BrowseFilters,
  userServices: ServiceId[],
) {
  const q = (query ?? '').trim();
  return useQuery({
    queryKey: [
      'native',
      'semanticSearch',
      q,
      // Every axis the request actually varies on. Omitting one would serve a
      // cached unfiltered result the moment a chip changed.
      filters.contentType,
      [...filters.genres].sort().join(','),
      filters.minRating,
      filters.runtime,
      filters.released,
      filters.cost,
      filters.cost === 'free' ? [...filters.services].sort().join(',') : '',
      filters.cost === 'free' ? [...userServices].sort().join(',') : '',
    ],
    queryFn: () => runSemantic(q, filters, userServices),
    enabled: enabled && q.length > 0,
    staleTime: 10 * 60 * 1000,
    // Semantic depends on the embed-query Edge fn; a transient failure
    // shouldn't hammer it. One retry is enough.
    retry: 1,
  });
}
