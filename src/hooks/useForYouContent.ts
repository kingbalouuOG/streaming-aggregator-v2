/**
 * useForYouContent — orchestrates all For You surface rows.
 *
 * Uses the Phase 4 pipeline: one shared candidate pool (500 titles) serves
 * Recommended For You, Hidden Gems, and Outside Your Usual. Separate calls
 * for Because You Watched (per-anchor embeddings) and More From [Director/Actor]
 * (SQL query by person name). From Your Watchlist is a direct watchlist read.
 *
 * On slider change, re-runs scoring + row building on the cached pool.
 * Only calls the RPC again on explicit refresh or when pool is null.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCandidatePool, scoreCandidates, buildRowFromPool } from '@/lib/recommendations-v2/ranker';
import { buildAnchoredRoom } from '@/lib/recommendations-v2/anchoredRoom';
import { buildFilterSets, type FilterSets } from '@/lib/recommendations-v2/hardFilters';
import { getV2TasteProfile, getSliderState, getInterestCentroids } from '@/lib/taste-v2/tasteProfileV2';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { supabase } from '@/lib/supabase';
import { getAuthUserId, isSupabaseActive } from '@/lib/storage';
import { getWatchlist } from '@/lib/storage/watchlist';
import {
  getComfortZoneRowCount,
  HIDDEN_GEMS_FILTERS,
  AVOID_PENALTY_GAMMA,
  EXPLORATION_COUNT,
  EXPLORATION_SLOT_POSITIONS,
  EXPLORATION_BAND,
  scoreToMatchPercentage,
} from '@/lib/recommendations-v2/weights';
import { fetchAvoidSet, applyAvoidPenalty } from '@/lib/recommendations-v2/avoidSet';
import {
  fetchSeenContentIds,
  selectExplorationCandidates,
  spliceAtPositions,
  explorationDayStamp,
} from '@/lib/recommendations-v2/exploration';
import { titleRowToContentItem } from '@/lib/recommendations-v2/titleAdapter';
import { watchlistItemToContentItem } from '@/lib/adapters/contentAdapter';
import { tryRenderForYouWorker } from '@/lib/recommendations-v2/edgeRender';
import { buildPipelineContext } from '@/lib/recommendations-v2/pipelineContext';
import type { AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';
import type { ContentItem } from '@/components/ContentCard';
import type { SliderState } from '@/lib/taste-v2/types';
import type { CandidatePool, PipelineContext, ScoredCandidate, ExtendedTitleRow } from '@/lib/recommendations-v2/types';
import { EXTENDED_TITLE_SELECT } from '@/lib/recommendations-v2/types';
import {
  buildEmbeddingCacheKey,
  computeNorm,
  getCachedEmbeddings,
  setCachedEmbeddings,
  type EmbeddingMap,
  type CachedEmbedding,
} from '@/lib/recommendations-v2/embeddingCache';

/**
 * Phase 5 fetch + Phase 5.5 cache: returns the embedding map for the
 * supplied candidates. Reads from localStorage first (24h TTL, keyed
 * on userId + taste_profiles.updated_at); on miss, fetches from
 * Supabase and populates the cache for the next load.
 *
 * Returns the new map shape `{ vec: Float32Array; norm: number }` so
 * MMR can skip the per-call Math.sqrt in its inner loop (IN-PX-24).
 *
 * Failures degrade to an empty map; MMR then no-ops and buildRowFromPool
 * falls back to applyGenreSpread.
 */
