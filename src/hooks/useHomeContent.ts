import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRecommendations } from './useRecommendations';
import { useHiddenGems } from './useHiddenGems';
import { useSectionData } from './useSectionData';
import { clearSectionCache } from '@/lib/sectionSessionCache';
import { getHomeGenres } from '@/lib/storage/userPreferences';
import { calculateGenreAffinities, type GenreAffinities } from '@/lib/utils/recommendationEngine';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { GENRE_NAME_TO_ID, TASTE_GENRE_IDS, GENRE_NAMES, GENRE_KEY_TO_TMDB } from '@/lib/constants/genres';
import type { FilterState } from '@/components/FilterSheet';
import { getTasteProfile } from '@/lib/storage/tasteProfile';
import { getGenresFromVector } from '@/lib/taste/tasteVector';

export function useHomeContent(providerIds: number[], filters?: FilterState) {
  const [genreList, setGenreList] = useState<number[]>([]);
  const [genreAffinities, setGenreAffinities] = useState<GenreAffinities>({});
  const [metaLoading, setMetaLoading] = useState(true);
  const [reloadCounter, setReloadCounter] = useState(0);

  const providerStr = providerIds.join(',');

  // --- Build base params (ported from useContentService) ---
  const { baseParams, filterKey, fetchMovies, fetchTV, filterGenreIds } = useMemo(() => {
    let providerPipe: string;
    if (filters?.services && filters.services.length > 0) {
      const filterProviderIds = serviceIdsToProviderIds(filters.services as ServiceId[]);
      providerPipe = filterProviderIds.join('|');
    } else {
      providerPipe = providerStr.replace(/,/g, '|');
    }

    const params: Record<string, unknown> = {
      with_watch_providers: providerPipe,
      watch_region: 'GB',
    };

    const genreIds = (filters?.genres || [])
      .map((name) => GENRE_NAME_TO_ID[name])
      .filter((id): id is number => id !== undefined);
    if (genreIds.length > 0) params.with_genres = genreIds.join(',');

    if (filters?.minRating && filters.minRating > 0) {
      params['vote_average.gte'] = filters.minRating;
      params['vote_count.gte'] = 50;
    }

    if (filters?.cost === 'Free') {
      params.with_watch_monetization_types = 'flatrate|free|ads';
    } else if (filters?.cost === 'Paid') {
      params.with_watch_monetization_types = 'rent|buy';
      delete params.with_watch_providers;
    }

    const contentType = filters?.contentType || 'All';
    const fm = contentType === 'All' || contentType === 'Movies' || contentType === 'Docs';
    const ft = contentType === 'All' || contentType === 'TV';

    const key = `${providerStr}|${filters?.contentType || 'All'}|${filters?.cost || 'All'}|${filters?.services?.join(',') || ''}|${filters?.genres?.join(',') || ''}|${filters?.minRating || 0}`;

    return { baseParams: params, filterKey: key, fetchMovies: fm, fetchTV: ft, filterGenreIds: genreIds };
  }, [providerStr, filters?.contentType, filters?.cost, filters?.services?.join(','), filters?.genres?.join(','), filters?.minRating]);

  // Composite key: includes reloadCounter so sections re-init on pull-to-refresh
  const sectionKeyBase = `${filterKey}|${reloadCounter}`;

  // --- Shared dedup set (cleared in-place on reload) ---
  const excludeIdsRef = useRef(new Set<string>());

  // Reset excludeIds when filters or reload changes
  useEffect(() => {
    excludeIdsRef.current.clear();
  }, [sectionKeyBase]);

  const registerIds = useCallback((ids: string[]) => {
    for (const id of ids) {
      excludeIdsRef.current.add(id);
    }
  }, []);

  // --- Today's date for "recently added" ---
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // --- Fixed sections via useSectionData ---
  const popular = useSectionData({
    sectionKey: `popular|${sectionKeyBase}`,
    baseParams,
    movieParams: { sort_by: 'popularity.desc' },
    tvParams: { sort_by: 'popularity.desc' },
    fetchMovies,
    fetchTV,
    enabled: !!providerStr,
    excludeIds: excludeIdsRef.current,
    onNewIds: registerIds,
  });

  const highestRated = useSectionData({
    sectionKey: `highestRated|${sectionKeyBase}`,
    baseParams,
    movieParams: { sort_by: 'vote_average.desc', 'vote_count.gte': 100 },
    tvParams: { sort_by: 'vote_average.desc', 'vote_count.gte': 100 },
    fetchMovies,
    fetchTV,
    enabled: !!providerStr,
    excludeIds: excludeIdsRef.current,
    onNewIds: registerIds,
  });

  const recentlyAdded = useSectionData({
    sectionKey: `recentlyAdded|${sectionKeyBase}`,
    baseParams,
    movieParams: { sort_by: 'primary_release_date.desc', 'primary_release_date.lte': today },
    tvParams: { sort_by: 'first_air_date.desc', 'first_air_date.lte': today },
    fetchMovies,
    fetchTV,
    enabled: !!providerStr,
    excludeIds: excludeIdsRef.current,
    onNewIds: registerIds,
  });

  // --- Recommendations ("For You") ---
  const recs = useRecommendations(providerIds);

  // --- Hidden Gems ---
  const hiddenGems = useHiddenGems(providerIds);

  // --- Load genre list + affinities (vector-driven when quiz completed) ---
  useEffect(() => {
    let cancelled = false;
    setMetaLoading(true);
    async function load() {
      try {
        const [homeGenres, affinities, tasteProfile] = await Promise.all([
          getHomeGenres(),
          calculateGenreAffinities(),
          getTasteProfile(),
        ]);
        if (cancelled) return;

        setGenreAffinities(affinities);

        if (tasteProfile?.quizCompleted && tasteProfile.vector) {
          // Post-quiz: all genres above threshold, ordered by vector score
          const vectorKeys = getGenresFromVector(tasteProfile.vector);
          const vectorGenreIds = vectorKeys
            .map((key) => GENRE_KEY_TO_TMDB[key])
            .filter(Boolean);
          setGenreList(vectorGenreIds.length > 0 ? vectorGenreIds : homeGenres);
        } else {
          // Pre-quiz fallback: onboarding genre selections
          setGenreList(homeGenres);
        }
      } catch (err) {
        console.error('[useHomeContent] Error loading genres/affinities:', err);
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadCounter]);

  // --- Featured item (first popular item) ---
  const featured = popular.items.length > 0 ? popular.items[0] : null;

  // --- Overall loading (true until at least one fixed section has items) ---
  const loading = !providerStr || (popular.loading && highestRated.loading && recentlyAdded.loading);

  // --- Reload all (pull-to-refresh) ---
  const reload = useCallback(async () => {
    clearSectionCache();
    excludeIdsRef.current.clear();
    setReloadCounter((c) => c + 1);
    // Also reload recommendations and hidden gems
    await Promise.all([recs.reload(), hiddenGems.reload()]);
  }, [recs.reload, hiddenGems.reload]);

  return {
    featured,
    popular,
    highestRated,
    recentlyAdded,
    forYou: recs,
    hiddenGems,
    genreList,
    genreAffinities,
    baseParams,
    filterKey,
    sectionKeyBase,
    filterGenreIds,
    fetchMovies,
    fetchTV,
    excludeIds: excludeIdsRef.current,
    registerIds,
    loading,
    metaLoading,
    reload,
  };
}
