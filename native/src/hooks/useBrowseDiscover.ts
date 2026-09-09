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

  // Recency. Exact here — a date, not a year — unlike the client-side
  // post-filter, which only has `ContentItem.year` to work with. The TV call
  // renames the key (see `toTVParams`); TMDb's movie and TV endpoints spell
  // the same constraint differently.
  if (f.released === 'last_12_months') {
    params[MOVIE_RELEASED_KEY] = isoDaysAgo(365);
  }

  // Cost. "Free" means no marginal cost at point of play — included in a
  // subscription the user already has, genuinely free, or ad-funded — which
  // is Joe's 2026-09-08 definition, and exactly the mapping the web has used
  // since Phase Search V2 (`src/hooks/useBrowse.ts`). Native has no paid-only
  // value, so there is no case here where the provider constraint has to be
  // dropped: a free filter is always narrower than the user's own stack.
  if (f.cost === 'free') {
    params.with_watch_monetization_types = 'flatrate|free|ads';
  }

  return params;
}

/** TMDb spells the release-date floor differently per endpoint. */
const MOVIE_RELEASED_KEY = 'primary_release_date.gte';
const TV_RELEASED_KEY = 'first_air_date.gte';

/** `YYYY-MM-DD`, n days before today. */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Adapt a movie params object for the TV endpoint: genre ids converted and
 * pruned, and the release-date floor renamed. Leaving the movie spelling on
 * a TV call is silently ignored by TMDb, which would return *unfiltered* TV
 * alongside correctly-filtered films — the same class of bug as the
 * documentary segment asking only for movies.
 */
function toTVParams(params: Record<string, unknown>): Record<string, unknown> {
  const tv = sanitiseTVGenreParams(params);
  if (tv[MOVIE_RELEASED_KEY] !== undefined) {
    tv[TV_RELEASED_KEY] = tv[MOVIE_RELEASED_KEY];
    delete tv[MOVIE_RELEASED_KEY];
  }
  return tv;
}

async function fetchDiscover(
  f: BrowseFilters,
  providers: ServiceId[],
  sort: SortMode,
): Promise<ContentItem[]> {
  const params = buildParams(f, providers, sort);
  // Documentaries is a GENRE, not a media type (§1.1), so it asks for both
  // halves. Asking only for movies is what hid every documentary series
  // behind the "Docs" segment — the larger half of the UK catalogue.
  const wantMovies = f.contentType === 'all' || f.contentType === 'movie' || f.contentType === 'doc';
  const wantTV = f.contentType === 'all' || f.contentType === 'tv' || f.contentType === 'doc';

  // Constrain BOTH discover calls to genre 99 for 'doc'. The id is the same
  // on TMDb's movie and TV genre lists, so one constant serves both.
  const docParams =
    f.contentType === 'doc'
      ? { ...params, with_genres: String(GENRE_NAME_TO_ID['Documentary']) }
      : params;

  const calls: Promise<DiscoverResponse>[] = [];
  if (wantMovies) calls.push(discoverMovies(docParams) as Promise<DiscoverResponse>);
  if (wantTV) calls.push(discoverTV(toTVParams(docParams)) as Promise<DiscoverResponse>);

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
      filters.released,
      filters.cost,
      sort,
      userServices.join(','),
    ],
    queryFn: () => fetchDiscover(filters, userServices, sort),
    enabled: enabled && countActiveFilters(filters) > 0,
    staleTime: 10 * 60 * 1000,
  });
}