async function fetchEmbeddingsForCandidates(
  candidates: ScoredCandidate[],
  cacheContext: { userId: string | null; tasteProfilesUpdatedAt: string | null },
): Promise<EmbeddingMap> {
  if (candidates.length === 0) return new Map();
  if (!isSupabaseActive()) return new Map();

  // Cache lookup. Cold-start users (no userId) skip caching entirely
  // since cross-user contamination on a shared device is the worst
  // failure mode of this layer.
  const cacheKey = cacheContext.userId
    ? buildEmbeddingCacheKey(cacheContext.userId, cacheContext.tasteProfilesUpdatedAt)
    : null;
  let map: EmbeddingMap = new Map();
  if (cacheKey) {
    const cached = getCachedEmbeddings(cacheKey);
    if (cached) map = cached;
  }

  // Find which candidates are missing from cache and need a fresh fetch.
  const needed: number[] = [];
  for (const c of candidates) {
    if (!map.has(c.contentKey)) needed.push(c.tmdbId);
  }
  if (needed.length === 0) return map;
  const tmdbIds = [...new Set(needed)];

  try {
    const { data, error } = await supabase
      .from('titles')
      .select('tmdb_id, media_type, embedding')
      .in('tmdb_id', tmdbIds);
    if (error || !data) return map;
    for (const row of data) {
      if (row.embedding == null) continue;
      const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      if (Array.isArray(emb) && emb.length > 0) {
        const vec = new Float32Array(emb);
        map.set(`${row.media_type}-${row.tmdb_id}`, { vec, norm: computeNorm(vec) });
      }
    }
  } catch {
    // Network or parse error → return whatever we have (possibly empty).
  }

  if (cacheKey) setCachedEmbeddings(cacheKey, map);
  return map;
}

/**
 * PLAT-1 (plan §1 commit 6): the render acquisition — Edge attempt +
 * client-fallback pipeline — extracted into a pure async fn so TanStack
 * Query owns WHEN it runs and caches the products in memory (gcTime
 * 15min, key namespace 'foryou' → never persisted). Tab-away/tab-back
 * now re-applies the cached render instantly (SWR background refetch)
 * instead of re-running the full pipeline. Every pipeline step is
 * byte-identical to the pre-Query load(); PLAT-3 replaces this hook's
 * acquisition with the Worker feed and shrinks it again.
 */
type ForYouRenderResult =
  | { source: 'edge'; ctx: PipelineContext; edge: NonNullable<Awaited<ReturnType<typeof tryRenderForYouWorker>>> }
  | {
      source: 'client';
      ctx: PipelineContext;
      sliders: SliderState;
      filterSets: FilterSets;
      pool: CandidatePool;
      penalised: ScoredCandidate[];
      embMap: EmbeddingMap;
      avoidSet: CachedEmbedding[];
      seenIds: Set<number>;
    }
  | { source: 'empty'; ctx: PipelineContext };

async function fetchForYouRender(
  providerIds: number[],
  sharedFilters: FilterSets | null | undefined,
): Promise<ForYouRenderResult> {
  // ── Server path (videx-api Worker, PLAT-3) ──
  // Build ctx ahead of the call so the query carries the client's
  // local hourOfDay (decision 9); ctx is returned for the rerank path.
  const ctx = await buildPipelineContext();

  const edge = await tryRenderForYouWorker(providerIds, ctx);
  if (edge) {
    const anchorMax = edge.perAnchorLatencyMs.length > 0 ? Math.max(...edge.perAnchorLatencyMs) : 0;
    console.log(
      `[useForYouContent] worker: wall=${edge.wallclockMs}ms server=${edge.renderMs}ms `
      + `anchorMax=${anchorMax}ms rec=${edge.recommendedForYou.length} `
      + `gems=${edge.hiddenGems.length} outside=${edge.outsideYourUsual.length} `
      + `byw=${edge.becauseYouWatched.length} mfp=${edge.moreFromPerson ? 1 : 0} `
      + `wl=${edge.fromYourWatchlist.length} rooms=${edge.anchorRooms.length}`,
    );
    return { source: 'edge', ctx, edge };
  }

  // ── Client fallback path ── (identical pipeline to the pre-Query load)
  const [profile, sliderState, interestCentroids] = await Promise.all([
    getV2TasteProfile(),
    getSliderState(),
    getInterestCentroids(),
  ]);

  if (!profile?.tasteVector) {
    return { source: 'empty', ctx };
  }

  let filterSets: FilterSets;
  if (sharedFilters) {
    filterSets = sharedFilters;
  } else {
    const serviceIds = providerIds
      .map(id => providerIdToServiceId(id))
      .filter(Boolean) as string[];
    filterSets = await buildFilterSets(serviceIds);
  }

  // ENG-1: centroid rows present → per-interest retrieval; none →
  // legacy single-vector path (fallback ladder).
  const pool = await fetchCandidatePool({
    tasteVector: profile.tasteVector,
    filterSets,
    sliders: sliderState,
    surface: 'foryou',
    interests: interestCentroids.length > 0
      ? interestCentroids.map(c => ({ centroid: c.centroid, weight: c.weight, slot: c.slot }))
      : undefined,
  });

  const scored = scoreCandidates(pool, sliderState, 'foryou', ctx);

  // Phase 5: top-200 embeddings for MMR; Phase 5.5: 24h cache.
  // ENG-1: avoid set + seen-set in the same parallel window.
  const [embMap, avoidSet, seenIds] = await Promise.all([
    fetchEmbeddingsForCandidates(
      scored.slice(0, 200),
      {
        userId: getAuthUserId(),
        tasteProfilesUpdatedAt: profile.updatedAt,
      },
    ),
    fetchAvoidSet(),
    fetchSeenContentIds(),
  ]);

  // ENG-1 Workstream B: penalty after the embedding fetch, before rows.
  const penalised = applyAvoidPenalty(scored, avoidSet, embMap, AVOID_PENALTY_GAMMA);

  return { source: 'client', ctx, sliders: sliderState, filterSets, pool, penalised, embMap, avoidSet, seenIds };
}

