/**
 * Server-side For You render — PLAT-3 (E&P brief §7).
 *
 * The orchestration that lived in supabase/functions/render-foryou-rows/
 * index.ts (IN-466), ported into the engine tree so it is typechecked,
 * linted and tested with everything else, and so the videx-api Worker
 * route is a thin transport adapter (auth + query parsing + caching)
 * around `renderForYou()`.
 *
 * Replaces the client's ~5-8 sequential Supabase calls (taste profile +
 * filter sets ×4 + candidate pool RPC + extended metadata + anchor
 * selection ×5 + per-anchor room generation ×5) with one server pass
 * that returns the full For You first-viewport payload INCLUDING the
 * scored pool, so client-side slider drags re-rank instantly with no
 * refetch (brief §7.2-2 — the part of the old design explicitly kept).
 *
 * Every user-owned read goes through `scope.select(...)` — the
 * defence-in-depth contract for service-role access (see
 * ./userScope.ts). Tables without user_id use the raw client.
 *
 * Wire-compatibility: the payload shape is byte-compatible with the
 * Edge function's ResponsePayload, so the client cutover (W4) is a URL
 * + transport change, not a contract change.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserScope } from './userScope';
import {
  buildFilterSetsScoped,
  type FilterSets,
} from '../recommendations-v2/hardFilters';
import {
  fetchCandidatePoolScoped,
  scoreCandidates,
  buildRowFromPool,
} from '../recommendations-v2/ranker';
import { buildAnchoredRoomScoped } from '../recommendations-v2/anchoredRoom';
import {
  selectAnchors,
  type SelectedAnchor,
} from '../recommendations-v2/anchorSelection';
import { titleRowToContentItem } from '../recommendations-v2/titleAdapter';
import {
  getComfortZoneRowCount,
  HIDDEN_GEMS_FILTERS,
  AVOID_PENALTY_GAMMA,
  EXPLORATION_COUNT,
  EXPLORATION_SLOT_POSITIONS,
  EXPLORATION_BAND,
  scoreToMatchPercentage,
} from '../recommendations-v2/weights';
import { fetchAvoidSetScoped, applyAvoidPenalty } from '../recommendations-v2/avoidSet';
import {
  fetchSeenContentIdsScoped,
  selectExplorationCandidates,
  spliceAtPositions,
  explorationDayStamp,
} from '../recommendations-v2/exploration';
import {
  EXTENDED_TITLE_SELECT,
  type CandidatePool,
  type ContentItem,
  type ExtendedTitleRow,
  type PipelineContext,
  type ScoredCandidate,
  type ViewingContext,
} from '../recommendations-v2/types';
import {
  getV2TasteProfileScoped,
  getInterestCentroidsScoped,
} from '../taste-v2/tasteProfileV2';
import { DEFAULT_SLIDERS, type SliderState, type TasteProfileV2 } from '../taste-v2/types';
import {
  buildEmbeddingCacheKey,
  computeNorm,
  type EmbeddingMap,
} from '../recommendations-v2/embeddingCache';

// Per-isolate embedding cache (IN-PX-22 server half). Key = same shape
// as the client (userId + taste_profiles.updated_at). Module-scoped so
// requests served by the same warm Worker isolate reuse the load; an
// isolate recycle zeroes it. No TTL — the key's updated_at component is
// the invalidation.
const EMBEDDING_CACHE = new Map<string, EmbeddingMap>();

// ── Wire contract (byte-compatible with the Edge function) ───────────

export interface RenderForYouInput {
  /** Videx service ids, already validated by the transport layer. */
  services: string[];
  /** Client-local hour 0–23 (Phase 5 decision 9). UTC fallback if absent. */
  hourOfDay?: number;
  /** Client-local day 0=Sun…6=Sat, paired with hourOfDay. */
  dayOfWeek?: number;
  /** Raw User-Agent header for device-platform inference. */
  userAgent?: string | null;
  /**
   * PLAT-3 W3: pre-fetched taste profile. The Worker reads the profile
   * BEFORE the render to build its KV cache key (updated_at +
   * sliderHash); passing it here avoids a duplicate Supabase read on
   * cache misses. Omit (undefined) to let the render fetch it; null
   * means "fetched, no profile row".
   */
  profile?: TasteProfileV2 | null;
}

