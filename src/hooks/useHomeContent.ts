import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import type { FilterState } from '@/lib/search/filterState';
import type { ServiceId } from '@/components/platformLogos';
import type { ContentItem } from '@/components/ContentCard';
import { GENRE_NAME_TO_ID } from '@/lib/constants/genres';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { supabase } from '@/lib/supabase';

/** Editor's note shape per Phase 6 migration 040. */
export interface EditorNote {
  id: string;
  kicker: string;
  teaser: string;
  body: string;
  publishedAt: string;
}

/** Fallback note when Supabase returns nothing (or the table doesn't
 *  exist yet locally). Keeps the §5.2 strip populated regardless of
 *  remote availability — same copy that App.tsx rendered inline
 *  before this hook was wired up. */
const FALLBACK_NOTE: EditorNote = {
  id: 'fallback',
  kicker: "EDITOR'S NOTE",
  teaser:
    "A great prestige drama, three sci-fi misses, and the case for taking notes during the credits.",
  body:
    "A great prestige drama is rare in any year, and this week we have one. Three and a half hours of patient cinema that earns every minute — and a reminder that the streaming services still know how to platform serious work when they want to.\n\nElsewhere the sci-fi shelf is thin. Two of the three new high-concept releases stumble in the second act, and the third never finds a tone. Worth waiting on.\n\nThe case for credits: keep watching after the cut. The best gags this season are tucked into the typography.",
  publishedAt: new Date().toISOString(),
};