interface BecauseYouWatchedRow {
  anchor: ContentItem;
  items: ContentItem[];
}

interface MoreFromPersonRow {
  personName: string;
  personType: 'director' | 'actor';
  items: ContentItem[];
}

export interface ForYouContentResult {
  recommendedForYou: ContentItem[];
  hiddenGems: ContentItem[];
  outsideYourUsual: ContentItem[];
  becauseYouWatched: BecauseYouWatchedRow[];
  moreFromPerson: MoreFromPersonRow | null;
  fromYourWatchlist: ContentItem[];
  sliders: SliderState | null;
  /**
   * The shared candidate pool from `fetchCandidatePool`. Exposed so the
   * anchored mood rooms hook can use it for the Tier 3 fallback in
   * `selectAnchors` without firing a second 500-candidate RPC. Null
   * before the first load completes.
   */
  pool: CandidatePool | null;
  /**
   * Anchor rooms pre-built by the render-foryou-rows Edge Function (IN-466).
   * When populated, useAnchorMoodRooms skips its anchor selection +
   * per-anchor room generation and renders these directly. Null on the
   * client-fallback path; the existing useAnchorMoodRooms flow runs.
   */
  prebuiltAnchorRooms: AnchorRoomPreview[] | null;
  loading: boolean;
  reload: () => Promise<void>;
  rerank: (sliders: SliderState) => void;
}

