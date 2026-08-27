import { keepPreviousData, useIsRestoring, useQuery } from '@tanstack/react-query';

import { useUserServices } from '@/hooks/useUserServices';
import { env } from '@/lib/env';
import { readAccessToken } from '@/lib/recommendations-v2/edgeRender';
import {
  tmdbMovieToContentItem,
  tmdbTVToContentItem,
  type TMDbContentResult,
} from '@/lib/adapters/contentAdapter';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { discoverMovies, discoverTV, getTrendingMovies, getTrendingTV } from '@/lib/api/tmdb';
import { filterToAvailable } from '@/lib/recommendations-v2/hardFilters';
import { dailyPick, dailyShuffleTopN } from '@/lib/utils/dailyShuffle';
import { fetchGenreSpotlight } from '@/lib/recommendations-v2/rows/home/genreSpotlight';
import { fetchPaidTitles } from '@/lib/recommendations-v2/rows/home/paidRow';
import { fetchPerServiceCharts } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import type { PerServiceChartRow } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import type { ContentItem, ServiceId } from '@/lib/types/content';

// Native Home feed hook. Calls the SAME lib row-builders the web Home
// uses. NATIVE-1: per-service charts. NATIVE-3 W7: scored against the
// user's onboarding-saved services. NATIVE-3.5: adds Recently Added +
// personalised genre spotlights (the curated "For You on Home" rows).

const SPOTLIGHT_COUNT = 3;
// Items rendered per spotlight row.
const SPOTLIGHT_SIZE = 15;
// Fetched per spotlight. The surplus absorbs titles lost to an earlier
// spotlight during the post-parallel dedup below, so a row still fills.
// fetchGenreSpotlight already over-fetches limit*8 from the DB, so this
// costs a slightly larger response, not an extra round trip.
const SPOTLIGHT_FETCH_SIZE = 20;
// UK free-to-air services — "Free Tonight" is no-subscription content, so it's
// scoped to these regardless of the user's selected stack.
const FREE_UK_SERVICES: ServiceId[] = ['bbc', 'itvx', 'channel4'];

export interface GenreSpotlight {
  clusterName: string;
  items: ContentItem[];
}

export interface UpcomingItem {
  item: ContentItem;
  /** ISO release date (YYYY-MM-DD). */
  date: string;
}

export interface HomeFeed {
  hero: ContentItem | null;
  recentlyAdded: ContentItem[];
  popular: ContentItem[];
  freeTonight: ContentItem[];
  /** "New to rent or buy" — newest rent/buy titles on the user's services. */
  paid: ContentItem[];
  upcoming: UpcomingItem[];
  rows: PerServiceChartRow[];
  spotlights: GenreSpotlight[];
}

