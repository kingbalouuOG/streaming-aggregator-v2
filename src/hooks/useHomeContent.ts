import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSectionData } from './useSectionData';
import { clearSectionCache } from '@/lib/sectionSessionCache';
import { prefetchServices } from '@/lib/utils/serviceCache';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { buildFilterSets, type FilterSets } from '@/lib/recommendations-v2/hardFilters';
import { fetchPerServiceCharts, type PerServiceChartRow } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import { fetchCriticallyAcclaimed } from '@/lib/recommendations-v2/rows/home/criticallyAcclaimed';
import { fetchGenreSpotlight } from '@/lib/recommendations-v2/rows/home/genreSpotlight';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import type { FilterState } from '@/components/FilterSheet';
import type { ServiceId } from '@/components/platformLogos';
import type { ContentItem } from '@/components/ContentCard';
import { GENRE_NAME_TO_ID } from '@/lib/constants/genres';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';

export function useHomeContent(providerIds: number[], filters?: FilterState) {
  const [sharedFilters, setSharedFilters] = useState<FilterSets | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Phase 4 Home rows
  const [perServiceCharts, setPerServiceCharts] = useState<PerServiceChartRow[]>([]);
  const [criticallyAcclaimed, setCriticallyAcclaimed] = useState<ContentItem[]>([]);
  type GenreSpotlightRow = { clusterName: string; emoji: string; items: ContentItem[] };
  const [genreSpotlights, setGenreSpotlights] = useState<GenreSpotlightRow[]>([]);
  const [spotlightsLoading, setSpotlightsLoading] = useState(false);
  // User's onboarding cluster picks. Drives spotlight ordering — picked
  // clusters surface first, the rest rotate weekly behind. Falls back to
  // empty array (= pure week rotation) if profile isn't loaded yet.
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);

  const providerStr = providerIds.join(',');

  // --- Build base params for TMDb discover ---
  const { baseParams, filterKey, fetchMovies, fetchTV } = useMemo(() => {
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

    return { baseParams: params, filterKey: key, fetchMovies: fm, fetchTV: ft };
  }, [providerStr, filters?.contentType, filters?.cost, filters?.services?.join(','), filters?.genres?.join(','), filters?.minRating]);

  // Composite key: includes reloadCounter so sections re-init on pull-to-refresh
  const sectionKeyBase = `${filterKey}|${reloadCounter}`;

  // --- Today's date for "recently added" ---
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // --- TMDb API sections ---

  const popular = useSectionData({
    sectionKey: `popular|${sectionKeyBase}`,
    baseParams,
    movieParams: { sort_by: 'popularity.desc' },
    tvParams: { sort_by: 'popularity.desc' },
    fetchMovies,
    fetchTV,
    enabled: !!providerStr,
    skipExternalDedup: true,
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
    initialSize: 15,
    batchSize: 8,
  });

  // --- Build shared filter sets ---
  useEffect(() => {
    if (!providerStr) return;
    const serviceIds: string[] = providerIds
      .map(id => providerIdToServiceId(id))
      .filter(Boolean) as string[];
    if (serviceIds.length === 0) return;
    buildFilterSets(serviceIds).then(setSharedFilters);
  }, [providerStr, reloadCounter]);

  // --- Phase 4 Home rows (fetch when filters are ready) ---
  useEffect(() => {
    if (!sharedFilters) return;
    const serviceIds: string[] = providerIds
      .map(id => providerIdToServiceId(id))
      .filter(Boolean) as string[];

    // Read profile to get selectedClusters for spotlight ordering. The
    // result feeds both the local state (for `loadMoreGenreSpotlights`)
    // and the primary fetch below.
    void getV2TasteProfile().then((profile) => {
      const picks = profile?.selectedClusters ?? [];
      setSelectedClusters(picks);

      // Build per-service-charts ID set as initial dedup seed for
      // spotlights — Joe's "Goldbergs in adjacent sections" was a
      // dedup miss. Per-service rows ship before spotlights so we
      // can safely seed.
      Promise.all([
        fetchPerServiceCharts(serviceIds),
        fetchCriticallyAcclaimed(sharedFilters!.availableTmdbIds),
      ]).then(async ([charts, acclaimed]) => {
        setPerServiceCharts(charts);
        setCriticallyAcclaimed(acclaimed);

        const seedExclude = new Set<string>();
        for (const c of charts) for (const i of c.items) seedExclude.add(i.id);

        const primarySpotlight = await fetchGenreSpotlight(
          sharedFilters!.availableTmdbIds,
          15,
          0,
          picks,
          seedExclude,
        );
        setGenreSpotlights(primarySpotlight.items.length > 0 ? [primarySpotlight] : []);
      }).catch((err) => {
        console.error('[useHomeContent] Phase 4 rows error:', err);
      });
    });
  }, [sharedFilters, providerStr]);

  /**
   * Lazy-load the next genre spotlight. Called from a scroll sentinel
   * placed below the last rendered spotlight. Stops at 16 (the cluster
   * cycle length) so we don't loop. No-op while a previous load is in
   * flight.
   */
  const MAX_GENRE_SPOTLIGHTS = 16;
  const loadMoreGenreSpotlights = useCallback(async () => {
    if (!sharedFilters) return;
    if (spotlightsLoading) return;
    if (genreSpotlights.length >= MAX_GENRE_SPOTLIGHTS) return;

    setSpotlightsLoading(true);
    try {
      const offset = genreSpotlights.length; // 0-based; primary was offset 0

      // Build dedup set from everything already on Home (other genre
      // spotlights + per-service charts). Same item appearing in two
      // adjacent rows is the most visible dedup failure.
      const exclude = new Set<string>();
      for (const sp of genreSpotlights) for (const i of sp.items) exclude.add(i.id);
      for (const c of perServiceCharts) for (const i of c.items) exclude.add(i.id);

      const next = await fetchGenreSpotlight(
        sharedFilters.availableTmdbIds,
        15,
        offset,
        selectedClusters,
        exclude,
      );
      // Always append (even if empty) so the sentinel chain advances
      // to the next cluster on the next scroll trigger.
      setGenreSpotlights((prev) => [...prev, next]);
    } catch (err) {
      console.error('[useHomeContent] loadMoreGenreSpotlights error:', err);
    } finally {
      setSpotlightsLoading(false);
    }
  }, [sharedFilters, spotlightsLoading, genreSpotlights, perServiceCharts, selectedClusters]);

  // --- Render-time dedup ---
  const dedupedSections = useMemo(() => {
    const seen = new Set<string>();
    const dedupList = (items: ContentItem[]) => {
      return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    };

    return {
      recentlyAdded: dedupList(recentlyAdded.items),
      popular: dedupList(popular.items),
    };
  }, [recentlyAdded.items, popular.items]);

  // --- Overall loading ---
  const loading = !providerStr || (popular.loading && recentlyAdded.loading);

  // --- Prefetch services for visible items ---
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current || loading) return;
    const allItems = [
      ...dedupedSections.popular.slice(0, 5),
      ...dedupedSections.recentlyAdded.slice(0, 5),
    ];
    if (allItems.length === 0) return;
    prefetchedRef.current = true;
    const parsed = allItems.map((item) => {
      const { tmdbId, mediaType } = parseContentItemId(item.id);
      return { id: String(tmdbId), type: mediaType };
    });
    void prefetchServices(parsed);
  }, [loading, dedupedSections.popular, dedupedSections.recentlyAdded]);

  // --- Reload all (pull-to-refresh) ---
  const reload = useCallback(async () => {
    clearSectionCache();
    setReloadCounter((c) => c + 1);
  }, []);

  return {
    popular: { ...popular, items: dedupedSections.popular },
    recentlyAdded: { ...recentlyAdded, items: dedupedSections.recentlyAdded },
    // Shared filter sets (for ForYouPage to reuse)
    sharedFilters,
    // Phase 4 Home rows
    perServiceCharts,
    criticallyAcclaimed,
    genreSpotlights,
    spotlightsLoading,
    canLoadMoreGenreSpotlights:
      genreSpotlights.length > 0 && genreSpotlights.length < MAX_GENRE_SPOTLIGHTS,
    loadMoreGenreSpotlights,
    fetchMovies,
    fetchTV,
    loading,
    reload,
  };
}