export function useForYouContent(
  providerIds: number[],
  sharedFilters?: FilterSets | null,
): ForYouContentResult {
  const [loading, setLoading] = useState(true);
  const [sliders, setSliders] = useState<SliderState | null>(null);
  const [recommendedForYou, setRecommendedForYou] = useState<ContentItem[]>([]);
  const [hiddenGems, setHiddenGems] = useState<ContentItem[]>([]);
  const [outsideYourUsual, setOutsideYourUsual] = useState<ContentItem[]>([]);
  const [becauseYouWatched, setBecauseYouWatched] = useState<BecauseYouWatchedRow[]>([]);
  const [moreFromPerson, setMoreFromPerson] = useState<MoreFromPersonRow | null>(null);
  const [fromYourWatchlist, setFromYourWatchlist] = useState<ContentItem[]>([]);
  // Pool is exposed to consumers (anchored mood rooms hook) so we keep
  // it in state, not just a ref. Updated alongside poolRef inside load().
  const [pool, setPool] = useState<CandidatePool | null>(null);
  const [prebuiltAnchorRooms, setPrebuiltAnchorRooms] = useState<AnchorRoomPreview[] | null>(null);

  const poolRef = useRef<CandidatePool | null>(null);
  const scoredRef = useRef<ScoredCandidate[] | null>(null);
  const filterSetsRef = useRef<FilterSets | null>(null);
  // Phase 5: cache the runtime PipelineContext built per load. The
  // rerank path (slider drag) reuses it so a re-rank doesn't refetch
  // viewing_context or call Device.getInfo() again.
  const ctxRef = useRef<PipelineContext>({});
  // Phase 5: cache the embedding map built per load. MMR re-runs on
  // slider drag without refetching from titles. Phase 5.5 (C5): map
  // shape is { vec: Float32Array; norm: number } for cached-norm MMR.
  const embeddingMapRef = useRef<EmbeddingMap>(new Map());
  // ENG-1 Workstream B: avoid-set embeddings cached per load so the
  // rerank path re-applies the penalty without refetching. Empty on the
  // Edge path (rows arrive pre-penalised; slider re-ranks degrade the
  // same way MMR already does there — embeddingMap is empty too).
  const avoidRef = useRef<CachedEmbedding[]>([]);
  // ENG-1 Workstream C: the user's recently-impressed content ids —
  // exploration picks must be novel. Fetched once per load.
  const seenIdsRef = useRef<Set<number>>(new Set());
  const providerStr = providerIds.join(',');

  // ── Build rows from scored candidates ──
  const buildRows = useCallback((scored: ScoredCandidate[], currentSliders: SliderState) => {
    const usedIds = new Set<string>();

    // 1. Recommended For You: top 20 after diversity, with
    // EXPLORATION_COUNT positions reserved for exploration picks
    // (ENG-1 Workstream C). Picks selected first so the base row can
    // exclude them; daily-seeded sampling keeps the slot stable across
    // re-renders and slider re-ranks, rotating each UTC day.
    const explorationPicks = selectExplorationCandidates(scored, {
      seenContentIds: seenIdsRef.current,
      excludeKeys: usedIds,
      count: EXPLORATION_COUNT,
      band: EXPLORATION_BAND,
      seed: `${getAuthUserId() ?? 'anon'}:${explorationDayStamp()}`,
    });
    explorationPicks.forEach(c => usedIds.add(c.contentKey));

    const recBase = buildRowFromPool(scored, currentSliders, {
      config: { limit: 20 - explorationPicks.length, excludeIds: usedIds },
      embeddingMap: embeddingMapRef.current,
    });
    recBase.forEach(item => usedIds.add(item.id));

    const explorationItems = explorationPicks.map(c => ({
      ...titleRowToContentItem(c.meta, scoreToMatchPercentage(c.finalScore)),
      exploration: true,
    }));
    const recItems = spliceAtPositions(recBase, explorationItems, EXPLORATION_SLOT_POSITIONS);
    setRecommendedForYou(recItems);

    // 2. Hidden Gems: from scored pool, popularity-capped
    const gemCandidates = scored.filter(c => {
      const pop = c.meta.popularity ?? 0;
      const votes = c.meta.vote_count ?? 0;
      const avg = c.meta.vote_average ?? 0;
      return (
        pop >= HIDDEN_GEMS_FILTERS.minPopularity &&
        pop <= HIDDEN_GEMS_FILTERS.maxPopularity &&
        votes >= HIDDEN_GEMS_FILTERS.minVoteCount &&
        avg >= HIDDEN_GEMS_FILTERS.minVoteAverage
      );
    });
    const gemItems = buildRowFromPool(gemCandidates, currentSliders, {
      config: { limit: 15, excludeIds: usedIds },
      embeddingMap: embeddingMapRef.current,
    });
    gemItems.forEach(item => usedIds.add(item.id));
    setHiddenGems(gemItems);

    // 3. Outside Your Usual: lower-taste candidates, intentionally varied.
    // Three knobs that produced the empty-row complaints before:
    //   (a) Cosine aperture widens 40%-80% with Comfort Zone (was 30%-60%).
    //       At balanced slider, half the pool is in scope.
    //   (b) IMDb >= 7.0 floor only applies if it leaves enough candidates.
    //       When the floor would empty the row, fall back to the unfiltered
    //       under-cosine set — quality matters but not at the cost of "the
    //       row that's the whole reason this exists".
    //   (c) maxPerGenre = 4 (was 2). Variety IS this row's purpose; double-
    //       enforcing strict genre-spread on top of bottom-cosine selection
    //       was producing 1-4 titles where 10 were configured.
    const outsideCount = getComfortZoneRowCount(currentSliders.comfortZone);
    const cosineAperture = 0.40 + currentSliders.comfortZone * 0.40;
    const cosineThreshold = nthSmallest(
      scored.map(c => c.scores.taste),
      Math.max(outsideCount * 4, Math.floor(scored.length * cosineAperture)),
    );

    const underThreshold = scored.filter(c => c.scores.taste <= cosineThreshold);
    const withQualityFloor = underThreshold.filter(c =>
      c.meta.imdb_rating == null || c.meta.imdb_rating >= 7.0
    );
    const outsideCandidates = withQualityFloor.length >= outsideCount
      ? withQualityFloor
      : underThreshold;

    const outsideItems = buildRowFromPool(outsideCandidates, currentSliders, {
      config: {
        limit: outsideCount,
        excludeIds: usedIds,
        maxPerGenre: 4,
      },
      embeddingMap: embeddingMapRef.current,
    });
    setOutsideYourUsual(outsideItems);
  }, []);

  // ── Re-rank with new sliders (uses cached pool) ──
  const rerank = useCallback((newSliders: SliderState) => {
    setSliders(newSliders);
    const pool = poolRef.current;
    if (!pool || pool.matched.length === 0) return;

    const scored = scoreCandidates(pool, newSliders, 'foryou', ctxRef.current);
    // ENG-1: re-apply the avoid penalty on every re-rank — scoring from
    // the cached pool resets finalScore, so the penalty must follow it.
    const penalised = applyAvoidPenalty(
      scored, avoidRef.current, embeddingMapRef.current, AVOID_PENALTY_GAMMA,
    );
    scoredRef.current = penalised;
    buildRows(penalised, newSliders);
  }, [buildRows]);

  // ── Render acquisition via TanStack Query (PLAT-1) ──
  // IN-466 contract unchanged: Edge first, client pipeline on any
  // failure — both inside fetchForYouRender. Key: 'foryou' namespace is
  // NOT in the persistence filter (memory-only); gcTime 15min makes
  // tab-away/tab-back re-apply the cached render instantly with a
  // background refetch (staleTime 0) instead of a skeleton reload.
  // sharedFilters can't live in the key (object identity) — its
  // availability-set size stands in, matching the old load() dep's
  // practical refetch triggers.
  const renderQuery = useQuery({
    queryKey: [
      'foryou', 'render',
      getAuthUserId() ?? 'anon',
      providerStr,
      sharedFilters ? `s${sharedFilters.availableTmdbIds.size}` : 'own',
    ],
    queryFn: () => fetchForYouRender(providerIds, sharedFilters),
    enabled: providerStr.length > 0,
    staleTime: 0,
    gcTime: 15 * 60 * 1000,
  });

  // No services selected → nothing to load (old load()'s early-out).
  useEffect(() => {
    if (!providerStr) setLoading(false);
  }, [providerStr]);

  // Applier: distribute the (possibly cached) render result into the
  // hook's state + refs. Splitting acquisition (queryFn) from
  // application (this effect) is the whole migration — every assignment
  // below matches the pre-Query load() ordering.
  useEffect(() => {
    const result = renderQuery.data;
    if (!result) return;

    ctxRef.current = result.ctx;

    if (result.source === 'edge') {
      const edge = result.edge;
      setSliders(edge.sliders);
      setRecommendedForYou(edge.recommendedForYou);
      setHiddenGems(edge.hiddenGems);
      setOutsideYourUsual(edge.outsideYourUsual);
      setBecauseYouWatched(edge.becauseYouWatched);
      setMoreFromPerson(edge.moreFromPerson);
      setFromYourWatchlist(edge.fromYourWatchlist);
      setPrebuiltAnchorRooms(edge.anchorRooms);
      poolRef.current = edge.pool;
      setPool(edge.pool);
      setLoading(false);

      // PLAT-1 fix (device pass 2): hydrate embeddings + avoid set +
      // seen-set in the BACKGROUND so slider re-ranks on Edge-served
      // sessions run the SAME pipeline as the server render (MMR with
      // cached norms + avoid penalty + novel exploration picks) instead
      // of the degraded genreSpread/no-penalty fallback — that
      // divergence was why titles vanished unexpectedly on drags.
      // Embeddings hit the 24h localStorage cache on warm sessions, so
      // this is usually instant; cold it's a background fetch that
      // upgrades the NEXT drag.
      void (async () => {
        try {
          const scored = scoreCandidates(edge.pool, edge.sliders, 'foryou', result.ctx);
          const [embMap, avoidSet, seenIds] = await Promise.all([
            fetchEmbeddingsForCandidates(scored.slice(0, 200), {
              userId: getAuthUserId(),
              tasteProfilesUpdatedAt: null,
            }),
            fetchAvoidSet(),
            fetchSeenContentIds(),
          ]);
          embeddingMapRef.current = embMap;
          avoidRef.current = avoidSet;
          seenIdsRef.current = seenIds;
        } catch {
          // Hydration is best-effort — re-rank falls back exactly as before.
        }
      })();
      return;
    }

    // Client paths: anchor rooms hook does its own work.
    setPrebuiltAnchorRooms(null);

    if (result.source === 'empty') {
      // No taste vector → user hasn't onboarded; empty-state UI.
      setLoading(false);
      return;
    }

    setSliders(result.sliders);
    filterSetsRef.current = result.filterSets;
    poolRef.current = result.pool;
    setPool(result.pool);
    embeddingMapRef.current = result.embMap;
    avoidRef.current = result.avoidSet;
    seenIdsRef.current = result.seenIds;
    scoredRef.current = result.penalised;

    // Build taste-vector-based rows — show these immediately
    buildRows(result.penalised, result.sliders);
    setLoading(false);

    // ── Background: conditional rows (don't block initial render) ──
    Promise.all([
      fetchBecauseYouWatched(result.filterSets, result.pool),
      fetchMoreFromPerson(result.filterSets),
      fetchFromWatchlist(),
    ]).then(([bywRows, mfpRow, wlItems]) => {
      setBecauseYouWatched(bywRows);
      setMoreFromPerson(mfpRow);
      setFromYourWatchlist(wlItems);
    }).catch(err => {
      console.error('[useForYouContent] Conditional rows error:', err);
    });
  }, [renderQuery.data, buildRows]);

  // Error parity with the old catch block.
  useEffect(() => {
    if (renderQuery.isError) {
      console.error('[useForYouContent] Error:', renderQuery.error);
      setLoading(false);
    }
  }, [renderQuery.isError, renderQuery.error]);

  const { refetch } = renderQuery;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    recommendedForYou,
    hiddenGems,
    outsideYourUsual,
    becauseYouWatched,
    moreFromPerson,
    fromYourWatchlist,
    sliders,
    pool,
    prebuiltAnchorRooms,
    loading,
    reload,
    rerank,
  };
}