export interface BecauseYouWatchedRow {
  anchor: ContentItem;
  items: ContentItem[];
}

export interface MoreFromPersonRow {
  personName: string;
  personType: 'director' | 'actor';
  items: ContentItem[];
}

export interface AnchorRoomPreview {
  id: string;
  anchor: SelectedAnchor;
  anchorTitle: string;
  anchorYear: number | null;
  anchorMediaType: 'movie' | 'tv';
  thumbnails: ContentItem[];
  titleCount: number;
  llmLabel: { label: string; description: string | null } | null;
  topTitlesForLabel: { title: string; year: number | null }[];
}

export interface ForYouPayload {
  recommendedForYou: ContentItem[];
  hiddenGems: ContentItem[];
  outsideYourUsual: ContentItem[];
  becauseYouWatched: BecauseYouWatchedRow[];
  moreFromPerson: MoreFromPersonRow | null;
  fromYourWatchlist: ContentItem[];
  anchorRooms: AnchorRoomPreview[];
  perAnchorLatencyMs: number[];
  sliders: SliderState;
  pool: {
    matched: CandidatePool['matched'];
    /** Map → Record at the wire boundary (Map serialises to "{}"). */
    metadata: Record<string, ExtendedTitleRow>;
    fetchedAt: number;
    /** ENG-1: true when the multi-interest path built this pool. */
    interleaved?: boolean;
  };
  renderMs: number;
}

// ── Entry point ──────────────────────────────────────────────────────

