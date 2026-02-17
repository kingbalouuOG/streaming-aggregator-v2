import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRecommendations } from './useRecommendations';
import { useHiddenGems } from './useHiddenGems';
import { useSectionData } from './useSectionData';
import { clearSectionCache } from '@/lib/sectionSessionCache';
import { invalidateRecommendationCache } from '@/lib/storage/recommendations';
import storage from '@/lib/storage';
import { getHomeGenres } from '@/lib/storage/userPreferences';
import { calculateGenreAffinities, type GenreAffinities } from '@/lib/utils/recommendationEngine';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { GENRE_NAME_TO_ID, TASTE_GENRE_IDS, GENRE_NAMES, GENRE_KEY_TO_TMDB } from '@/lib/constants/genres';
import { reorderWithinWindows } from '@/lib/taste/genreBlending';
import type { FilterState } from '@/components/FilterSheet';
import type { ServiceId } from '@/components/platformLogos';
import { getTasteProfile } from '@/lib/storage/tasteProfile';
import { getGenresFromVector } from '@/lib/taste/tasteVector';
import type { TasteVector } from '@/lib/taste/tasteVector';
import type { ContentItem } from '@/components/ContentCard';
import { debug } from '@/lib/debugLogger';

export function useHomeContent(providerIds: number[], filters?: FilterState) {
  const [genreList, setGenreList] = useState<number[]>([]);
  const [genreAffinities, setGenreAffinities] = useState<GenreAffinities>({});
  const [tasteVector, setTasteVector] = useState<TasteVector | null>(null);
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

  // --- Genre section dedup (excludeIds built from fixed sections via useMemo) ---
  // Genre sections still use the ref-based approach for cross-genre dedup
  const genreExcludeRef = useRef(new Set<string>());

  useEffect(() => {
    genreExcludeRef.current.clear();
  }, [sectionKeyBase]);

  const registerGenreIds = useCallback((ids: string[]) => {
    for (const id of ids) {
      genreExcludeRef.current.add(id);
    }
  }, []);

  // --- Today's date for "recently added" ---
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // --- Fixed sections via useSectionData ---
  // All use skipExternalDedup: true — dedup handled by useMemo below
  // Over-fetch: initialSize=15 to compensate for dedup filtering

  const popular = useSectionData({
    sectionKey: `popular|${sectionKeyBase}`,
    baseParams,
    movieParams: { sort_by: 'popularity.desc' },
    tvParams: { sort_by: 'popularity.desc' },
    fetchMovies,
    fetchTV,
    enabled: !!providerStr,
    skipExternalDedup: true,
    scoringMode: 'windowReorder',
    tasteVector,
    initialSize: 15,
    batchSize: 8,
  });

  const highestRated = useSectionData({
    sectionKey: `highestRated|${sectionKeyBase}`,
    baseParams,
    movieParams: { sort_by: 'vote_average.desc', 'vote_count.gte': 100 },
    tvParams: { sort_by: 'vote_average.desc', 'vote_count.gte': 100 },
    fetchMovies,
    fetchTV,
    enabled: !!providerStr,
    skipExternalDedup: true,
    scoringMode: 'windowReorder',
    tasteVector,
    initialSize: 15,
    batchSize: 8,
  });

  const recentlyAdded = useSectionData({
    sectionKey: `recentlyAdded|${sectionKeyBase}`,
    baseParams,
    movieParams: { sort_by: 'primary_release_date.desc', 'primary_release_date.lte': today },
    tvParams: { sort_by: 'first_air_date.desc', 'first_air_date.lte': today },
    fetchMovies,
    fetchTV,
    enabled: !!providerStr,
    skipExternalDedup: true,
    scoringMode: 'windowReorder',
    tasteVector,
    initialSize: 15,
    batchSize: 8,
  });

  // --- Recommendations ("For You") ---
  const recs = useRecommendations(providerIds, fetchMovies, fetchTV, filterGenreIds);

  // --- Hidden Gems ---
  const hiddenGems = useHiddenGems(providerIds, fetchMovies, fetchTV, filterGenreIds);

  // --- Render-time dedup (strict priority order) ---
  // All fixed sections fetch in parallel; this useMemo enforces priority regardless of
  // which section's async fetch completes first.
  const { dedupedSections, fixedSectionIds } = useMemo(() => {
    const seen = new Set<string>();
    const dedupList = (items: ContentItem[], sectionName: string) => {
      const before = items.length;
      const removed: string[] = [];
      const result = items.filter((item) => {
        if (seen.has(item.id)) { removed.push(item.id); return false; }
        seen.add(item.id);
        return true;
      });
      if (before > 0) {
        debug.info('Dedup', `Section: ${sectionName}`, {
          rawCount: before,
          afterDedup: result.length,
          removedCount: removed.length,
          removedIds: removed.slice(0, 10),
        });
      }
      return result;
    };

    // Priority order: ForYou first pick, then down the list
    const result = {
      forYou: dedupList(recs.items, 'ForYou'),
      recentlyAdded: dedupList(recentlyAdded.items, 'RecentlyAdded'),
      highestRated: dedupList(highestRated.items, 'HighestRated'),
      popular: dedupList(popular.items, 'Popular'),
      hiddenGems: dedupList(hiddenGems.items, 'HiddenGems'),
    };

    debug.info('Dedup', 'Summary', {
      totalSeen: seen.size,
      perSection: {
        forYou: result.forYou.length,
        recentlyAdded: result.recentlyAdded.length,
        highestRated: result.highestRated.length,
        popular: result.popular.length,
        hiddenGems: result.hiddenGems.length,
      },
    });

    return { dedupedSections: result, fixedSectionIds: seen };
  }, [recs.items, recentlyAdded.items, highestRated.items, popular.items, hiddenGems.items]);

  // Build combined exclude set for genre sections (fixed section IDs + other genre section IDs)
  const genreExcludeIds = useMemo(() => {
    const combined = new Set(fixedSectionIds);
    for (const id of genreExcludeRef.current) {
      combined.add(id);
    }
    return combined;
  }, [fixedSectionIds]);

  // --- Load genre list + affinities + taste vector ---
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
        setTasteVector(tasteProfile?.vector || null);

        debug.info('Vector', 'Meta loaded', {
          hasVector: !!tasteProfile?.vector,
          quizCompleted: !!tasteProfile?.quizCompleted,
          affinityCount: Object.keys(affinities).length,
          topAffinities: Object.entries(affinities)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 5)
            .map(([id, score]) => ({ genreId: Number(id), name: GENRE_NAMES[Number(id)], score })),
        });

        if (tasteProfile?.vector) {
          const v = tasteProfile.vector;
          const allDims = Object.entries(v)
            .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
            .map(([k, val]) => `${k}:${(val as number).toFixed(3)}`);
          debug.info('Vector', 'Full stored vector (25D)', { dimensions: allDims });
        }

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

  // --- Featured item (first popular item after dedup) ---
  const featured = dedupedSections.popular.length > 0 ? dedupedSections.popular[0] : null;

  // --- Overall loading (true until at least one fixed section has items) ---
  const loading = !providerStr || (popular.loading && highestRated.loading && recentlyAdded.loading);

  // --- Auto-refresh ForYou + HiddenGems when taste vector becomes available (post-quiz) ---
  const prevVectorRef = useRef<TasteVector | null>(null);
  useEffect(() => {
    const prev = prevVectorRef.current;
    prevVectorRef.current = tasteVector;
    // Skip initial mount (prev is null and tasteVector is null)
    if (prev === null && tasteVector === null) return;
    // Vector changed (null → value, or value → different value after retake)
    if (tasteVector && tasteVector !== prev) {
      debug.info('Vector', 'Vector changed — refreshing ForYou + HiddenGems');
      (async () => {
        await Promise.all([
          invalidateRecommendationCache(),
          storage.removeItem('@app_hidden_gems'),
        ]).catch(() => {});
        await Promise.all([recs.reload(), hiddenGems.reload()]);
      })();
    }
  }, [tasteVector, recs.reload, hiddenGems.reload]);

  // --- Reload all (pull-to-refresh) ---
  const reload = useCallback(async () => {
    clearSectionCache();
    genreExcludeRef.current.clear();
    // Invalidate recommendation + hidden gems localStorage caches
    await Promise.all([
      invalidateRecommendationCache(),
      storage.removeItem('@app_hidden_gems'),
    ]).catch(() => {});
    setReloadCounter((c) => c + 1);
    // Reload recommendations and hidden gems with fresh data
    await Promise.all([recs.reload(), hiddenGems.reload()]);
  }, [recs.reload, hiddenGems.reload]);

  return {
    featured,
    // Deduped fixed sections: spread original hook state (loadMore, hasMore, etc.) with deduped items
    popular: { ...popular, items: dedupedSections.popular },
    highestRated: { ...highestRated, items: dedupedSections.highestRated },
    recentlyAdded: { ...recentlyAdded, items: dedupedSections.recentlyAdded },
    forYou: { ...recs, items: dedupedSections.forYou },
    hiddenGems: { ...hiddenGems, items: dedupedSections.hiddenGems },
    // Genre section support
    genreList,
    genreAffinities,
    tasteVector,
    baseParams,
    filterKey,
    sectionKeyBase,
    filterGenreIds,
    fetchMovies,
    fetchTV,
    genreExcludeIds,
    registerGenreIds,
    loading,
    metaLoading,
    reload,
  };
}
