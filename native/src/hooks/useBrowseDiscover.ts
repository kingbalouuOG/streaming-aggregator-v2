import { useQuery } from '@tanstack/react-query';

import {
  countActiveFilters,
  type BrowseFilters,
  type SortMode,
} from '@/components/browseFilters';
import {
  tmdbMovieToContentItem,
  tmdbTVToContentItem,
  type TMDbContentResult,
} from '@/lib/adapters/contentAdapter';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { GENRE_NAME_TO_ID, sanitiseTVGenreParams } from '@/lib/constants/genres';
import type { ContentItem, ServiceId } from '@/lib/types/content';

// Filter-only "browse by filters" — the native analogue of the web useBrowse.
// When the user applies filters (via "Build your search" or a mood preset)
// WITHOUT typing a query, hit TMDb /discover with the filter set instead of
// /search. Genre / rating / runtime / type / provider are all resolved
// server-side, so unlike the client-side applyBrowseFilters path this works
// even though the adapters leave ContentItem.services empty. One page of
// movies + TV, scoped to the picked services (or the user's stack when none
// are picked) so the grid stays on titles they can actually reach.

interface DiscoverResponse {
  success: boolean;
  data?: { results?: TMDbContentResult[] };
}

const SORT_PARAM: Record<SortMode, string> = {
  best: 'popularity.desc',
  popularity: 'popularity.desc',
  rating: 'vote_average.desc',
  a_z: 'title.asc',
  z_a: 'title.desc',
};

function buildParams(f: BrowseFilters, providers: ServiceId[], sort: SortMode): Record<string, unknown> {
  const params: Record<string, unknown> = {
    watch_region: 'GB',
    sort_by: SORT_PARAM[sort],
  };
  // Rating / alphabetical sorts need a vote floor or the head of the list
  // fills with obscure one-vote titles (the floor we use elsewhere).
  if (sort === 'rating' || sort === 'a_z' || sort === 'z_a') params['vote_count.gte'] = 50;

  // Provider scope: the picked services, else the user's stack. Keeps the
  // catalogue to titles the user can reach instead of the whole GB library.
  const provIds = serviceIdsToProviderIds(f.services.length ? f.services : providers);
  if (provIds.length) params.with_watch_providers = provIds.join('|');

  if (f.genres.length) {
    const ids = f.genres.map((n) => GENRE_NAME_TO_ID[n]).filter(Boolean);
    if (ids.length) params.with_genres = ids.join(',');
  }
  if (f.minRating > 0) {
    params['vote_average.gte'] = f.minRating;
    params['vote_count.gte'] = 50;
  }
  if (f.runtime === 'under_60') params['with_runtime.lte'] = 59;
  else if (f.runtime === '60_120') {
    params['with_runtime.gte'] = 60;
    params['with_runtime.lte'] = 120;
  } else if (f.runtime === 'over_120') params['with_runtime.gte'] = 121;

  return params;
}

async function fetchDiscover(
  f: BrowseFilters,
  providers: ServiceId[],
  sort: SortMode,
): Promise<ContentItem[]> {
  const params = buildParams(f, providers, sort);
  const wantMovies = f.contentType === 'all' || f.contentType === 'movie' || f.contentType === 'doc';
  const wantTV = f.contentType === 'all' || f.contentType === 'tv';

  const calls: Promise<DiscoverResponse>[] = [];
  if (wantMovies) {
    // "Docs" is a documentary-genre movie browse — constrain to genre 99.
    const movieParams =
      f.contentType === 'doc'
        ? { ...params, with_genres: String(GENRE_NAME_TO_ID['Documentary']) }
        : params;
    calls.push(discoverMovies(movieParams) as Promise<DiscoverResponse>);
  }
  if (wantTV) calls.push(discoverTV(sanitiseTVGenreParams(params)) as Promise<DiscoverResponse>);

  const res = await Promise.all(calls);
  const items: ContentItem[] = [];
  let i = 0;
  if (wantMovies) {
    items.push(...(res[i].data?.results ?? []).map((m) => tmdbMovieToContentItem(m)));
    i++;
  }
  if (wantTV) {
    items.push(...(res[i].data?.results ?? []).map((t) => tmdbTVToContentItem(t)));
  }
  return items;
}

export function useBrowseDiscover(
  filters: BrowseFilters,
  sort: SortMode,
  enabled: boolean,
  userServices: ServiceId[],
) {
  return useQuery({
    queryKey: [
      'native',
      'browseDiscover',
      filters.contentType,
      [...filters.genres].sort().join(','),
      filters.services.join(','),
      filters.minRating,
      filters.runtime,
      sort,
      userServices.join(','),
    ],
    queryFn: () => fetchDiscover(filters, userServices, sort),
    enabled: enabled && countActiveFilters(filters) > 0,
    staleTime: 10 * 60 * 1000,
  });
}
