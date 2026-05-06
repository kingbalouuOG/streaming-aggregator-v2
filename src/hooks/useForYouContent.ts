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
import { fetchCandidatePool, scoreCandidates, buildRowFromPool } from '@/lib/recommendations-v2/ranker';
import { buildAnchoredRoom } from '@/lib/recommendations-v2/anchoredRoom';
import { buildFilterSets, type FilterSets } from '@/lib/recommendations-v2/hardFilters';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import { getSliderState } from '@/lib/taste-v2/tasteProfileV2';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { supabase } from '@/lib/supabase';
import { getAuthUserId, isSupabaseActive } from '@/lib/storage';
import { getWatchlist } from '@/lib/storage/watchlist';
import { getComfortZoneRowCount, HIDDEN_GEMS_FILTERS } from '@/lib/recommendations-v2/weights';
import { titleRowToContentItem } from '@/lib/recommendations-v2/titleAdapter';
import { watchlistItemToContentItem } from '@/lib/adapters/contentAdapter';
import { tryRenderForYouEdge } from '@/lib/recommendations-v2/edgeRender';
import type { AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';
import type { ContentItem } from '@/components/ContentCard';
import type { SliderState } from '@/lib/taste-v2/types';
import type { CandidatePool, ScoredCandidate, ExtendedTitleRow } from '@/lib/recommendations-v2/types';
import { EXTENDED_TITLE_SELECT } from '@/lib/recommendations-v2/types';

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
  const providerStr = providerIds.join(',');

  // ── Build rows from scored candidates ──
  const buildRows = useCallback((scored: ScoredCandidate[], currentSliders: SliderState) => {
    const usedIds = new Set<string>();

    // 1. Recommended For You: top 20 after diversity
    const recItems = buildRowFromPool(scored, currentSliders, { limit: 20, excludeIds: usedIds });
    recItems.forEach(item => usedIds.add(item.id));
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
    const gemItems = buildRowFromPool(gemCandidates, currentSliders, { limit: 15, excludeIds: usedIds });
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
      limit: outsideCount,
      excludeIds: usedIds,
      maxPerGenre: 4,
    });
    setOutsideYourUsual(outsideItems);
  }, []);

  // ── Re-rank with new sliders (uses cached pool) ──
  const rerank = useCallback((newSliders: SliderState) => {
    setSliders(newSliders);
    const pool = poolRef.current;
    if (!pool || pool.matched.length === 0) return;

    const scored = scoreCandidates(pool, newSliders, 'foryou');
    scoredRef.current = scored;
    buildRows(scored, newSliders);
  }, [buildRows]);

  // ── Main load function ──
  // IN-466: try the render-foryou-rows Edge Function first. On any failure
  // (timeout > 1.5s, 5xx, malformed JSON), fall through to the existing
  // client-side pipeline. The fallback contract is the resilience layer
  // that makes shipping the Edge path safe.
  const load = useCallback(async () => {
    if (!providerStr) { setLoading(false); return; }
    setLoading(true);

    // ── Edge path ──
    const edge = await tryRenderForYouEdge(providerIds);
    if (edge) {
      const anchorMax = edge.perAnchorLatencyMs.length > 0 ? Math.max(...edge.perAnchorLatencyMs) : 0;
      console.log(
        `[useForYouContent] edge: wall=${edge.wallclockMs}ms server=${edge.renderMs}ms `
        + `anchorMax=${anchorMax}ms rec=${edge.recommendedForYou.length} `
        + `gems=${edge.hiddenGems.length} outside=${edge.outsideYourUsual.length} `
        + `byw=${edge.becauseYouWatched.length} mfp=${edge.moreFromPerson ? 1 : 0} `
        + `wl=${edge.fromYourWatchlist.length} rooms=${edge.anchorRooms.length}`,
      );
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
      return;
    }

    // ── Client fallback path ──
    // Anchor rooms hook needs to do its own work since the edge didn't
    // pre-build them.
    setPrebuiltAnchorRooms(null);

    try {
      // Fetch taste profile + slider state in parallel
      const [profile, sliderState] = await Promise.all([
        getV2TasteProfile(),
        getSliderState(),
      ]);

      if (!profile?.tasteVector) {
        setLoading(false);
        return;
      }

      setSliders(sliderState);

      // Build filter sets (reuse from Home if available)
      let filterSets: FilterSets;
      if (sharedFilters) {
        filterSets = sharedFilters;
      } else {
        const serviceIds = providerIds
          .map(id => providerIdToServiceId(id))
          .filter(Boolean) as string[];
        filterSets = await buildFilterSets(serviceIds);
      }
      filterSetsRef.current = filterSets;

      // ── Pipeline: fetch shared pool + score candidates ──
      const pool = await fetchCandidatePool({
        tasteVector: profile.tasteVector,
        filterSets,
        sliders: sliderState,
        surface: 'foryou',
      });
      poolRef.current = pool;
      setPool(pool);

      const scored = scoreCandidates(pool, sliderState, 'foryou');
      scoredRef.current = scored;

      // Build taste-vector-based rows — show these immediately
      buildRows(scored, sliderState);
      setLoading(false);

      // ── Background: fetch conditional rows (don't block initial render) ──
      Promise.all([
        fetchBecauseYouWatched(filterSets, pool),
        fetchMoreFromPerson(filterSets),
        fetchFromWatchlist(),
      ]).then(([bywRows, mfpRow, wlItems]) => {
        setBecauseYouWatched(bywRows);
        setMoreFromPerson(mfpRow);
        setFromYourWatchlist(wlItems);
      }).catch(err => {
        console.error('[useForYouContent] Conditional rows error:', err);
      });
    } catch (error) {
      console.error('[useForYouContent] Error:', error);
      setLoading(false);
    }
  }, [providerStr, sharedFilters, buildRows]);

  useEffect(() => { load(); }, [load]);

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
    reload: load,
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
        .from('user_interactions' as any)
        .select('content_id, media_type, created_at')
        .eq('user_id', userId)
        .in('event_type', ['watchlist_add', 'watched'])
        .gte('created_at', sixtyDaysAgo)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_interactions' as any)
        .select('content_id, media_type')
        .eq('user_id', userId)
        .eq('event_type', 'thumbs_up')
        .gte('created_at', sixtyDaysAgo),
    ]);

    if (!engagementRes.data || !thumbsRes.data) {

      return [];
    }


    // Client-side intersection: titles with positive engagement AND thumbs_up
    const thumbsUpSet = new Set(
      (thumbsRes.data as any[]).map((r: any) => `${r.media_type}-${r.content_id}`)
    );
    // Deduplicate by content key (a title may have both watchlist_add and watched)
    const seen = new Set<string>();
    const qualifying = (engagementRes.data as any[])
      .filter((r: any) => {
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
      qualifying.map(async (anchor: any) => {
        const anchorKey = `${anchor.media_type}-${anchor.content_id}`;
        let anchorMeta = pool.metadata.get(anchorKey);

        // Anchor may be excluded from pool (watchlist hard filter). Fetch from titles table.
        if (!anchorMeta) {
          const { data: anchorRows } = await supabase
            .from('titles' as any)
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
      .from('user_interactions' as any)
      .select('content_id, media_type')
      .eq('user_id', userId)
      .eq('event_type', 'thumbs_up');

    if (!thumbsData || thumbsData.length < 2) return null;

    const thumbsIds = (thumbsData as any[]).map((r: any) => r.content_id as number);

    // Fetch director/cast for these titles
    const { data: titleData } = await supabase
      .from('titles' as any)
      .select('tmdb_id, media_type, director, cast_top_5')
      .in('tmdb_id', thumbsIds);

    if (!titleData || titleData.length === 0) return null;

    const titles = titleData as any[];

    // Determine media type distribution for director vs actor preference
    const movieCount = titles.filter((t: any) => t.media_type === 'movie').length;
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
      .from('titles' as any)
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
    for (const row of personTitles as any[]) {
      const typed = row as ExtendedTitleRow;
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
        .from('user_interactions' as any)
        .select('content_id, media_type')
        .eq('user_id', userId)
        .eq('event_type', 'watched')
        .limit(500);

      if (data) {
        for (const row of data as any[]) {
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
