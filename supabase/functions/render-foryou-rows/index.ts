/**
 * render-foryou-rows — IN-466 server-side For You first paint.
 *
 * Replaces the client's ~5-8 sequential Supabase calls (taste profile +
 * filter sets ×4 + candidate pool RPC + extended metadata + anchor
 * selection ×5 + per-anchor room generation ×5) with a single Edge
 * Function call that returns the full payload for the For You first
 * viewport.
 *
 * Auth: service-role + manual JWT decode (`extractUserIdFromJwt`).
 * Every user-owned read goes through `userScope.select(table, cols)` so
 * a missed `.eq('user_id', uid)` can't leak cross-user data — the
 * defence-in-depth replacement for RLS, per Cowork's prescription when
 * we picked service-role over JWT-scoped RLS in the auth-spike.
 *
 * Falls back to: src/hooks/useForYouContent.ts client-side pipeline (on
 * any failure of this function — 5xx, malformed JSON, network error,
 * timeout >5s). The fallback is enforced client-side, not here.
 *
 * Deploy:
 *   npx supabase functions deploy render-foryou-rows --project-ref fmusugdcnnwiuzkbjquo
 */

import {
  createServiceRoleClient,
  extractUserIdFromJwt,
  withUserScope,
  type UserScope,
} from '../_shared/userScope.ts';
import {
  buildFilterSets,
  type FilterSets,
} from '../_shared/recommendations-v2/hardFilters.ts';
import {
  fetchCandidatePool,
  scoreCandidates,
  buildRowFromPool,
} from '../_shared/recommendations-v2/ranker.ts';
import { buildAnchoredRoom } from '../_shared/recommendations-v2/anchoredRoom.ts';
import {
  selectAnchors,
  type SelectedAnchor,
} from '../_shared/recommendations-v2/anchorSelection.ts';
import { titleRowToContentItem } from '../_shared/recommendations-v2/titleAdapter.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getComfortZoneRowCount, HIDDEN_GEMS_FILTERS } from '../_shared/recommendations-v2/weights.ts';
import {
  EXTENDED_TITLE_SELECT,
  type CandidatePool,
  type ContentItem,
  type ExtendedTitleRow,
  type PipelineContext,
  type ScoredCandidate,
} from '../_shared/recommendations-v2/types.ts';
import { getV2TasteProfile } from '../_shared/taste-v2/tasteProfileV2.ts';
import type { SliderState } from '../_shared/taste-v2/types.ts';
import {
  buildEmbeddingCacheKey,
  computeNorm,
  type EmbeddingMap,
} from '../_shared/recommendations-v2/embeddingCache.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Per-instance embedding cache (IN-PX-22 Edge half). Key = same shape
// as client (userId + taste_profiles.updated_at), value = the loaded
// embedding map. Module-scoped so multiple requests served by the same
// warm Edge instance reuse the load. No TTL — instance lifetime is
// short enough that staleness isn't a concern; a cold start zeroes it.
const EMBEDDING_CACHE = new Map<string, EmbeddingMap>();

// ── Types matching the wire contract with the client ────────────────

interface RequestBody {
  services: string[];
  /** Phase 5 decision 9: client passes its local hour-of-day in the
   *  body so the contextual scorer doesn't desync against the Edge's
   *  UTC clock. Optional — UTC fallback if absent. Validated 0–23. */
  hourOfDay?: number;
  /** Paired with hourOfDay for calendar-boundary safety. 0=Sun…6=Sat. */
  dayOfWeek?: number;
}

const MAX_SERVICES = 20;

interface BecauseYouWatchedRow {
  anchor: ContentItem;
  items: ContentItem[];
}

interface MoreFromPersonRow {
  personName: string;
  personType: 'director' | 'actor';
  items: ContentItem[];
}

interface AnchorRoomPreview {
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

interface ResponsePayload {
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
    metadata: Record<string, ExtendedTitleRow>;
    fetchedAt: number;
  };
  renderMs: number;
}

// ── Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Per-request CORS lookup. Origin is echoed only if it's allow-listed
  // (capacitor://localhost, https://localhost, http://localhost(:port),
  // or a VIDEX_ALLOWED_DEV_ORIGINS env entry). See _shared/cors.ts.
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);
  const jsonResponse = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' });
  }

  const t_start = Date.now();

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid json' });
  }
  if (!body || !Array.isArray(body.services)) {
    return jsonResponse(400, { error: 'services array required' });
  }
  if (body.services.length > MAX_SERVICES) {
    return jsonResponse(400, { error: `services array exceeds ${MAX_SERVICES}` });
  }
  for (const s of body.services) {
    if (typeof s !== 'string' || s.length > 32) {
      return jsonResponse(400, { error: 'invalid service id' });
    }
  }

  // Phase 5: validate optional time-of-day inputs when supplied.
  if (body.hourOfDay != null) {
    if (
      typeof body.hourOfDay !== 'number'
      || !Number.isInteger(body.hourOfDay)
      || body.hourOfDay < 0
      || body.hourOfDay > 23
    ) {
      return jsonResponse(400, { error: 'hourOfDay must be integer 0..23' });
    }
  }
  if (body.dayOfWeek != null) {
    if (
      typeof body.dayOfWeek !== 'number'
      || !Number.isInteger(body.dayOfWeek)
      || body.dayOfWeek < 0
      || body.dayOfWeek > 6
    ) {
      return jsonResponse(400, { error: 'dayOfWeek must be integer 0..6' });
    }
  }

  const userId = extractUserIdFromJwt(req);
  if (!userId) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  const supabase = createServiceRoleClient();
  const scope = withUserScope(supabase, userId);

  try {
    const profile = await getV2TasteProfile(scope);
    if (!profile?.tasteVector) {
      // No taste vector → user hasn't completed onboarding. Return an
      // empty payload; the client will show its empty-state UI.
      return jsonResponse(200, emptyPayload(profile?.sliders ?? null, t_start));
    }

    const filterSets = await buildFilterSets(supabase, scope, body.services);

    // Phase 5: build PipelineContext for the contextual scorer.
    // hourOfDay / dayOfWeek prefer the body fields (client local time,
    // decision 9). Fallback to UTC server time when absent. devicePlatform
    // inferred from User-Agent header. viewingContext from profiles.
    const ctx = await buildEdgePipelineContext(req, body, supabase, userId);

    const pool = await fetchCandidatePool(supabase, {
      tasteVector: profile.tasteVector,
      filterSets,
      sliders: profile.sliders,
      surface: 'foryou',
    });

    const scored = scoreCandidates(pool, profile.sliders, 'foryou', ctx);

    // Phase 5: fetch embeddings for top-200 by finalScore so MMR can
    // diversify intra-row across all three taste-vector rows. Phase 5.5
    // (C5): per-instance in-memory cache keyed on userId +
    // taste_profiles.updated_at — warm requests skip the Supabase select.
    const embeddingMap = await fetchEmbeddingsForCandidates(supabase, scored.slice(0, 200), {
      userId,
      tasteProfilesUpdatedAt: profile.updatedAt,
    });

    // Taste-vector rows. usedIds is shared across rec/gems/outside for
    // cross-row dedup — same contract as src/hooks/useForYouContent.ts.
    const usedIds = new Set<string>();

    const recommendedForYou = buildRowFromPool(scored, profile.sliders, {
      config: { limit: 20, excludeIds: usedIds },
      embeddingMap,
    });
    recommendedForYou.forEach((item) => usedIds.add(item.id));

    const gemCandidates = scored.filter((c) => {
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

    const outsideYourUsual = buildOutsideYourUsual(scored, profile.sliders, usedIds, embeddingMap);

    // Conditional rows + anchor rooms run in parallel — they share the
    // pool + filter sets but otherwise touch different RPC paths, so
    // network parallelism here is the main latency win vs the client.
    const [becauseYouWatched, moreFromPerson, fromYourWatchlist, anchorRoomsResult] = await Promise.all([
      fetchBecauseYouWatched(supabase, scope, filterSets, pool),
      fetchMoreFromPerson(supabase, scope, filterSets),
      fetchFromWatchlist(scope),
      buildAnchorRooms(supabase, scope, profile.tasteVector, profile.sliders, profile.selectedClusters, profile.interactionCount, filterSets, pool),
    ]);

    const payload: ResponsePayload = {
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
        // Map → Record at the wire boundary (Map serialises to "{}").
        metadata: Object.fromEntries(pool.metadata),
        fetchedAt: pool.fetchedAt,
      },
      renderMs: Date.now() - t_start,
    };

    return jsonResponse(200, payload);
  } catch (err) {
    console.error('[render-foryou-rows] uncaught error:', err);
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── Outside Your Usual ───────────────────────────────────────────────
// Mirrors the client's buildRows() for this row exactly. See the
// long comment block in src/hooks/useForYouContent.ts for the
// three-knob rationale (cosine aperture / IMDb floor / maxPerGenre 4).

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

// ── Phase 5 MMR support: embedding fetch ─────────────────────────────
// Mirrors the helper in src/hooks/useForYouContent.ts. Fetches the
// 1536D pgvector for each tmdb_id in `candidates` so applyMMR can
// compute redundancy. Failure or partial coverage degrades MMR
// gracefully — buildRowFromPool falls back to applyGenreSpread when
// the returned map is empty.

async function fetchEmbeddingsForCandidates(
  client: SupabaseClient,
  candidates: ScoredCandidate[],
  cacheContext: { userId: string; tasteProfilesUpdatedAt: string | null },
): Promise<EmbeddingMap> {
  if (candidates.length === 0) return new Map();

  // Per-instance cache lookup.
  const cacheKey = buildEmbeddingCacheKey(
    cacheContext.userId,
    cacheContext.tasteProfilesUpdatedAt,
  );
  let map = EMBEDDING_CACHE.get(cacheKey) ?? new Map();
  if (!EMBEDDING_CACHE.has(cacheKey)) {
    map = new Map<string, { vec: Float32Array; norm: number }>();
  }

  // Find which candidates need a fresh fetch.
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
    const { data, error } = await (client.from('titles') as any)
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

// ── Phase 5 PipelineContext builder ──────────────────────────────────
// Mirrors src/lib/recommendations-v2/pipelineContext.ts on the Edge
// side. Sources of truth:
//   - hourOfDay / dayOfWeek: prefer body (client local time, decision 9);
//     fall back to UTC `new Date()` if absent (legacy clients).
//   - devicePlatform: parse User-Agent header.
//   - viewingContext: profiles.viewing_context via withUserScope.

function inferDevicePlatformFromUserAgent(
  ua: string | null,
): 'android' | 'ios' | 'web' | undefined {
  if (!ua) return undefined;
  const lower = ua.toLowerCase();
  if (lower.includes('android')) return 'android';
  // Capacitor on iOS sends "iPhone" / "iPad" / "iPod" UA fragments.
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ipod')) {
    return 'ios';
  }
  // Generic browser UAs (desktop, non-Capacitor mobile web): treat as web.
  return 'web';
}

async function buildEdgePipelineContext(
  req: Request,
  body: RequestBody,
  client: SupabaseClient,
  userId: string,
): Promise<PipelineContext> {
  const ctx: PipelineContext = {};

  // Time-of-day: body-first, UTC fallback.
  const now = new Date();
  ctx.hourOfDay = body.hourOfDay ?? now.getUTCHours();
  ctx.dayOfWeek = body.dayOfWeek ?? now.getUTCDay();

  // Device platform from User-Agent.
  const platform = inferDevicePlatformFromUserAgent(req.headers.get('user-agent'));
  if (platform) ctx.devicePlatform = platform;

  // viewing_context from the user's profile row. profiles is keyed on
  // `id`, not `user_id`, so withUserScope's select helper doesn't fit
  // (it auto-applies .eq('user_id', userId)). Use the service-role
  // client directly with an explicit .eq('id', userId). Narrow against
  // the ViewingContext union so unknown DB values land at null
  // (matches client behaviour — IN-PX-27).
  try {
    const { data } = await (client.from('profiles') as any)
      .select('viewing_context')
      .eq('id', userId)
      .maybeSingle();
    const vc = (data as { viewing_context?: string | null } | null)?.viewing_context;
    const narrowed = narrowViewingContext(vc);
    if (narrowed) ctx.viewingContext = narrowed;
  } catch {
    // Leave viewingContext unset on any error — scorer falls back to neutral.
  }

  return ctx;
}

const VIEWING_CONTEXT_VALUES = [
  'solo', 'with_partner', 'with_family', 'with_friends',
  'wind_down', 'background', 'focused',
] as const;
type ViewingContext = typeof VIEWING_CONTEXT_VALUES[number];

function narrowViewingContext(raw: unknown): ViewingContext | null {
  if (typeof raw !== 'string') return null;
  return (VIEWING_CONTEXT_VALUES as readonly string[]).includes(raw)
    ? (raw as ViewingContext)
    : null;
}

// ── Because You Watched ──────────────────────────────────────────────
// Mirrors fetchBecauseYouWatched in src/hooks/useForYouContent.ts.

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

    if (!engagementRes.data || !thumbsRes.data) return [];

    const thumbsUpSet = new Set(
      (thumbsRes.data as any[]).map((r: any) => `${r.media_type}-${r.content_id}`),
    );
    const seen = new Set<string>();
    const qualifying = (engagementRes.data as any[])
      .filter((r: any) => {
        const key = `${r.media_type}-${r.content_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return thumbsUpSet.has(key);
      })
      .slice(0, 2);

    if (qualifying.length === 0) return [];

    const rowResults = await Promise.all(
      qualifying.map(async (anchor: any) => {
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

        const { items: neighbours } = await buildAnchoredRoom(client, {
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

async function fetchMoreFromPerson(
  client: SupabaseClient,
  scope: UserScope,
  filterSets: FilterSets,
): Promise<MoreFromPersonRow | null> {
  try {
    const { data: thumbsData } = await scope
      .select('user_interactions', 'content_id, media_type')
      .eq('event_type', 'thumbs_up');

    if (!thumbsData || thumbsData.length < 2) return null;

    const thumbsIds = (thumbsData as any[]).map((r: any) => r.content_id as number);

    const { data: titleData } = await client
      .from('titles')
      .select('tmdb_id, media_type, director, cast_top_5')
      .in('tmdb_id', thumbsIds);

    if (!titleData || titleData.length === 0) return null;

    const titles = titleData as any[];

    const movieCount = titles.filter((t: any) => t.media_type === 'movie').length;
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
    for (const row of personTitles as any[]) {
      const typed = row as ExtendedTitleRow;
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
// Reads from the watchlist table (vs client's localStorage). Joined with
// user_interactions to mark items as watched.

async function fetchFromWatchlist(scope: UserScope): Promise<ContentItem[]> {
  try {
    // watchlist row schema: user_id, tmdb_id, media_type, status,
    // rating, title, poster_path, genre_ids, added_at, updated_at.
    // (See supaAddToWatchlist in src/lib/supabaseStorage.ts.)
    const [wlRes, watchedRes] = await Promise.all([
      scope.select('watchlist', 'tmdb_id, media_type, added_at, status, title, poster_path, genre_ids'),
      scope.select('user_interactions', 'content_id, media_type')
        .eq('event_type', 'watched')
        .limit(500),
    ]);

    if (!wlRes.data) return [];

    const watchedSet = new Set<string>();
    if (watchedRes.data) {
      for (const row of watchedRes.data as any[]) {
        watchedSet.add(`${row.media_type}-${row.content_id}`);
      }
    }

    const items: ContentItem[] = [];
    const sorted = (wlRes.data as any[])
      .filter((item: any) => {
        const key = `${item.media_type}-${item.tmdb_id}`;
        return !watchedSet.has(key) && item.status !== 'watched';
      })
      .sort((a: any, b: any) => {
        const ta = new Date(a.added_at ?? 0).getTime();
        const tb = new Date(b.added_at ?? 0).getTime();
        return tb - ta;
      })
      .slice(0, 15);

    for (const item of sorted) {
      items.push({
        id: `${item.media_type}-${item.tmdb_id}`,
        title: item.title ?? `Title ${item.tmdb_id}`,
        image: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : '',
        services: [],
        type: item.media_type,
        genreIds: item.genre_ids ?? undefined,
      });
    }

    return items;
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
        const result = await buildAnchoredRoom(client, {
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

  // Read mood_room_anchor_labels — public read (RLS allows authenticated
  // SELECT per migration 034). Cache miss returns null and the client
  // resolves the label post-paint via requestAnchorLabel — we explicitly
  // do NOT call OpenAI inside this function (would defeat the latency
  // target).
  const ids = [...new Set(anchors.map((a) => a.tmdbId))];
  const { data, error } = await client
    .from('mood_room_anchor_labels')
    .select('anchor_tmdb_id, anchor_media_type, label, description')
    .in('anchor_tmdb_id', ids);
  if (error || !data) return out;

  for (const row of data as any[]) {
    out.set(`${row.anchor_media_type}-${row.anchor_tmdb_id}`, {
      label: row.label,
      description: row.description,
    });
  }
  return out;
}

// ── Empty payload ────────────────────────────────────────────────────

function emptyPayload(sliders: SliderState | null, t_start: number): ResponsePayload {
  const DEFAULT_SLIDERS: SliderState = {
    catalogueAge: 0.5,
    comfortZone: 0.25,
    contentMix: 0.5,
    variety: 0.5,
  };
  return {
    recommendedForYou: [],
    hiddenGems: [],
    outsideYourUsual: [],
    becauseYouWatched: [],
    moreFromPerson: null,
    fromYourWatchlist: [],
    anchorRooms: [],
    perAnchorLatencyMs: [],
    sliders: sliders ?? DEFAULT_SLIDERS,
    pool: { matched: [], metadata: {}, fetchedAt: Date.now() },
    renderMs: Date.now() - t_start,
  };
}