export async function renderForYou(
  client: SupabaseClient,
  scope: UserScope,
  input: RenderForYouInput,
): Promise<ForYouPayload> {
  const t_start = Date.now();
  const userId = scope.userId;

  const profile = input.profile !== undefined
    ? input.profile
    : await getV2TasteProfileScoped(scope);
  if (!profile?.tasteVector) {
    // No taste vector → user hasn't completed onboarding. Empty payload;
    // the client shows its empty-state UI.
    return emptyPayload(profile?.sliders ?? null, t_start);
  }

  // ENG-1: interest centroids fetched in parallel with filter sets —
  // 3-row PK scan, no latency cost on the critical path.
  const [filterSets, interestCentroids] = await Promise.all([
    buildFilterSetsScoped(client, scope, input.services),
    getInterestCentroidsScoped(scope),
  ]);

  const ctx = await buildServerPipelineContext(client, userId, input);

  const pool = await fetchCandidatePoolScoped(client, {
    tasteVector: profile.tasteVector,
    filterSets,
    sliders: profile.sliders,
    surface: 'foryou',
    interests: interestCentroids.length > 0
      ? interestCentroids.map((c) => ({ centroid: c.centroid, weight: c.weight, slot: c.slot }))
      : undefined,
  });

  const scored = scoreCandidates(pool, profile.sliders, 'foryou', ctx);

  // Top-200 embeddings for MMR + the avoid set + the exploration seen
  // set, all in one parallel network window (ENG-1 contract).
  const [embeddingMap, avoidSet, seenIds] = await Promise.all([
    fetchEmbeddingsForCandidates(client, scored.slice(0, 200), {
      userId,
      tasteProfilesUpdatedAt: profile.updatedAt,
    }),
    fetchAvoidSetScoped(scope, client),
    fetchSeenContentIdsScoped(scope),
  ]);

  // ENG-1 Workstream B: avoid-set penalty after the embedding fetch,
  // before row building — same contract as the client pipeline.
  const ranked = applyAvoidPenalty(scored, avoidSet, embeddingMap, AVOID_PENALTY_GAMMA);

  // Taste-vector rows. usedIds is shared across rec/gems/outside for
  // cross-row dedup — same contract as src/hooks/useForYouContent.ts.
  const usedIds = new Set<string>();

  // ENG-1 Workstream C: exploration picks reserved ahead of the base
  // row build (same selection + daily UTC seed as the client pipeline).
  const explorationPicks = selectExplorationCandidates(ranked, {
    seenContentIds: seenIds,
    excludeKeys: usedIds,
    count: EXPLORATION_COUNT,
    band: EXPLORATION_BAND,
    seed: `${userId}:${explorationDayStamp()}`,
  });
  explorationPicks.forEach((c) => usedIds.add(c.contentKey));

  const recBase = buildRowFromPool(ranked, profile.sliders, {
    config: { limit: 20 - explorationPicks.length, excludeIds: usedIds },
    embeddingMap,
  });
  recBase.forEach((item) => usedIds.add(item.id));

  const explorationItems = explorationPicks.map((c) => ({
    ...titleRowToContentItem(c.meta, scoreToMatchPercentage(c.finalScore)),
    exploration: true,
  }));
  const recommendedForYou = spliceAtPositions(recBase, explorationItems, EXPLORATION_SLOT_POSITIONS);

  const gemCandidates = ranked.filter((c) => {
    const pop = c.meta.popularity ?? 0;
    const votes = c.meta.vote_count ?? 0;
    const avg = c.meta.vote_average ?? 0;
    return (
      pop >= HIDDEN_GEMS_FILTERS.minPopularity
      && pop <= HIDDEN_GEMS_FILTERS.maxPopularity
      && votes >= HIDDEN_GEMS_FILTERS.minVoteCount
      && avg >= HIDDEN_GEMS_FILTERS.minVoteAverage
    );
  });
  const hiddenGems = buildRowFromPool(gemCandidates, profile.sliders, {
    config: { limit: 15, excludeIds: usedIds },
    embeddingMap,
  });
  hiddenGems.forEach((item) => usedIds.add(item.id));

  const outsideYourUsual = buildOutsideYourUsual(ranked, profile.sliders, usedIds, embeddingMap);

  // Conditional rows + anchor rooms run in parallel — they share the
  // pool + filter sets but otherwise touch different RPC paths, so
  // network parallelism here is the main latency win vs the client.
  const [becauseYouWatched, moreFromPerson, fromYourWatchlist, anchorRoomsResult] = await Promise.all([
    fetchBecauseYouWatched(client, scope, filterSets, pool),
    fetchMoreFromPerson(client, scope, filterSets),
    fetchFromWatchlist(scope),
    buildAnchorRooms(
      client, scope, profile.tasteVector, profile.sliders,
      profile.selectedClusters, profile.interactionCount, filterSets, pool,
    ),
  ]);

  return {
    recommendedForYou,
    hiddenGems,
    outsideYourUsual,
    becauseYouWatched,
    moreFromPerson,
    fromYourWatchlist,
    anchorRooms: anchorRoomsResult.rooms,
    perAnchorLatencyMs: anchorRoomsResult.latencyMs,
    sliders: profile.sliders,
    pool: {
      matched: pool.matched,
      metadata: Object.fromEntries(pool.metadata),
      fetchedAt: pool.fetchedAt,
      interleaved: pool.interleaved,
    },
    renderMs: Date.now() - t_start,
  };
}

// ── Outside Your Usual ───────────────────────────────────────────────
// Mirrors the client's buildRows() for this row exactly. See the long
// comment block in src/hooks/useForYouContent.ts for the three-knob
// rationale (cosine aperture / IMDb floor / maxPerGenre 4).

function buildOutsideYourUsual(
  scored: ScoredCandidate[],
  sliders: SliderState,
  usedIds: Set<string>,
  embeddingMap: EmbeddingMap,
): ContentItem[] {
  const outsideCount = getComfortZoneRowCount(sliders.comfortZone);
  const cosineAperture = 0.40 + sliders.comfortZone * 0.40;
  const cosineThreshold = nthSmallest(
    scored.map((c) => c.scores.taste),
    Math.max(outsideCount * 4, Math.floor(scored.length * cosineAperture)),
  );

  const underThreshold = scored.filter((c) => c.scores.taste <= cosineThreshold);
  const withQualityFloor = underThreshold.filter((c) =>
    c.meta.imdb_rating == null || c.meta.imdb_rating >= 7.0,
  );
  const outsideCandidates = withQualityFloor.length >= outsideCount
    ? withQualityFloor
    : underThreshold;

  return buildRowFromPool(outsideCandidates, sliders, {
    config: {
      limit: outsideCount,
      excludeIds: usedIds,
      maxPerGenre: 4,
    },
    embeddingMap,
  });
}