// Interleave two provider-scoped result lists 1:1, dropping imageless +
// duplicate items. Shared by the discover-backed Home rows.
function interleaveDedupe(movies: ContentItem[], tv: ContentItem[], limit?: number): ContentItem[] {
  const out: ContentItem[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(movies.length, tv.length);
  for (let i = 0; i < maxLen; i++) {
    for (const item of [movies[i], tv[i]]) {
      if (item && item.image && !seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return limit ? out.slice(0, limit) : out;
}

/** Recently Added — TMDb discover by release date, providers-filtered.
 *  Mirrors the web "Just In" row (useSectionData discover params). */
async function fetchRecentlyAdded(services: ServiceId[]): Promise<ContentItem[]> {
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');
  const today = new Date().toISOString().split('T')[0];

  const [movieRes, tvRes] = await Promise.all([
    discoverMovies({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'primary_release_date.desc',
      'primary_release_date.lte': today,
      'vote_count.gte': 50,
    }),
    discoverTV({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'first_air_date.desc',
      'first_air_date.lte': today,
      'vote_count.gte': 30,
    }),
  ]);

  const movies = ((movieRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbMovieToContentItem);
  const tv = ((tvRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbTVToContentItem);
  return interleaveDedupe(movies, tv, 18);
}

// Below this many service-available trending titles we treat the
// intersection as too thin (sparse content cache) and backfill from the
// provider-scoped popularity query so the ribbon never collapses.
const MIN_TRENDING_ITEMS = 8;

/** Provider-scoped popularity pool — the pre-freshness behaviour, now the
 *  fallback/backfill source for the trending ribbon. */
async function fetchPopularByProvider(services: ServiceId[]): Promise<ContentItem[]> {
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');

  const [movieRes, tvRes] = await Promise.all([
    discoverMovies({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 100,
    }),
    discoverTV({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
    }),
  ]);

  const movies = ((movieRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbMovieToContentItem);
  const tv = ((tvRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbTVToContentItem);
  return interleaveDedupe(movies, tv);
}

/** Popular pool — real TMDb trending (rolling weekly window that TMDb
 *  refreshes daily), filtered to titles on the user's services via the
 *  availability set. Trending has no provider filter of its own, so we
 *  intersect here and backfill from the provider-scoped popularity query
 *  when the intersection is thin. Feeds the Trending ribbon + editorial
 *  spotlight (the web reuses `home.popular`). */
async function fetchPopular(
  services: ServiceId[],
): Promise<ContentItem[]> {
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length === 0) return [];

  const [movieRes, tvRes] = await Promise.all([
    getTrendingMovies('week'),
    getTrendingTV('week'),
  ]);

  // B3: trending comes from TMDb, so availability cannot be a predicate on
  // our own query — but it can be a question about the ~40 ids we actually
  // hold, rather than downloading all 43,234 to rebuild a Set.
  // filterToAvailable returns everything when `services` is empty, which
  // preserves the old "no services = no availability filter" convention.
  const trendingIds = [
    ...((movieRes.data?.results ?? []) as TMDbContentResult[]),
    ...((tvRes.data?.results ?? []) as TMDbContentResult[]),
  ].map((r) => r.id);
  const availableTmdbIds = await filterToAvailable(trendingIds, services);
  const onServices = (r: TMDbContentResult) => availableTmdbIds.has(r.id);

  const movies = ((movieRes.data?.results ?? []) as TMDbContentResult[])
    .filter(onServices)
    .map(tmdbMovieToContentItem);
  const tv = ((tvRes.data?.results ?? []) as TMDbContentResult[])
    .filter(onServices)
    .map(tmdbTVToContentItem);
  const trending = interleaveDedupe(movies, tv);

  if (trending.length >= MIN_TRENDING_ITEMS) return trending;

  // Backfill: trending first (preserving momentum order), then the
  // provider-scoped popular tail for anything not already present.
  const fallback = await fetchPopularByProvider(services);
  const seen = new Set(trending.map((i) => i.id));
  return [...trending, ...fallback.filter((i) => !seen.has(i.id))];
}

/** Free Tonight — popular titles on the UK free-to-air services (iPlayer /
 *  ITVX / Channel 4). Scoped server-side to those providers so the section
 *  actually populates; the old client filter on item.services (empty from the
 *  TMDb adapters) always produced nothing. */
async function fetchFreeTonight(): Promise<ContentItem[]> {
  const providerIds = serviceIdsToProviderIds(FREE_UK_SERVICES);
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');

  const [movieRes, tvRes] = await Promise.all([
    discoverMovies({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
    }),
    discoverTV({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 30,
    }),
  ]);

  const movies = ((movieRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbMovieToContentItem);
  const tv = ((tvRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbTVToContentItem);
  return interleaveDedupe(movies, tv, 12);
}

/** Upcoming releases — TMDb discover within the next 30 days, providers-
 *  filtered, ascending by date (web useUpcoming equivalent). */
async function fetchUpcoming(services: ServiceId[]): Promise<UpcomingItem[]> {
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [movieRes, tvRes] = await Promise.all([
    discoverMovies({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'primary_release_date.asc',
      'primary_release_date.gte': todayStr,
      'primary_release_date.lte': horizon,
    }),
    discoverTV({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'first_air_date.asc',
      'first_air_date.gte': todayStr,
      'first_air_date.lte': horizon,
    }),
  ]);

  const out: UpcomingItem[] = [];
  const seen = new Set<string>();
  const add = (item: ContentItem, date: string | undefined) => {
    if (item.image && date && !seen.has(item.id)) {
      seen.add(item.id);
      out.push({ item, date });
    }
  };
  for (const r of (movieRes.data?.results ?? []) as (TMDbContentResult & { release_date?: string })[]) {
    add(tmdbMovieToContentItem(r), r.release_date);
  }
  for (const r of (tvRes.data?.results ?? []) as (TMDbContentResult & { first_air_date?: string })[]) {
    add(tmdbTVToContentItem(r), r.first_air_date);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.slice(0, 12);
}

/**
 * B5: ask the Worker for a finished Home payload.
 *
 * Returns null — never throws — on anything that is not a usable payload,
 * so the caller falls through to the client render below. Home keeps that
 * fallback deliberately, unlike For You: it is the surface a user lands on
 * when For You fails, so it should not fail with it.
 */
const HOME_WORKER_TIMEOUT_MS = 12_000;

async function tryFetchHomeFromWorker(services: ServiceId[]): Promise<HomeFeed | null> {
  const proxyUrl = env.API_PROXY_URL;
  if (!proxyUrl || services.length === 0) return null;

  const accessToken = await readAccessToken();
  if (!accessToken) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOME_WORKER_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ services: services.join(',') });
    const res = await fetch(`${proxyUrl}/v1/home?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Partial<HomeFeed> | null;
    // Shape guard: a payload missing its arrays would render an empty
    // shelf that looks like a real (and cacheable) result. Treat a
    // wire-format drift as a miss and let the client render instead.
    if (!data || !Array.isArray(data.rows) || !Array.isArray(data.recentlyAdded)) {
      console.warn('[useHomeFeed] worker payload shape drift — falling back');
      return null;
    }
    return {
      hero: data.hero ?? null,
      recentlyAdded: data.recentlyAdded ?? [],
      popular: data.popular ?? [],
      freeTonight: data.freeTonight ?? [],
      paid: data.paid ?? [],
      upcoming: data.upcoming ?? [],
      rows: data.rows ?? [],
      spotlights: data.spotlights ?? [],
    };
  } catch {
    // Timeout, offline, DNS — all just "no worker payload".
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchHomeFeed(services: ServiceId[]): Promise<HomeFeed> {
  // B5: one round trip when the Worker answers; the ~15-call client
  // orchestration below is now the fallback rather than the default.
  const fromWorker = await tryFetchHomeFromWorker(services);
  if (fromWorker) return fromWorker;

  // B3: Home no longer fetches the availability id list at all.
  //
  // It used to pull get_available_tmdb_ids — 43,234 ids, ~321 KB — on every
  // load, twice over (once directly, once inside buildFilterSets), purely
  // to membership-test the ~100 titles it renders. B4 had reduced that to
  // one deduplicated request and unblocked the parallel batch; B3 removes
  // the request outright. Availability is now a SQL predicate on
  // titles.available_services (migration 075), and the one caller holding
  // ids from an external source (fetchPopular, TMDb trending) asks about
  // just those ids.
  //
  // buildFilterSets is gone from this path too: Home only ever used its
  // availableTmdbIds field, so with that need removed the whole call — and
  // its dismissed/thumbs-down/watchlist reads, which Home never used — is
  // dead weight.
  const [charts, profile, recentlyAdded, popularRaw, freeTonight, paidRaw, upcoming] = await Promise.all([
    fetchPerServiceCharts(services),
    getV2TasteProfile(),
    fetchRecentlyAdded(services),
    fetchPopular(services),
    fetchFreeTonight(),
    fetchPaidTitles(services),
    fetchUpcoming(services),
  ]);

  // Daily rotation (#2): reshuffle the top of the trending pool by UTC day
  // so the ribbon + editorial spotlight visibly move day-to-day even when
  // the underlying trending set is stable. Head-only shuffle keeps quality.
  const popular = dailyShuffleTopN(popularRaw, 20, 'home:popular');

  // Hero = "Today's Pick", pulled OUT of the first per-service row so the
  // same title doesn't lead the hero and row one. Rotates daily among the
  // row's top 5 contenders (#2) while leaving the ranked row intact.
  let hero: ContentItem | null = null;
  const rows = charts.map((row) => ({ ...row, items: [...row.items] }));
  const firstWithItems = rows.find((row) => row.items.length > 0);
  if (firstWithItems) {
    const lead =
      dailyPick(firstWithItems.items, 5, `home:hero:${firstWithItems.serviceId}`) ??
      firstWithItems.items[0] ??
      null;
    if (lead) {
      const leadIdx = firstWithItems.items.findIndex((i) => i.id === lead.id);
      if (leadIdx >= 0) firstWithItems.items.splice(leadIdx, 1);
      const svc = firstWithItems.serviceId as ServiceId;
      const leadServices = lead.services.includes(svc) ? lead.services : [svc, ...lead.services];
      hero = { ...lead, services: leadServices };
    }
  }

  // "New to rent or buy" — dedup against the recency/trending/free rows
  // above it so a title new to a service doesn't show in both "Recently
  // added" and here. (Per-service rows sit below and are subscription/
  // free-only, so they can't collide with rent/buy content.)
  const paidExclude = new Set<string>([
    ...recentlyAdded.map((i) => i.id),
    ...popular.map((i) => i.id),
    ...freeTonight.map((i) => i.id),
    ...(hero ? [hero.id] : []),
  ]);
  const paid = paidRaw.filter((i) => !paidExclude.has(i.id));

  // Personalised genre spotlights, ordered by the user's selected
  // clusters. Cross-row dedup vs per-service charts + prior spotlights
  // (the "same title in two adjacent rows" failure).
  const picks = profile?.selectedClusters ?? [];
  const exclude = new Set<string>();
  for (const c of rows) for (const i of c.items) exclude.add(i.id);
  if (hero) exclude.add(hero.id);
  for (const i of paid) exclude.add(i.id);

  // B4: the three spotlights fetch in PARALLEL rather than one after
  // another — three sequential round trips were the last serial stretch
  // in the whole feed.
  //
  // They cannot simply be parallelised, though: the sequential version
  // fed each spotlight's results into `exclude` so the next one could not
  // repeat them ("The Goldbergs in two consecutive sections"). Run
  // concurrently, they all see the same starting `exclude` and can
  // collide.
  //
  // So: fetch concurrently with the shared starting exclusions, then
  // resolve collisions in order afterwards. Spotlight 0 keeps its picks,
  // 1 drops anything 0 took, and so on — identical output ordering and
  // dedup guarantees to the sequential version, one round trip instead of
  // three. Over-fetch a little so a spotlight that loses items to an
  // earlier one still fills its row.
  const rawSpotlights = await Promise.all(
    Array.from({ length: SPOTLIGHT_COUNT }, (_, offset) =>
      fetchGenreSpotlight(
        services,
        SPOTLIGHT_FETCH_SIZE,
        offset,
        picks,
        exclude,
      ).catch(() => null), // A spotlight failure must not blank Home.
    ),
  );

  const spotlights: GenreSpotlight[] = [];
  for (const sp of rawSpotlights) {
    if (!sp) continue;
    const items = sp.items.filter((i) => !exclude.has(i.id)).slice(0, SPOTLIGHT_SIZE);
    if (items.length === 0) continue;
    spotlights.push({ ...sp, items });
    for (const i of items) exclude.add(i.id);
  }

  return { hero, recentlyAdded, popular, freeTonight, paid, upcoming, rows, spotlights };
}

/**
 * B6 — stale-while-revalidate.
 *
 * The persisted MMKV cache has always held the last payload; the app just
 * never preferred it on launch. Two things stopped it painting:
 *
 *  1. While PersistQueryClientProvider restores, queries are PAUSED —
 *     `isFetching` is false, so `isLoading` is false, and `data` is still
 *     undefined. The screen's `if (!data)` branch therefore ran, showing
 *     the failure state for a moment on every cold start. The same held
 *     before `useUserServices` resolved, since `enabled` was false.
 *     "Nothing yet" was being rendered as "something broke".
 *
 *  2. The query key embeds the service list, so the moment services
 *     resolve the key CHANGES — and the new key has no in-memory data,
 *     dropping the screen back to empty even when the old key was showing
 *     content.
 *
 * `isBootstrapping` distinguishes "no data yet" from "this failed", and
 * keepPreviousData carries the previous key's payload across the switch.
 * Revalidation is unchanged — a stale entry still refetches in the
 * background, it just does so behind visible content.
 */
export function useHomeFeed() {
  const { data: services } = useUserServices();
  const isRestoring = useIsRestoring();

  const query = useQuery({
    queryKey: ['native', 'home', 'feed', services?.join(',') ?? ''],
    queryFn: () => fetchHomeFeed(services ?? []),
    enabled: !!services,
    // 30 min was already right for SWR — left alone deliberately.
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  return { ...query, isBootstrapping: isRestoring || !services };
}