// ── Helper: Because You Watched ──

async function fetchBecauseYouWatched(
  filterSets: FilterSets,
  pool: CandidatePool,
): Promise<BecauseYouWatchedRow[]> {
  if (!isSupabaseActive()) return [];
  const userId = getAuthUserId();
  if (!userId) return [];

  try {
    // Fetch positive engagement + thumbs_up events from last 60 days.
    // "Positive engagement" = watchlist_add OR watched (both indicate
    // the user actively engaged with this title, not just browsed it).
    // Note: the event_type is 'watched' (not 'marked_watched') per
    // emitContentInteraction() in interactions.ts.
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const [engagementRes, thumbsRes] = await Promise.all([
      supabase
        .from('user_interactions')
        .select('content_id, media_type, created_at')
        .eq('user_id', userId)
        .in('event_type', ['watchlist_add', 'watched'])
        .gte('created_at', sixtyDaysAgo)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_interactions')
        .select('content_id, media_type')
        .eq('user_id', userId)
        .eq('event_type', 'thumbs_up')
        .gte('created_at', sixtyDaysAgo),
    ]);

    if (!engagementRes.data || !thumbsRes.data) {

      return [];
    }


    // Client-side intersection: titles with positive engagement AND thumbs_up.
    // The schema permits null content_id/media_type for non-content events
    // (slider adjustments, dismiss-by-cluster, etc.); filter those out before
    // building the key so we never produce a "null-X" pseudo-id.
    const isContentEvent = <T extends { content_id: number | null; media_type: string | null }>(
      r: T,
    ): r is T & { content_id: number; media_type: 'movie' | 'tv' } =>
      r.content_id != null && (r.media_type === 'movie' || r.media_type === 'tv');

    const thumbsUpSet = new Set(
      thumbsRes.data.filter(isContentEvent).map((r) => `${r.media_type}-${r.content_id}`)
    );
    // Deduplicate by content key (a title may have both watchlist_add and watched)
    const seen = new Set<string>();
    const qualifying = engagementRes.data
      .filter(isContentEvent)
      .filter((r) => {
        const key = `${r.media_type}-${r.content_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return thumbsUpSet.has(key);
      })
      .slice(0, 2); // Top 2 most recent


    if (qualifying.length === 0) {

      return [];
    }

    // For each anchor, fetch neighbours
    // Fetch all anchors in parallel (each does embedding lookup + RPC)
    const rowResults = await Promise.all(
      qualifying.map(async (anchor) => {
        const anchorKey = `${anchor.media_type}-${anchor.content_id}`;
        let anchorMeta = pool.metadata.get(anchorKey);

        // Anchor may be excluded from pool (watchlist hard filter). Fetch from titles table.
        if (!anchorMeta) {
          const { data: anchorRows } = await supabase
            .from('titles')
            .select(EXTENDED_TITLE_SELECT)
            .eq('tmdb_id', anchor.content_id)
            .eq('media_type', anchor.media_type)
            .limit(1);
          if (anchorRows && anchorRows.length > 0) {
            anchorMeta = anchorRows[0] as unknown as ExtendedTitleRow;
          }
        }

        const anchorItem: ContentItem = anchorMeta
          ? titleRowToContentItem(anchorMeta)
          : { id: anchorKey, title: `Title ${anchor.content_id}`, image: '', services: [] };

        const { items: neighbours } = await buildAnchoredRoom({
          anchorTmdbId: anchor.content_id,
          anchorMediaType: anchor.media_type,
          filterSets,
          limit: 12,
          matchLimit: 60,
          excludeWatchlist: true,
        });

        return neighbours.length > 0 ? { anchor: anchorItem, items: neighbours } : null;
      }),
    );

    return rowResults.filter((r): r is BecauseYouWatchedRow => r !== null);
  } catch (error) {
    console.error('[ForYou] Because You Watched error:', error);
    return [];
  }
}

// ── Helper: More From [Director/Actor] ──

async function fetchMoreFromPerson(
  filterSets: FilterSets,
): Promise<MoreFromPersonRow | null> {
  if (!isSupabaseActive()) return null;
  const userId = getAuthUserId();
  if (!userId) return null;

  try {
    // Get user's thumbs_up titles
    const { data: thumbsData } = await supabase
      .from('user_interactions')
      .select('content_id, media_type')
      .eq('user_id', userId)
      .eq('event_type', 'thumbs_up');

    if (!thumbsData || thumbsData.length < 2) return null;

    const thumbsIds = thumbsData
      .map((r) => r.content_id)
      .filter((id): id is number => id != null);

    // Fetch director/cast for these titles
    const { data: titleData } = await supabase
      .from('titles')
      .select('tmdb_id, media_type, director, cast_top_5')
      .in('tmdb_id', thumbsIds);

    if (!titleData || titleData.length === 0) return null;

    const titles = titleData;

    // Determine media type distribution for director vs actor preference
    const movieCount = titles.filter((t) => t.media_type === 'movie').length;
    const preferDirector = movieCount >= titles.length * 0.6;

    // Count person occurrences
    const personCounts = new Map<string, { count: number; type: 'director' | 'actor' }>();

    if (preferDirector) {
      for (const t of titles) {
        if (t.director) {
          const current = personCounts.get(t.director);
          personCounts.set(t.director, {
            count: (current?.count ?? 0) + 1,
            type: 'director',
          });
        }
      }
    }

    // Also check actors (always, as fallback if no director qualifies)
    for (const t of titles) {
      const cast = t.cast_top_5 as string[] | null;
      if (!cast) continue;
      for (const actor of cast.slice(0, 3)) {
        const current = personCounts.get(actor);
        if (!current || current.count < 2) {
          personCounts.set(actor, {
            count: (current?.count ?? 0) + 1,
            type: 'actor',
          });
        }
      }
    }

    // Find person with >= 2 qualifying signals
    let bestPerson: { name: string; type: 'director' | 'actor'; count: number } | null = null;
    for (const [name, { count, type }] of personCounts) {
      if (count >= 2 && (!bestPerson || count > bestPerson.count)) {
        bestPerson = { name, type, count };
      }
    }

    if (!bestPerson) return null;

    // Query their other work
    let query = supabase
      .from('titles')
      .select(EXTENDED_TITLE_SELECT);

    if (bestPerson.type === 'director') {
      query = query.eq('director', bestPerson.name);
    } else {
      query = query.contains('cast_top_5', [bestPerson.name]);
    }

    const { data: personTitles } = await query.limit(30);
    if (!personTitles || personTitles.length === 0) return null;

    // Filter by availability and exclude watched
    const items: ContentItem[] = [];
    for (const row of personTitles) {
      const typed = row as unknown as ExtendedTitleRow;
      if (filterSets.availableTmdbIds.size > 0 && !filterSets.availableTmdbIds.has(typed.tmdb_id)) continue;
      const key = `${typed.media_type}-${typed.tmdb_id}`;
      if (filterSets.dismissedIds.has(key)) continue;
      items.push(titleRowToContentItem(typed));
      if (items.length >= 15) break;
    }

    if (items.length < 5) return null; // Not enough to show the row

    return { personName: bestPerson.name, personType: bestPerson.type, items };
  } catch (error) {
    console.error('[ForYou] More From Person error:', error);
    return null;
  }
}

// ── Helper: From Your Watchlist ──

async function fetchFromWatchlist(): Promise<ContentItem[]> {
  try {
    const watchlist = await getWatchlist();
    if (!watchlist.items || watchlist.items.length === 0) return [];

    // Check which watchlist items are marked as watched
    const userId = getAuthUserId();
    const watchedSet = new Set<string>();

    if (userId && isSupabaseActive()) {
      const { data } = await supabase
        .from('user_interactions')
        .select('content_id, media_type')
        .eq('user_id', userId)
        .eq('event_type', 'watched')
        .limit(500);

      if (data) {
        for (const row of data) {
          watchedSet.add(`${row.media_type}-${row.content_id}`);
        }
      }
    }

    // Filter out watched items, return most recently added first
    const unwatched = watchlist.items
      .filter(item => {
        const contentKey = `${item.type}-${item.id}`;
        return !watchedSet.has(contentKey) && item.status !== 'watched';
      })
      .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      .slice(0, 15)
      .map(item => watchlistItemToContentItem(item));

    return unwatched;
  } catch (error) {
    console.error('[ForYou] Watchlist error:', error);
    return [];
  }
}

// ── Utility ──

/** Get the nth smallest value from an array without full sort (O(n) average via quickselect) */
function nthSmallest(arr: number[], n: number): number {
  if (arr.length === 0) return 0;
  const idx = Math.max(0, Math.min(n, arr.length - 1));
  // Simple approach: partial sort is sufficient for our sizes (~100 candidates)
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[idx];
}