function nthSmallest(arr: number[], n: number): number {
  if (arr.length === 0) return 0;
  const idx = Math.max(0, Math.min(n, arr.length - 1));
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[idx];
}

// ── MMR support: embedding fetch with per-isolate cache ──────────────

async function fetchEmbeddingsForCandidates(
  client: SupabaseClient,
  candidates: ScoredCandidate[],
  cacheContext: { userId: string; tasteProfilesUpdatedAt: string | null },
): Promise<EmbeddingMap> {
  if (candidates.length === 0) return new Map();

  const cacheKey = buildEmbeddingCacheKey(
    cacheContext.userId,
    cacheContext.tasteProfilesUpdatedAt,
  );
  const map: EmbeddingMap = EMBEDDING_CACHE.get(cacheKey) ?? new Map();

  const needed: number[] = [];
  for (const c of candidates) {
    if (!map.has(c.contentKey)) needed.push(c.tmdbId);
  }
  if (needed.length === 0) {
    EMBEDDING_CACHE.set(cacheKey, map);
    return map;
  }
  const tmdbIds = [...new Set(needed)];

  try {
    const { data, error } = await client
      .from('titles')
      .select('tmdb_id, media_type, embedding')
      .in('tmdb_id', tmdbIds);
    if (error || !data) {
      EMBEDDING_CACHE.set(cacheKey, map);
      return map;
    }
    for (const row of data as Array<{ tmdb_id: number; media_type: string; embedding: string | number[] | null }>) {
      if (row.embedding == null) continue;
      const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      if (Array.isArray(emb) && emb.length > 0) {
        const vec = new Float32Array(emb);
        map.set(`${row.media_type}-${row.tmdb_id}`, { vec, norm: computeNorm(vec) });
      }
    }
  } catch {
    // Network or parse error → return whatever we have.
  }
  EMBEDDING_CACHE.set(cacheKey, map);
  return map;
}

// ── PipelineContext builder ──────────────────────────────────────────
// hourOfDay / dayOfWeek prefer the input fields (client local time,
// Phase 5 decision 9); UTC fallback. devicePlatform from User-Agent.
// viewingContext from the profiles row.

function inferDevicePlatformFromUserAgent(
  ua: string | null | undefined,
): 'android' | 'ios' | 'web' | undefined {
  if (!ua) return undefined;
  const lower = ua.toLowerCase();
  if (lower.includes('android')) return 'android';
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ipod')) {
    return 'ios';
  }
  return 'web';
}

const VIEWING_CONTEXT_VALUES: readonly ViewingContext[] = [
  'solo', 'with_partner', 'with_family', 'with_friends',
  'wind_down', 'background', 'focused',
];

function narrowViewingContext(raw: unknown): ViewingContext | null {
  if (typeof raw !== 'string') return null;
  return (VIEWING_CONTEXT_VALUES as readonly string[]).includes(raw)
    ? (raw as ViewingContext)
    : null;
}

async function buildServerPipelineContext(
  client: SupabaseClient,
  userId: string,
  input: RenderForYouInput,
): Promise<PipelineContext> {
  const ctx: PipelineContext = {};

  const now = new Date();
  ctx.hourOfDay = input.hourOfDay ?? now.getUTCHours();
  ctx.dayOfWeek = input.dayOfWeek ?? now.getUTCDay();

  const platform = inferDevicePlatformFromUserAgent(input.userAgent);
  if (platform) ctx.devicePlatform = platform;

  // profiles is keyed on `id`, not `user_id`, so the UserScope helper
  // doesn't fit — explicit .eq('id', userId) on the raw client.
  try {
    const { data } = await client
      .from('profiles')
      .select('viewing_context')
      .eq('id', userId)
      .maybeSingle();
    const vc = (data as { viewing_context?: string | null } | null)?.viewing_context;
    const narrowed = narrowViewingContext(vc);
    if (narrowed) ctx.viewingContext = narrowed;
  } catch {
    // Leave unset — scorer falls back to neutral.
  }

  return ctx;
}