// PLAT-1: the bespoke sessionStorage TTL cache for the editor's note is
// replaced by the query cache (24h stale/gc under the memory-only 'home'
// namespace — equivalent lifetime: sessionStorage also died with the
// app process).
const EDITOR_NOTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchEditorNote(): Promise<EditorNote | null> {
  // Migration 040 (editor_notes) lives in the repo but is not applied to
  // the remote project — `database.types.ts` therefore has no entry for
  // this table, and the .from('editor_notes') call needs to bypass the
  // generated schema types. A structural stub of the exact call chain is
  // used until the migration is applied; gracefully no-ops via the error
  // check below when the table is absent.
  const untypedFrom = supabase.from as unknown as (table: string) => {
    select: (columns: string) => {
      order: (column: string, opts: { ascending: boolean }) => {
        limit: (count: number) => {
          maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await untypedFrom('editor_notes')
    .select('id, kicker, teaser, body, published_at')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table may not exist yet on this Supabase project (migration not
    // applied locally). That's expected during the v3 redesign rollout
    // — fall back silently.
    if (process.env.NODE_ENV !== 'production') {
      console.info('[useHomeContent] editor_notes unavailable:', error.message);
    }
    return null;
  }

  if (!data) return null;

  const row = data as {
    id: string;
    kicker: string;
    teaser: string | null;
    body: string;
    published_at: string;
  };
  return {
    id: row.id,
    kicker: row.kicker,
    teaser: row.teaser ?? row.body,
    body: row.body,
    publishedAt: row.published_at,
  };
}

export function useHomeContent(providerIds: number[], filters?: FilterState) {
  const [reloadCounter, setReloadCounter] = useState(0);

  // Phase 4 Home rows
  const [perServiceCharts, setPerServiceCharts] = useState<PerServiceChartRow[]>([]);
  const [criticallyAcclaimed, setCriticallyAcclaimed] = useState<ContentItem[]>([]);
  type GenreSpotlightRow = { clusterName: string; items: ContentItem[] };
  const [genreSpotlights, setGenreSpotlights] = useState<GenreSpotlightRow[]>([]);
  const [spotlightsLoading, setSpotlightsLoading] = useState(false);
  // User's onboarding cluster picks. Drives spotlight ordering — picked
  // clusters surface first, the rest rotate weekly behind. Falls back to
  // empty array (= pure week rotation) if profile isn't loaded yet.
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);

  // §5.2 editor's note. Reads once-per-day from the editor_notes table
  // (migration 040); falls back to the hardcoded FALLBACK_NOTE if
  // Supabase returns nothing or errors (fetchEditorNote returns null in
  // both cases — never throws).
  const editorNoteQuery = useQuery({
    queryKey: ['home', 'editorNote'],
    queryFn: fetchEditorNote,
    staleTime: EDITOR_NOTE_CACHE_TTL_MS,
    gcTime: EDITOR_NOTE_CACHE_TTL_MS,
  });
  const editorNote: EditorNote = editorNoteQuery.data ?? FALLBACK_NOTE;

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

    const costSet = new Set(filters?.costs || []);
    if (costSet.size > 0) {
      const tmdbTypes: string[] = [];
      if (costSet.has('free')) tmdbTypes.push('flatrate', 'free', 'ads');
      if (costSet.has('rent')) tmdbTypes.push('rent');
      if (costSet.has('buy')) tmdbTypes.push('buy');
      params.with_watch_monetization_types = tmdbTypes.join('|');
      const paidOnly = !costSet.has('free') && (costSet.has('rent') || costSet.has('buy'));
      if (paidOnly) delete params.with_watch_providers;
    }

    const contentType = filters?.contentType || 'all';
    const fm = contentType === 'all' || contentType === 'movie' || contentType === 'doc';
    const ft = contentType === 'all' || contentType === 'tv';

    const costKey = [...(filters?.costs || [])].sort().join(',');
    const key = `${providerStr}|${filters?.contentType || 'all'}|${costKey}|${filters?.services?.join(',') || ''}|${filters?.genres?.join(',') || ''}|${filters?.minRating || 0}`;

    return { baseParams: params, filterKey: key, fetchMovies: fm, fetchTV: ft };
  }, [providerStr, filters?.contentType, [...(filters?.costs || [])].sort().join(','), filters?.services?.join(','), filters?.genres?.join(','), filters?.minRating]);

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

  // --- Shared filter sets (PLAT-1: query-cached, memory-only 'home'
  // namespace, 15min gcTime → tab-return reuses them) ---
  const filterSetsQuery = useQuery({
    queryKey: ['home', 'filterSets', providerStr, reloadCounter],
    enabled: !!providerStr,
    staleTime: 0,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<FilterSets | null> => {
      const serviceIds: string[] = providerIds
        .map(id => providerIdToServiceId(id))
        .filter(Boolean) as string[];
      if (serviceIds.length === 0) return null;
      return buildFilterSets(serviceIds);
    },
  });
  const sharedFilters: FilterSets | null = filterSetsQuery.data ?? null;
  const availableCount = sharedFilters?.availableTmdbIds.size ?? -1;

  // --- Phase 4 Home rows (PLAT-1: one query, enabled when filters are
  // ready). The documented Home WATERFALL died here: profile, charts and
  // acclaimed had no data dependencies on each other and now fetch in
  // ONE parallel window (was profile → [charts ∥ acclaimed]). The
  // spotlight still waits for charts — its dedup seed (the
  // "Goldbergs in adjacent sections" fix) is a real dependency. Inputs
  // to every fetcher are identical → rendered content identical.
  const rowsQuery = useQuery({
    queryKey: ['home', 'rows', providerStr, availableCount, reloadCounter],
    enabled: !!sharedFilters,
    staleTime: 0,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const sf = sharedFilters as FilterSets;
      const serviceIds: string[] = providerIds
        .map(id => providerIdToServiceId(id))
        .filter(Boolean) as string[];

      const [profile, charts, acclaimed] = await Promise.all([
        getV2TasteProfile(),
        fetchPerServiceCharts(serviceIds),
        fetchCriticallyAcclaimed(sf.availableTmdbIds),
      ]);
      const picks = profile?.selectedClusters ?? [];

      const seedExclude = new Set<string>();
      for (const c of charts) for (const i of c.items) seedExclude.add(i.id);

      const primarySpotlight = await fetchGenreSpotlight(
        sf.availableTmdbIds,
        15,
        0,
        picks,
        seedExclude,
      );

      return { picks, charts, acclaimed, primarySpotlight };
    },
  });

  // Applier — distribute the rows payload into state (selectedClusters
  // and genreSpotlights stay state because loadMoreGenreSpotlights
  // appends to them imperatively, exactly as before).
  useEffect(() => {
    const data = rowsQuery.data;
    if (!data) return;
    setSelectedClusters(data.picks);
    setPerServiceCharts(data.charts);
    setCriticallyAcclaimed(data.acclaimed);
    setGenreSpotlights(data.primarySpotlight.items.length > 0 ? [data.primarySpotlight] : []);
  }, [rowsQuery.data]);

  useEffect(() => {
    if (rowsQuery.isError) {
      console.error('[useHomeContent] Phase 4 rows error:', rowsQuery.error);
    }
  }, [rowsQuery.isError, rowsQuery.error]);

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
    // §5.2 editor's note — Phase 6 (migration 040 + cached fetch)
    editorNote,
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