// ── Because You Watched ──────────────────────────────────────────────

interface InteractionRow {
  content_id: number | null;
  media_type: string | null;
  created_at?: string | null;
}

async function fetchBecauseYouWatched(
  client: SupabaseClient,
  scope: UserScope,
  filterSets: FilterSets,
  pool: CandidatePool,
): Promise<BecauseYouWatchedRow[]> {
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const [engagementRes, thumbsRes] = await Promise.all([
      scope
        .select('user_interactions', 'content_id, media_type, created_at')
        .in('event_type', ['watchlist_add', 'watched'])
        .gte('created_at', sixtyDaysAgo)
        .order('created_at', { ascending: false }),
      scope
        .select('user_interactions', 'content_id, media_type')
        .eq('event_type', 'thumbs_up')
        .gte('created_at', sixtyDaysAgo),
    ]);

    const engagement = engagementRes.data as InteractionRow[] | null;
    const thumbs = thumbsRes.data as InteractionRow[] | null;
    if (!engagement || !thumbs) return [];

    const thumbsUpSet = new Set(thumbs.map((r) => `${r.media_type}-${r.content_id}`));
    const seen = new Set<string>();
    const qualifying = engagement
      .filter((r) => {
        const key = `${r.media_type}-${r.content_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return thumbsUpSet.has(key);
      })
      .slice(0, 2);

    if (qualifying.length === 0) return [];

    const rowResults = await Promise.all(
      qualifying.map(async (anchor) => {
        if (anchor.content_id == null || (anchor.media_type !== 'movie' && anchor.media_type !== 'tv')) {
          return null;
        }
        const anchorKey = `${anchor.media_type}-${anchor.content_id}`;
        let anchorMeta = pool.metadata.get(anchorKey);

        if (!anchorMeta) {
          const { data: anchorRows } = await client
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

        const { items: neighbours } = await buildAnchoredRoomScoped(client, {
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
    console.error('[ForYou] BecauseYouWatched error:', error);
    return [];
  }
}

// ── More From Person ─────────────────────────────────────────────────

interface PersonTitleRow {
  tmdb_id: number;
  media_type: string;
  director: string | null;
  cast_top_5: string[] | null;
}

async function fetchMoreFromPerson(
  client: SupabaseClient,
  scope: UserScope,
  filterSets: FilterSets,
): Promise<MoreFromPersonRow | null> {
  try {
    const { data } = await scope
      .select('user_interactions', 'content_id, media_type')
      .eq('event_type', 'thumbs_up');

    const thumbsData = data as InteractionRow[] | null;
    if (!thumbsData || thumbsData.length < 2) return null;

    const thumbsIds = thumbsData
      .map((r) => r.content_id)
      .filter((id): id is number => id != null);

    const { data: titleData } = await client
      .from('titles')
      .select('tmdb_id, media_type, director, cast_top_5')
      .in('tmdb_id', thumbsIds);

    if (!titleData || titleData.length === 0) return null;

    const titles = titleData as unknown as PersonTitleRow[];

    const movieCount = titles.filter((t) => t.media_type === 'movie').length;
    const preferDirector = movieCount >= titles.length * 0.6;

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

    for (const t of titles) {
      const cast = t.cast_top_5;
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

    let bestPerson: { name: string; type: 'director' | 'actor'; count: number } | null = null;
    for (const [name, { count, type }] of personCounts) {
      if (count >= 2 && (!bestPerson || count > bestPerson.count)) {
        bestPerson = { name, type, count };
      }
    }
    if (!bestPerson) return null;

    let query = client
      .from('titles')
      .select(EXTENDED_TITLE_SELECT);

    if (bestPerson.type === 'director') {
      query = query.eq('director', bestPerson.name);
    } else {
      query = query.contains('cast_top_5', [bestPerson.name]);
    }

    const { data: personTitles } = await query.limit(30);
    if (!personTitles || personTitles.length === 0) return null;

    const items: ContentItem[] = [];
    for (const row of personTitles) {
      const typed = row as unknown as ExtendedTitleRow;
      if (filterSets.availableTmdbIds.size > 0 && !filterSets.availableTmdbIds.has(typed.tmdb_id)) continue;
      const key = `${typed.media_type}-${typed.tmdb_id}`;
      if (filterSets.dismissedIds.has(key)) continue;
      items.push(titleRowToContentItem(typed));
      if (items.length >= 15) break;
    }

    if (items.length < 5) return null;

    return { personName: bestPerson.name, personType: bestPerson.type, items };
  } catch (error) {
    console.error('[ForYou] MoreFromPerson error:', error);
    return null;
  }
}

// ── From Your Watchlist ──────────────────────────────────────────────
// Reads the watchlist TABLE (the client fallback reads localStorage).
// Joined with user_interactions to drop already-watched items.

interface WatchlistRow {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  added_at: string | null;
  status: string | null;
  title: string | null;
  poster_path: string | null;
  genre_ids: number[] | null;
}

async function fetchFromWatchlist(scope: UserScope): Promise<ContentItem[]> {
  try {
    const [wlRes, watchedRes] = await Promise.all([
      scope.select('watchlist', 'tmdb_id, media_type, added_at, status, title, poster_path, genre_ids'),
      scope.select('user_interactions', 'content_id, media_type')
        .eq('event_type', 'watched')
        .limit(500),
    ]);

    const wlData = wlRes.data as WatchlistRow[] | null;
    if (!wlData) return [];

    const watchedSet = new Set<string>();
    const watchedData = watchedRes.data as InteractionRow[] | null;
    if (watchedData) {
      for (const row of watchedData) {
        watchedSet.add(`${row.media_type}-${row.content_id}`);
      }
    }

    const sorted = wlData
      .filter((item) => {
        const key = `${item.media_type}-${item.tmdb_id}`;
        return !watchedSet.has(key) && item.status !== 'watched';
      })
      .sort((a, b) => {
        const ta = new Date(a.added_at ?? 0).getTime();
        const tb = new Date(b.added_at ?? 0).getTime();
        return tb - ta;
      })
      .slice(0, 15);

    return sorted.map((item) => ({
      id: `${item.media_type}-${item.tmdb_id}`,
      title: item.title ?? `Title ${item.tmdb_id}`,
      image: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : '',
      services: [],
      type: item.media_type,
      genreIds: item.genre_ids ?? undefined,
    }));
  } catch (error) {
    console.error('[ForYou] Watchlist error:', error);
    return [];
  }
}

// ── Anchor mood rooms ────────────────────────────────────────────────

async function buildAnchorRooms(
  client: SupabaseClient,
  scope: UserScope,
  tasteVector: number[],
  sliders: SliderState,
  selectedClusters: string[],
  interactionCount: number,
  filterSets: FilterSets,
  pool: CandidatePool,
): Promise<{ rooms: AnchorRoomPreview[]; latencyMs: number[] }> {
  try {
    if (filterSets.availableTmdbIds.size === 0) {
      return { rooms: [], latencyMs: [] };
    }

    const selection = await selectAnchors({
      userId: scope.userId,
      scope,
      client,
      tasteVector,
      selectedClusterIds: selectedClusters,
      interactionCount,
      pool,
      sliders,
    });

    const anchors = selection.anchors;
    if (anchors.length === 0) return { rooms: [], latencyMs: [] };

    const [anchorMetaMap, dbCachedLabels] = await Promise.all([
      fetchAnchorMetadata(client, anchors),
      fetchAnchorLabels(client, anchors),
    ]);

    const built = await Promise.all(
      anchors.map(async (anchor) => {
        const t0 = Date.now();
        const result = await buildAnchoredRoomScoped(client, {
          anchorTmdbId: anchor.tmdbId,
          anchorMediaType: anchor.mediaType,
          filterSets,
          limit: 30,
          matchLimit: 200,
          excludeWatchlist: false,
        });
        const elapsed = Date.now() - t0;

        const anchorKey = `${anchor.mediaType}-${anchor.tmdbId}`;
        const meta = anchorMetaMap.get(anchorKey);
        if (!meta || result.items.length === 0) {
          return { preview: null as AnchorRoomPreview | null, latency: elapsed };
        }

        const topTitlesForLabel = result.items.slice(0, 8).map((item) => ({
          title: item.title,
          year: item.year ?? null,
        }));

        const preview: AnchorRoomPreview = {
          id: `anchor:${anchor.mediaType}-${anchor.tmdbId}`,
          anchor,
          anchorTitle: meta.title,
          anchorYear: meta.release_year,
          anchorMediaType: anchor.mediaType,
          thumbnails: result.items.slice(0, 4),
          titleCount: result.items.length,
          llmLabel: dbCachedLabels.get(anchorKey) ?? null,
          topTitlesForLabel,
        };
        return { preview, latency: elapsed };
      }),
    );

    return {
      rooms: built.map((b) => b.preview).filter((p): p is AnchorRoomPreview => p != null),
      latencyMs: built.map((b) => b.latency),
    };
  } catch (error) {
    console.error('[ForYou] AnchorRooms error:', error);
    return { rooms: [], latencyMs: [] };
  }
}

async function fetchAnchorMetadata(
  client: SupabaseClient,
  anchors: SelectedAnchor[],
): Promise<Map<string, ExtendedTitleRow>> {
  const map = new Map<string, ExtendedTitleRow>();
  if (anchors.length === 0) return map;

  const ids = [...new Set(anchors.map((a) => a.tmdbId))];
  const { data, error } = await client
    .from('titles')
    .select(EXTENDED_TITLE_SELECT)
    .in('tmdb_id', ids);
  if (error || !data) return map;

  for (const row of data) {
    const typed = row as unknown as ExtendedTitleRow;
    map.set(`${typed.media_type}-${typed.tmdb_id}`, typed);
  }
  return map;
}

async function fetchAnchorLabels(
  client: SupabaseClient,
  anchors: SelectedAnchor[],
): Promise<Map<string, { label: string; description: string | null }>> {
  const out = new Map<string, { label: string; description: string | null }>();
  if (anchors.length === 0) return out;

  // mood_room_anchor_labels is public-read (migration 034). A label
  // cache miss returns null and the client resolves it post-paint via
  // requestAnchorLabel — we deliberately do NOT call OpenAI here.
  const ids = [...new Set(anchors.map((a) => a.tmdbId))];
  const { data, error } = await client
    .from('mood_room_anchor_labels')
    .select('anchor_tmdb_id, anchor_media_type, label, description')
    .in('anchor_tmdb_id', ids);
  if (error || !data) return out;

  for (const row of data as Array<{
    anchor_tmdb_id: number;
    anchor_media_type: string;
    label: string;
    description: string | null;
  }>) {
    out.set(`${row.anchor_media_type}-${row.anchor_tmdb_id}`, {
      label: row.label,
      description: row.description,
    });
  }
  return out;
}

// ── Empty payload ────────────────────────────────────────────────────

function emptyPayload(sliders: SliderState | null, t_start: number): ForYouPayload {
  return {
    recommendedForYou: [],
    hiddenGems: [],
    outsideYourUsual: [],
    becauseYouWatched: [],
    moreFromPerson: null,
    fromYourWatchlist: [],
    anchorRooms: [],
    perAnchorLatencyMs: [],
    sliders: sliders ?? { ...DEFAULT_SLIDERS },
    pool: { matched: [], metadata: {}, fetchedAt: Date.now() },
    renderMs: Date.now() - t_start,
  };
}
