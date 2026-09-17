/**
 * Videx API proxy — Cloudflare Worker (PLAT-2, E&P brief §6).
 *
 * Thin always-warm proxy in front of TMDb + OMDB with CDN caching via
 * the Cache API. Removes the bundled client keys (Worker secrets
 * TMDB_API_KEY / OMDB_API_KEY) and collapses N-clients × M-calls into
 * shared cached reads. PLAT-3 adds GET /v1/foryou here, importing the
 * engine from src/lib/recommendations-v2/ directly (the wrangler
 * bundles-from-anywhere property that dissolves ADR-011).
 *
 * Routes:
 *   GET /v1/health             — deploy smoke probe (uncached).
 *   GET /v1/title/:type/:id    — merged TMDb detail (credits,
 *                                external_ids, watch/providers appended)
 *                                + raw OMDB ratings body. 24h CDN cache.
 *   GET /v1/tmdb/<path>        — allowlisted passthrough for the rest of
 *                                the client's TMDb read surface; key
 *                                injected server-side; per-class TTLs
 *                                (rules.ts). Off-allowlist → 404.
 *
 * Object URLs (Growth S1, ADR-015) — each needs a dashboard zone route:
 *   GET /t/:type/:ref          — title page; ref {tmdbId}[-{slug}], 301 to canonical.
 *   GET /room/:id              — shared room snapshot page.
 *   GET /list/:id              — reserved for G2; branded 404.
 *   GET /.well-known/apple-app-site-association, /.well-known/assetlinks.json
 *   POST /v1/share/room        — snapshot a room (Supabase JWT).
 *   GET /v1/room/:id           — snapshot JSON for the app.
 *
 * Growth telemetry (Growth S2, migration 090):
 *   POST /v1/growth/events     — app events (optional Supabase JWT sets user_id).
 *   /t/ and /room/ pages record preview_fetched / preview_opened via waitUntil.
 *
 * Caching: caches.default keyed on the normalised request URL; the
 * Cache-Control written by cacheControlFor() drives both the Worker
 * cache and Cloudflare's CDN tier. Failures are never cached.
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  matchTmdbPath,
  cacheControlFor,
  sanitiseParams,
  isValidTitleRequest,
  TITLE_TTL_SECONDS,
} from './rules';
import { verifySupabaseJwt } from './auth';
import { markdownToHtml, renderPolicyPage } from './policyPages';
import { bridgeAppUrl, bridgeKind, renderResetBridgePage } from './resetBridge';
import {
  CANONICAL_REF_HEADER,
  platformBucket,
  renderTitlePage,
  renderTitleNotFoundPage,
  SHARE_SERVICE_LABELS,
  titlePageCacheKey,
  type TitlePageData,
} from './titlePage';
import { applyAttribution, HTML_SECURITY_HEADERS } from './pageShell';
import {
  renderListNotFoundPage,
  renderRoomNotFoundPage,
  renderRoomPage,
  roomPageCacheKey,
} from './roomPage';
import {
  appleAppSiteAssociation,
  assetLinks,
  parseFingerprints,
  WELL_KNOWN_HEADERS,
} from './wellKnown';
import { isUuid, validateShareRoomBody } from './sharedRooms';
import { countSharedRoomsSince, insertSharedRoom, loadSharedRoom } from './roomStore';
import { classifyUserAgent } from './uaClass';
import { GROWTH_EVENTS_PATH } from '../../../src/lib/growth/growthEvents';
import {
  GROWTH_EVENT_BODY_MAX_BYTES,
  previewEventRow,
  rateLimitKey,
  validateGrowthEventBody,
} from './growthEvents';
import { insertGrowthEvent } from './growthStore';
import type { InboundObject } from '../../../src/lib/growth/inboundLink';
import { parseTitleRef, titleRef, CANONICAL_ORIGIN } from '../../../src/lib/growth/slug';
import { sharedRoomUrl, type ShareRoomResponse } from '../../../src/lib/growth/roomSnapshot';
// Bundled as text (wrangler [[rules]] Text rule) — the single source of
// truth for the hosted /privacy + /terms pages is docs/legal/*.md.
import privacyMd from '../../../docs/legal/privacy-policy.md';
import termsMd from '../../../docs/legal/terms-of-service.md';
import deleteAccountMd from '../../../docs/legal/delete-account.md';
// PLAT-3: the engine imports directly from src/lib — the
// wrangler-bundles-from-anywhere property that dissolves ADR-011.
import { renderForYou, type ForYouPayload } from '../../../src/lib/server/foryouRender';
import {
  createServiceRoleClient,
  withUserScope,
} from '../../../src/lib/server/userScope';
import {
  getV2TasteProfileScoped,
  getTasteProfileKeyFieldsScoped,
} from '../../../src/lib/taste-v2/tasteProfileV2';
import type { TmdbIdsCache } from '../../../src/lib/recommendations-v2/hardFilters';
import { recomputeStaleProfiles } from '../../../src/lib/server/staleRecompute';
import { renderHome, FREE_UK_SERVICES } from '../../../src/lib/server/homeRender';
import { createTmdbServerClient } from '../../../src/lib/server/tmdbServer';
import { serviceIdsToProviderIds } from '../../../src/lib/adapters/platformAdapter';
import type { ServiceId } from '../../../src/lib/types/content';
import { buildFeedCacheKey, buildHomeCacheKey, coalesce } from './foryouCache';
import {
  channelTokensFor,
  fetchChannelRegistry,
  knownChannelIds,
  parseChannelsParam,
  type ChannelRegistryRow,
} from '../../../src/lib/entitlements/channels';

type Env = {
  TMDB_API_KEY: string;
  OMDB_API_KEY: string;
  /** Public project URL — wrangler.toml [vars]. */
  SUPABASE_URL: string;
  /** Worker secret (wrangler secret put). */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** PLAT-3 W3: per-user feed cache. */
  FORYOU_CACHE: KVNamespace;
  /** LAUNCH-1 W1 (IN-PX-60): per-user rate limiter on /v1/foryou. */
  FORYOU_RATELIMIT: RateLimit;
  /** Growth S2: POST /v1/growth/events, keyed on install id or client IP; also page-view events per IP. */
  GROWTH_RATELIMIT: RateLimit;
  /** Sweep: always-on per-IP bucket for POST /v1/growth/events (a rotating install id cannot escape it). */
  GROWTH_IP_RATELIMIT: RateLimit;
  /** Growth S1: comma-separated SHA-256 cert fingerprints for assetlinks.json ([vars]). */
  ASSETLINKS_FINGERPRINTS: string;
};

/** Cloudflare rate-limit binding surface (the `limit()` runtime API). */
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com';

// Public web origin for canonical/og:url on shared pages. Pinned (not
// request-derived) so workers.dev requests canonicalise to the real domain.

const app = new Hono<{ Bindings: Env }>();

// The old Capacitor WebView origin (https://localhost) + the Vite dev server.
// capacitor://localhost was dropped 2026-09-14 (IN-DEP-002); the Expo app's
// native fetch sends no Origin, so CORS does not apply to it.
app.use(
  '*',
  cors({
    origin: ['https://localhost', 'http://localhost:3000'],
    allowMethods: ['GET', 'OPTIONS'],
    maxAge: 86400,
  }),
);

app.get('/v1/health', (c) =>
  c.json({ ok: true, service: 'videx-api', ts: new Date().toISOString() }),
);

// ── Hosted legal pages (launch-compliance §D) ────────────────────────
// Public, browser-navigable /privacy + /terms — the store-required
// policy URLs. Rendered once at isolate startup from the bundled
// Markdown; 1h CDN cache. Static content, so no per-user concerns.
const PRIVACY_HTML = renderPolicyPage('Privacy Policy', markdownToHtml(privacyMd));
const TERMS_HTML = renderPolicyPage('Terms of Service', markdownToHtml(termsMd));
const POLICY_CACHE_CONTROL = 'public, max-age=3600';

// Defence-in-depth on every browser-navigable HTML response: all
// interpolation is escaped at render time, but these stop MIME sniffing
// and framing (clickjacking) outright. Applied to /privacy, /terms, /t/
// and /reset via their handlers.
export function htmlSecurityHeaders(c: { header: (k: string, v: string) => void }): void {
  for (const [k, v] of Object.entries(HTML_SECURITY_HEADERS)) c.header(k, v);
}

// ── Association files (Growth S1, ADR-015) ───────────────────────────
// Answered directly (no redirect) with application/json: Apple's CDN and
// Android's verifier both reject anything else. Needs the dashboard route
// videxstreaming.com/.well-known/* or the request reaches Vercel and 404s.
const AASA_BODY = JSON.stringify(appleAppSiteAssociation());
app.get('/.well-known/apple-app-site-association', () =>
  new Response(AASA_BODY, { headers: WELL_KNOWN_HEADERS }),
);
app.get('/.well-known/assetlinks.json', (c) =>
  new Response(JSON.stringify(assetLinks(parseFingerprints(c.env.ASSETLINKS_FINGERPRINTS))), {
    headers: WELL_KNOWN_HEADERS,
  }),
);

app.get('/privacy', (c) => {
  c.header('Cache-Control', POLICY_CACHE_CONTROL);
  htmlSecurityHeaders(c);
  return c.html(PRIVACY_HTML);
});
app.get('/terms', (c) => {
  c.header('Cache-Control', POLICY_CACHE_CONTROL);
  htmlSecurityHeaders(c);
  return c.html(TERMS_HTML);
});
// Play data-safety requires a PUBLIC web page for account-deletion
// requests (shown on the store listing) even though deletion is
// available in-app — a web path must exist for people without the app.
// ⚠ Needs its own dashboard zone route (videxstreaming.com/delete-account*)
// per the README's standing rule, or it falls through to the marketing site.
const DELETE_ACCOUNT_HTML = renderPolicyPage('Delete your account', markdownToHtml(deleteAccountMd));
app.get('/delete-account', (c) => {
  c.header('Cache-Control', POLICY_CACHE_CONTROL);
  htmlSecurityHeaders(c);
  return c.html(DELETE_ACCOUNT_HTML);
});

// ── Password-reset bridge ────────────────────────────────────────────
// Gmail (and most email clients) refuse to activate custom-scheme links
// (videx://…), so the reset email must link HTTPS. This page receives the
// Supabase recovery token_hash as a query param (which, unlike URL
// fragments, survives every hop) and forwards it into the app via the
// custom scheme — auto-attempt on load plus a tap fallback, since some
// browsers only allow scheme navigation from a user gesture.
// Security: the token is single-use + short-lived and never logged here;
// the page is no-store; token_hash is charset-validated before being
// interpolated (defence against attribute/JS injection via the param).
// Growth S3 follow-up: the sign-up confirmation email uses the same route
// with type=email and lands on videx://confirm-email (see resetBridge.ts).
app.get('/reset', (c) => {
  c.header('Cache-Control', 'private, no-store');
  c.header('Referrer-Policy', 'no-referrer');
  htmlSecurityHeaders(c);
  const type = c.req.query('type') ?? '';
  const appUrl = bridgeAppUrl(c.req.query('token_hash') ?? '', type);
  return c.html(renderResetBridgePage(appUrl, bridgeKind(type)), appUrl ? 200 : 400);
});


/** Cache-or-fetch helper: failures pass through uncached. Callers pass
 *  a NORMALISED cache URL (sorted, credential-stripped params) so
 *  param-order variants and junk params share one entry. */
async function withEdgeCache(
  c: { executionCtx: ExecutionContext },
  cacheUrl: string,
  ttlSeconds: number,
  build: () => Promise<Response>,
): Promise<Response> {
  const cacheKey = new Request(cacheUrl, { method: 'GET' });
  const cache = caches.default;

  const hit = await cache.match(cacheKey);
  if (hit) {
    const out = new Response(hit.body, hit);
    out.headers.set('x-videx-cache', 'hit');
    return out;
  }

  const resp = await build();
  if (resp.ok) {
    const toStore = new Response(resp.clone().body, resp);
    toStore.headers.set('Cache-Control', cacheControlFor(ttlSeconds));
    c.executionCtx.waitUntil(cache.put(cacheKey, toStore.clone()));
    const out = new Response(toStore.body, toStore);
    out.headers.set('x-videx-cache', 'miss');
    return out;
  }
  return resp;
}

// ── Merged title endpoint ─────────────────────────────────────────────
app.get('/v1/title/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  if (!isValidTitleRequest(type, id)) {
    return c.json({ error: 'invalid type or id' }, 400);
  }

  return withEdgeCache(c, `https://cache.videx/v1/title/${type}/${id}`, TITLE_TTL_SECONDS, async () => {
    const tmdbUrl =
      `${TMDB_BASE}/${type}/${id}` +
      `?api_key=${c.env.TMDB_API_KEY}` +
      `&append_to_response=${encodeURIComponent('credits,external_ids,watch/providers')}`;

    const tmdbRes = await fetch(tmdbUrl);
    if (!tmdbRes.ok) {
      return Response.json(
        { error: 'tmdb upstream error', status: tmdbRes.status },
        { status: tmdbRes.status === 404 ? 404 : 502 },
      );
    }
    const tmdb = (await tmdbRes.json()) as {
      imdb_id?: string | null;
      external_ids?: { imdb_id?: string | null };
    };

    // OMDB ratings ride along when an IMDb id exists. Best-effort:
    // OMDB failure degrades to omdb:null — same tolerance the client's
    // Promise.allSettled pipeline always had.
    const imdbId = tmdb.external_ids?.imdb_id || tmdb.imdb_id || null;
    let omdb: unknown = null;
    if (imdbId) {
      try {
        // `type` passes through as-is (movie|tv) — OMDB ignores values
        // it doesn't recognise; the shipped client behaved identically.
        const omdbRes = await fetch(
          `${OMDB_BASE}/?i=${encodeURIComponent(imdbId)}&apikey=${c.env.OMDB_API_KEY}&type=${type}`,
        );
        if (omdbRes.ok) {
          const body = (await omdbRes.json()) as { Response?: string };
          if (body.Response !== 'False') omdb = body;
        }
      } catch {
        // degrade silently
      }
    }

    return Response.json({ tmdb, omdb });
  });
});

// ── Public object pages: shared helpers ──────────────────────────────
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';

function htmlPage(html: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': HTML_CONTENT_TYPE, ...HTML_SECURITY_HEADERS, ...extra },
  });
}

/**
 * Fill the ?via= / ?src= markers AFTER the edge-cache read (pageShell.ts):
 * the cached body is query-free, the served body carries the attribution
 * into the app deep link and the Play referrer (which also names `object`,
 * Growth S2). Also strips the internal canonical-ref header.
 */
async function withAttribution(
  resp: Response,
  via: string | undefined,
  src: string | undefined,
  object?: InboundObject | null,
): Promise<Response> {
  if (!(resp.headers.get('Content-Type') ?? '').startsWith('text/html')) return resp;
  const out = new Response(applyAttribution(await resp.text(), via, src, object), resp);
  out.headers.delete('Content-Length');
  out.headers.delete(CANONICAL_REF_HEADER);
  return out;
}

/**
 * Growth S2: record preview_fetched (crawler) or preview_opened (person) for
 * a page actually served. Runs after the cache read, so cache hits count too.
 * The insert rides waitUntil and can never change the response: every
 * failure is logged and swallowed. Only GET 200s count (not HEAD, not the
 * slug 301, not a 404).
 */
function recordPreview(c: Context<{ Bindings: Env }>, resp: Response, object: InboundObject): void {
  if (c.req.method !== 'GET' || resp.status !== 200) return;
  try {
    const userAgent = c.req.header('user-agent');
    const { uaClass, agent } = classifyUserAgent(userAgent);
    const row = previewEventRow({
      uaClass,
      agent,
      platform: platformBucket(userAgent),
      via: c.req.query('via'),
      src: c.req.query('src'),
      object,
    });
    // Public, unauthenticated and cache-hit inclusive, so bound it per client
    // IP with the growth bucket before it costs an insert (sweep, security 1).
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const env = c.env;
    c.executionCtx.waitUntil(
      (async () => {
        const { success } = await env.GROWTH_RATELIMIT.limit({ key: `preview:${ip}` });
        if (!success) return;
        const client = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        await insertGrowthEvent(client, row);
      })().catch((err) => console.error('[growth] preview event failed:', err)),
    );
  } catch (err) {
    console.error('[growth] preview event skipped:', err);
  }
}

// ── Public share / SEO title page (H0 Stream B — Share v1) ───────────
// GET /t/:type/:ref — a minimal, crawlable, server-rendered
// "where to watch X in the UK" page. Rendered from the Supabase content
// cache (titles + streaming_availability), OG-tagged for link unfurls,
// carrying store links + an "Open in Videx" deep link. 24h CDN cache.
// This is the target of the native Share action AND the SEO seed.
//
// Growth S1 (ADR-015): ref is {tmdbId} or {tmdbId}-{slug}. Resolved by type
// and id only; a missing or stale slug 301s to the canonical ref (query
// kept). The canonical ref rides the cached response in a header, so a
// cache hit redirects without touching the database.
const TITLE_PAGE_TTL_SECONDS = 24 * 60 * 60;

app.get('/t/:type/:ref', async (c) => {
  const { type, ref } = c.req.param();
  const parsed = parseTitleRef(ref);
  if (!parsed || !isValidTitleRequest(type, parsed.id)) {
    return c.text('Not found', 404);
  }
  const id = Number(parsed.id);

  // Beta feedback 2026-07-09: the store CTA said "Get Videx on Android"
  // to iPhone visitors. Render is now UA-dependent, so the edge cache
  // key MUST vary by a coarse platform bucket — otherwise the first
  // visitor's platform sticks for all 24h. Three buckets → at most 3
  // cached variants per title (android|ios|other).
  const bucket = platformBucket(c.req.header('user-agent'));

  // Key: type + id + bucket. Never the slug or the query (titlePageCacheKey).
  const resp = await withEdgeCache(
    c,
    titlePageCacheKey(type, id, bucket),
    TITLE_PAGE_TTL_SECONDS,
    async () => {
      const client = createServiceRoleClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

      const [{ data: titleRow }, { data: avail }] = await Promise.all([
        client
          .from('titles')
          .select('title, release_year, poster_path, overview')
          .eq('tmdb_id', id)
          .eq('media_type', type)
          .maybeSingle(),
        client
          .from('streaming_availability')
          .select('service_id, stream_type')
          .eq('tmdb_id', id)
          .eq('media_type', type),
      ]);

      // Unknown title: a real 404 (never a junk "Title #N" 200 stuck in
      // the 24h edge cache — withEdgeCache only stores ok responses).
      if (!titleRow) {
        return htmlPage(renderTitleNotFoundPage(bucket), 404, { 'Cache-Control': 'public, max-age=300' });
      }

      // Distinct service labels, split by whether you can stream vs rent/buy.
      const subSet = new Set<string>();
      const rentBuySet = new Set<string>();
      for (const row of avail ?? []) {
        // A paid channel inside a service (Prime Video Channels etc.) is not
        // "stream on Prime" — skip until channels are per-user entitlements
        // (docs/strategy/briefs/addon-entitlements.md).
        if (row.stream_type === 'addon') continue;
        const label = SHARE_SERVICE_LABELS[row.service_id] ?? row.service_id;
        if (row.stream_type === 'rent' || row.stream_type === 'buy') rentBuySet.add(label);
        else subSet.add(label);
      }

      const data: TitlePageData = {
        title: titleRow.title,
        year: titleRow.release_year ?? null,
        posterUrl: titleRow.poster_path
          ? `https://image.tmdb.org/t/p/w500${titleRow.poster_path}`
          : null,
        overview: titleRow.overview ?? null,
        subscription: [...subSet].sort(),
        rentBuy: [...rentBuySet].filter((s) => !subSet.has(s)).sort(),
      };

      return htmlPage(renderTitlePage(type, id, data, CANONICAL_ORIGIN, bucket), 200, {
        [CANONICAL_REF_HEADER]: titleRef(id, data.title, data.year),
      });
    },
  );

  const canonicalRef = resp.headers.get(CANONICAL_REF_HEADER);
  if (resp.ok && canonicalRef && canonicalRef !== ref) {
    // Relative Location keeps workers.dev requests on workers.dev; the
    // query (?via= / ?src=) survives the hop.
    return new Response(null, {
      status: 301,
      headers: {
        Location: `/t/${type}/${canonicalRef}${new URL(c.req.url).search}`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  const object: InboundObject = { type: 'title', id: `${type}-${id}` };
  const out = await withAttribution(resp, c.req.query('via'), c.req.query('src'), object);
  recordPreview(c, out, object);
  return out;
});

// ── Shared room snapshots (Growth S1, migration 088) ─────────────────
// GET /room/:id — public page; GET /v1/room/:id — the same snapshot as
// JSON for the app's room screen. Both read through loadSharedRoom. Rows
// are immutable (no unshare, no expiry), so the page caches 24h by id and
// platform bucket; the JSON 1h, since it carries today's availability.
const ROOM_PAGE_TTL_SECONDS = 24 * 60 * 60;
const ROOM_JSON_TTL_SECONDS = 60 * 60;

app.get('/room/:id', async (c) => {
  const bucket = platformBucket(c.req.header('user-agent'));
  const id = c.req.param('id').toLowerCase();
  const via = c.req.query('via');
  const src = c.req.query('src');
  if (!isUuid(id)) {
    return withAttribution(
      htmlPage(renderRoomNotFoundPage(bucket), 404, { 'Cache-Control': 'public, max-age=300' }),
      via,
      src,
    );
  }
  try {
    const resp = await withEdgeCache(c, roomPageCacheKey(id, bucket), ROOM_PAGE_TTL_SECONDS, async () => {
      const client = createServiceRoleClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
      const room = await loadSharedRoom(client, id);
      if (!room) {
        return htmlPage(renderRoomNotFoundPage(bucket), 404, { 'Cache-Control': 'public, max-age=300' });
      }
      const html = renderRoomPage(
        {
          id: room.id,
          label: room.label,
          description: room.description,
          createdAt: room.createdAt,
          titles: room.items.map((i) => ({ title: i.title, year: i.year, image: i.image })),
        },
        CANONICAL_ORIGIN,
        bucket,
      );
      return htmlPage(html);
    });
    const object: InboundObject = { type: 'room', id };
    const out = await withAttribution(resp, via, src, object);
    recordPreview(c, out, object);
    return out;
  } catch (err) {
    console.error('[room-page] error:', err);
    return c.text('Internal error', 500);
  }
});

app.get('/v1/room/:id', async (c) => {
  const id = c.req.param('id').toLowerCase();
  if (!isUuid(id)) return c.json({ error: 'not found' }, 404);
  try {
    return await withEdgeCache(c, `https://cache.videx/v1/room/${id}`, ROOM_JSON_TTL_SECONDS, async () => {
      const client = createServiceRoleClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
      const room = await loadSharedRoom(client, id);
      return room ? Response.json(room) : Response.json({ error: 'not found' }, { status: 404 });
    });
  } catch (err) {
    console.error('[room-json] error:', err);
    return c.json({ error: 'internal error' }, 500);
  }
});

// GET /list/:id — grammar reserved for the G2 watchlists entity (plan D3).
app.get('/list/:id', (c) =>
  withAttribution(
    htmlPage(renderListNotFoundPage(platformBucket(c.req.header('user-agent'))), 404, {
      'Cache-Control': 'public, max-age=300',
    }),
    c.req.query('via'),
    c.req.query('src'),
  ),
);

// POST /v1/share/room — freeze a room at share time and return its URL.
// Authorization: Bearer <supabase user JWT>. Rate limited on the verified
// user id with the /v1/foryou binding (own key prefix, so its own budget).
// The body is validated and the label de-personalised in sharedRooms.ts;
// the insert is service-role (shared_rooms has no client policies).
const SHARE_ROOM_BODY_MAX_BYTES = 16 * 1024;
const SHARE_ROOM_DAILY_CAP = 200;

app.post('/v1/share/room', async (c) => {
  const token = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const userId = await verifySupabaseJwt(token, c.env.SUPABASE_URL);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);

  const { success: withinLimit } = await c.env.FORYOU_RATELIMIT.limit({ key: `share-room:${userId}` });
  if (!withinLimit) {
    return c.json({ error: 'rate limited' }, 429, { 'Retry-After': '60' });
  }

  if (Number(c.req.header('content-length') ?? '0') > SHARE_ROOM_BODY_MAX_BYTES) {
    return c.json({ error: 'body too large' }, 413);
  }
  let body: unknown;
  try {
    const text = await c.req.text();
    if (text.length > SHARE_ROOM_BODY_MAX_BYTES) return c.json({ error: 'body too large' }, 413);
    body = JSON.parse(text);
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }

  const result = validateShareRoomBody(body);
  if (!result.ok) return c.json({ error: result.error }, 400);

  try {
    const client = createServiceRoleClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
    // Snapshots are permanent public pages with no unshare (D2), so cap what
    // one account can publish per day on top of the per-minute limit.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if ((await countSharedRoomsSince(client, userId, since)) >= SHARE_ROOM_DAILY_CAP) {
      return c.json({ error: 'daily share limit reached' }, 429, { 'Retry-After': '3600' });
    }
    const id = await insertSharedRoom(client, userId, result.value);
    const payload: ShareRoomResponse = { id, url: sharedRoomUrl(id) };
    return c.json(payload, 201);
  } catch (err) {
    // Generic body: postgrest messages can leak schema names (LOW-1).
    console.error('[share-room] insert failed:', err);
    return c.json({ error: 'internal error' }, 500);
  }
});

// POST /v1/growth/events — app-side growth telemetry (Growth S2, migration
// 090). Anonymous by default: a Bearer Supabase JWT, when present and valid,
// sets user_id; an absent or expired token records the event without one
// rather than losing it. user_id is never read from the body. Rate limited on
// the body's install id (GROWTH_RATELIMIT), falling back to the client IP, so
// malformed bodies are limited too. The native app sends no Origin, so the
// CORS allow-list above is unchanged.
app.post(GROWTH_EVENTS_PATH, async (c) => {
  // The declared length gates the read; without one the whole body would be
  // buffered before any check (sweep, security 3). Every app client sends it.
  const declaredLength = c.req.header('content-length');
  if (declaredLength === undefined) return c.json({ error: 'content-length required' }, 411);
  if (Number(declaredLength) > GROWTH_EVENT_BODY_MAX_BYTES) {
    return c.json({ error: 'body too large' }, 413);
  }
  let body: unknown;
  let parsed = true;
  try {
    const text = await c.req.text();
    if (text.length > GROWTH_EVENT_BODY_MAX_BYTES) return c.json({ error: 'body too large' }, 413);
    body = JSON.parse(text);
  } catch {
    parsed = false;
  }

  // Two buckets: per install (or IP when the body has no id) and, always,
  // per IP, so rotating install ids cannot escape a budget (sweep, security 2).
  const clientIp = c.req.header('cf-connecting-ip');
  const [installLimit, ipLimit] = await Promise.all([
    c.env.GROWTH_RATELIMIT.limit({ key: rateLimitKey(body, clientIp) }),
    c.env.GROWTH_IP_RATELIMIT.limit({ key: `ip:${clientIp || 'unknown'}` }),
  ]);
  if (!installLimit.success || !ipLimit.success) {
    return c.json({ error: 'rate limited' }, 429, { 'Retry-After': '60' });
  }
  if (!parsed) return c.json({ error: 'invalid json' }, 400);

  const result = validateGrowthEventBody(body);
  if (!result.ok) return c.json({ error: result.error }, 400);

  const token = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const userId = token ? await verifySupabaseJwt(token, c.env.SUPABASE_URL) : null;

  try {
    const client = createServiceRoleClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
    await insertGrowthEvent(client, { ...result.value, user_id: userId });
    return c.body(null, 204);
  } catch (err) {
    // Generic body: postgrest messages can leak schema names (LOW-1).
    console.error('[growth-events] insert failed:', err);
    return c.json({ error: 'internal error' }, 500);
  }
});

// ── Server-side For You render (PLAT-3) ──────────────────────────────
// GET /v1/foryou?services=netflix,prime&hour=20&dow=4
// Authorization: Bearer <supabase user JWT> (verified against JWKS).
// Response: ForYouPayload — byte-compatible with the retired Edge
// function, including the scored pool for client-side slider re-ranks.
// Per-user content: never CDN/Cache-API cached (W3 adds a KV feed
// cache keyed on user + taste freshness instead).
const MAX_SERVICES = 20;
// Canonical UK service ids (src/components/platformLogos.ts ServiceId).
// Membership-checked, not just shape-checked: unknown ids would mint
// unlimited KV cache keys and force a full render per request - the
// security review's cost-amplification vector (PLAT-3 hardening).
const VALID_SERVICE_IDS = new Set([
  'netflix', 'prime', 'apple', 'disney', 'now',
  'skygo', 'paramount', 'bbc', 'itvx', 'channel4',
  'hbo', 'discovery', 'crunchyroll', 'mubi', 'plutotv',
]);

// ── Add-on channels (IN-SC-004, migration 086) ───────────────────────
// `channels=shudder,mgm_plus` carries the non-standalone channels a user
// holds; channels that are standalone services (hbo, paramount …) arrive in
// `services` and need no new ids above. Channel ids are data — the curated
// `service_addons` registry, editable without a release — so they are
// checked against the registry rather than a list here: a malformed or
// oversized list is a 400, an id the registry does not know is dropped
// (never keyed, never queried), so a registry addition can't break an older
// Worker. Registry read failure fails closed to "no channels".
const CHANNEL_REGISTRY_TTL_MS = 10 * 60 * 1000;
const CHANNEL_REGISTRY_RETRY_MS = 60 * 1000;
let channelRegistryCache: { rows: ChannelRegistryRow[]; expiresAt: number } | null = null;

async function getChannelRegistry(
  client: Parameters<typeof fetchChannelRegistry>[0],
): Promise<ChannelRegistryRow[]> {
  const now = Date.now();
  if (channelRegistryCache && channelRegistryCache.expiresAt > now) return channelRegistryCache.rows;
  try {
    const rows = await fetchChannelRegistry(client);
    channelRegistryCache = { rows, expiresAt: now + CHANNEL_REGISTRY_TTL_MS };
    return rows;
  } catch (err) {
    console.error('[channels] registry read failed:', err);
    const rows = channelRegistryCache?.rows ?? [];
    channelRegistryCache = { rows, expiresAt: now + CHANNEL_REGISTRY_RETRY_MS };
    return rows;
  }
}
// 20 min — mid-range of the brief's 15–30. Stale-feed worst case is one
// TTL; vector-moving interactions bust earlier via the key timestamp.
// ⚠ C3 COUPLING: ORDERING_BUCKET_MINUTES (src/lib/recommendations-v2/
// weights.ts) must match this. The per-open ordering seed advances on
// that bucket and is deliberately NOT in the cache key, so a cached
// payload carries its bucket's order and the feed re-orders exactly when
// this TTL expires. Change one and you must change the other, or the feed
// either stops varying or varies invisibly.
const FORYOU_CACHE_TTL_SECONDS = 20 * 60;
// Available-ids KV cache (finding 4): the user-independent
// get_available_tmdb_ids RPC (~130KB full-table DISTINCT) keyed on the
// sorted service combo, shared across all users. 10 min — service
// catalogues shift slowly; a stale entry only over-/under-includes a
// title for one TTL, and the render's other filters still apply.
const AVAILABLE_IDS_CACHE_TTL_SECONDS = 10 * 60;

// Module-scoped single-flight map for /v1/foryou renders (finding 3).
// Lives for the isolate's lifetime; keyed on the same string as the KV
// feed cache. Coalesces concurrent misses for one user+taste+services so
// a stampede runs one pgvector render, not N.
const foryouInflight = new Map<string, Promise<string>>();
const homeInflight = new Map<string, Promise<string>>();

app.get('/v1/foryou', async (c) => {
  const servicesRaw = c.req.query('services') ?? '';
  // Normalise case ONCE and use the normalised ids everywhere below:
  // validation was case-insensitive but the KV cache key and the DB
  // service_id filters received raw case — `Netflix` minted a separate
  // per-user cache entry and silently matched nothing in the DB
  // (pre-launch review 2026-07-12). Dedup for the same reason.
  const services = servicesRaw
    ? [...new Set(servicesRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))]
    : [];
  if (services.length > MAX_SERVICES) {
    return c.json({ error: `services exceeds ${MAX_SERVICES}` }, 400);
  }
  if (services.some((s) => !VALID_SERVICE_IDS.has(s))) {
    return c.json({ error: 'unknown service id' }, 400);
  }
  const channelsRequested = parseChannelsParam(c.req.query('channels'));
  if (channelsRequested === null) {
    return c.json({ error: 'too many channels' }, 400);
  }

  const parseBoundedInt = (raw: string | undefined, max: number): number | undefined | null => {
    if (raw == null || raw === '') return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > max) return null;
    return n;
  };
  const hourOfDay = parseBoundedInt(c.req.query('hour'), 23);
  if (hourOfDay === null) return c.json({ error: 'hour must be integer 0..23' }, 400);
  const dayOfWeek = parseBoundedInt(c.req.query('dow'), 6);
  if (dayOfWeek === null) return c.json({ error: 'dow must be integer 0..6' }, 400);

  const token = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const userId = await verifySupabaseJwt(token, c.env.SUPABASE_URL);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);

  // LAUNCH-1 W1 (IN-PX-60): rate limit AFTER auth, keyed on the verified
  // userId — so the budget can't be burned on another user's behalf, and
  // the 401 above already shed unauthenticated load for free. 429 before
  // any Supabase/pgvector cost. The client treats 429 as a worker
  // failure → its existing fallback chain, so a human never sees a cliff;
  // at 30/min sustained it's automation, not a person.
  const { success: withinLimit } = await c.env.FORYOU_RATELIMIT.limit({ key: userId });
  if (!withinLimit) {
    return c.json({ error: 'rate limited' }, 429, { 'Retry-After': '60' });
  }

  const client = createServiceRoleClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const scope = withUserScope(client, userId);

  try {
    // Feed cache (brief §7.2-3). The cache KEY needs only
    // taste_vector_updated_at + the sliders, so read just those (finding
    // 5) — the full profile, incl. the 1536-dim vector, is fetched lazily
    // on a miss where the render actually needs it. On a hit (the common
    // case) we never pull the vector over the wire. An interaction that
    // moves the vector bumps updated_at and busts the entry naturally.
    const [keyFields, registry] = await Promise.all([
      getTasteProfileKeyFieldsScoped(scope),
      getChannelRegistry(client),
    ]);
    const channels = knownChannelIds(registry, channelsRequested);
    const channelTokens = channelTokensFor(registry, services, channels);
    const cacheKey = buildFeedCacheKey(userId, keyFields.updatedAt, keyFields.sliders, services, channels);

    const cached = await c.env.FORYOU_CACHE.get(cacheKey, 'text');
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': 'application/json', 'x-videx-cache': 'hit' },
      });
    }

    // Cross-user KV cache for the available-ids RPC (finding 4). Reads
    // synchronously (blocks the filter build); writes fire-and-forget via
    // waitUntil so populating never blocks the render.
    const availableIdsCache: TmdbIdsCache = {
      async get(key) {
        const raw = await c.env.FORYOU_CACHE.get(key, 'json');
        return Array.isArray(raw) ? (raw as number[]) : null;
      },
      put(key, ids) {
        c.executionCtx.waitUntil(
          c.env.FORYOU_CACHE.put(key, JSON.stringify(ids), {
            expirationTtl: AVAILABLE_IDS_CACHE_TTL_SECONDS,
          }),
        );
        return Promise.resolve();
      },
    };

    // Single-flight the render (finding 3): concurrent misses for the
    // same key share one pgvector pass instead of stampeding.
    const { promise, leader } = coalesce(foryouInflight, cacheKey, async () => {
      // Lazy full profile read — only on a genuine miss.
      const profile = await getV2TasteProfileScoped(scope);
      const payload: ForYouPayload = await renderForYou(
        client,
        scope,
        {
          services,
          channelTokens,
          hourOfDay,
          dayOfWeek,
          userAgent: c.req.header('user-agent'),
          profile,
        },
        { availableIdsCache },
      );
      // Review 2026-09-09, remainder 5: the Worker never logged how long a
      // cold render took, so the MMR cap (k=36 -> 20) had to be sized on a
      // local bench. One structured line per genuine miss makes the next
      // such question answerable from `wrangler tail` / Workers Logs. No
      // user id: the x-videx-cache header already tells miss from hit.
      console.log(
        JSON.stringify({
          event: 'foryou_render',
          renderMs: payload.renderMs,
          services: services.length,
          channels: channels.length,
          rows: payload.recommendedForYou.length,
          interleaved: payload.pool?.interleaved ?? false,
        }),
      );
      const body = JSON.stringify(payload);
      // Don't cache the no-taste-vector empty payload — the user is mid
      // onboarding and a 20-minute-stale empty feed is the worst outcome.
      if (profile?.tasteVector) {
        c.executionCtx.waitUntil(
          c.env.FORYOU_CACHE.put(cacheKey, body, { expirationTtl: FORYOU_CACHE_TTL_SECONDS }),
        );
      }
      return body;
    });

    const body = await promise;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'x-videx-cache': leader ? 'miss' : 'coalesced',
      },
    });
  } catch (err) {
    // Log the real error; return a generic body - postgrest messages
    // can leak table/column/constraint names (security review LOW-1).
    console.error('[foryou] uncaught error:', err);
    return c.json({ error: 'internal error' }, 500);
  }
});

// ── Home aggregator (B5) ──────────────────────────────────────────────
//
// One endpoint doing Home's orchestration server-side, the treatment
// /v1/foryou already had. Home was making ~15-20 round trips per uncached
// load from the device (~10 TMDb through the proxy, ~9 Supabase); this
// collapses them to one.
//
// Cached like the feed, but keyed differently: Home is not personalised by
// the taste vector (only the genre spotlights use selected clusters), so
// the key is services + clusters rather than taste_vector_updated_at.
const HOME_CACHE_TTL_SECONDS = 10 * 60;

app.get('/v1/home', async (c) => {
  const servicesRaw = c.req.query('services') ?? '';
  // Same normalise-once discipline as /v1/foryou: case and duplicates are
  // folded before the ids reach either the cache key or a DB filter.
  const services = servicesRaw
    ? [...new Set(servicesRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))]
    : [];
  if (services.length > MAX_SERVICES) {
    return c.json({ error: `services exceeds ${MAX_SERVICES}` }, 400);
  }
  if (services.some((s) => !VALID_SERVICE_IDS.has(s))) {
    return c.json({ error: 'unknown service id' }, 400);
  }
  const channelsRequested = parseChannelsParam(c.req.query('channels'));
  if (channelsRequested === null) {
    return c.json({ error: 'too many channels' }, 400);
  }

  const token = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const userId = await verifySupabaseJwt(token, c.env.SUPABASE_URL);
  if (!userId) return c.json({ error: 'unauthorized' }, 401);

  // Rate limit AFTER auth on the verified userId, sharing /v1/foryou's
  // budget: a Home render costs the same class of work, and the two are
  // never issued in a tight loop by a real session.
  const { success: withinLimit } = await c.env.FORYOU_RATELIMIT.limit({ key: userId });
  if (!withinLimit) {
    return c.json({ error: 'rate limited' }, 429, { 'Retry-After': '60' });
  }

  const client = createServiceRoleClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const scope = withUserScope(client, userId);

  try {
    // Clusters are needed for the cache key AND the spotlights, so read the
    // profile before deciding on a cache hit. It is one small row.
    const [profile, registry] = await Promise.all([
      getV2TasteProfileScoped(scope),
      getChannelRegistry(client),
    ]);
    const clusters = profile?.selectedClusters ?? [];
    const channels = knownChannelIds(registry, channelsRequested);
    const channelTokens = channelTokensFor(registry, services, channels);

    const cacheKey = buildHomeCacheKey(userId, services, clusters, channels);
    const cached = await c.env.FORYOU_CACHE.get(cacheKey, 'text');
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': 'application/json', 'x-videx-cache': 'hit' },
      });
    }

    // Single-flight, same reasoning as the feed: concurrent misses on one
    // key would otherwise each run the full ~15-call orchestration.
    const { promise, leader } = coalesce(homeInflight, cacheKey, async () => {
      const payload = await renderHome(
        { client, scope, tmdb: createTmdbServerClient(c.env.TMDB_API_KEY) },
        {
          services,
          providerIds: serviceIdsToProviderIds(services as ServiceId[]),
          freeProviderIds: serviceIdsToProviderIds(FREE_UK_SERVICES as ServiceId[]),
          selectedClusters: clusters,
          channelTokens,
        },
      );
      const body = JSON.stringify(payload);
      // Don't cache an empty Home — a user mid-onboarding with no services
      // would otherwise get a blank shelf pinned for the full TTL.
      const hasContent =
        payload.rows.length > 0 ||
        payload.recentlyAdded.length > 0 ||
        payload.popular.length > 0;
      if (hasContent) {
        c.executionCtx.waitUntil(
          c.env.FORYOU_CACHE.put(cacheKey, body, { expirationTtl: HOME_CACHE_TTL_SECONDS }),
        );
      }
      return body;
    });

    const body = await promise;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'x-videx-cache': leader ? 'miss' : 'coalesced',
      },
    });
  } catch (err) {
    // Log the real error, return a generic body — postgrest messages can
    // leak table/column names (security review LOW-1).
    console.error('[home] uncaught error:', err);
    return c.json({ error: 'internal error' }, 500);
  }
});

// ── Allowlisted TMDb passthrough ──────────────────────────────────────
app.get('/v1/tmdb/*', async (c) => {
  const path = c.req.path.replace(/^\/v1\/tmdb\//, '');
  const ttl = matchTmdbPath(path);
  if (ttl === null) {
    return c.json({ error: 'path not allowed' }, 404);
  }

  const params = sanitiseParams(new URL(c.req.url).searchParams);
  const cacheUrl = `https://cache.videx/v1/tmdb/${path}?${params.toString()}`;

  return withEdgeCache(c, cacheUrl, ttl, async () => {
    params.set('api_key', c.env.TMDB_API_KEY);
    const upstream = await fetch(`${TMDB_BASE}/${path}?${params.toString()}`);
    if (!upstream.ok) {
      return Response.json(
        { error: 'tmdb upstream error', status: upstream.status },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }
    return Response.json(await upstream.json());
  });
});

// ── Nightly stale-profile recompute (PLAT-3 W5) ──────────────────────
// Cron trigger (wrangler.toml [triggers], 04:00 UTC): the >24h taste
// recompute the client used to run at app launch, moved off the hot
// path per brief §7.2-4. Report lands in observability logs.
async function scheduled(
  _controller: ScheduledController,
  env: Env,
): Promise<void> {
  const client = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const report = await recomputeStaleProfiles(client);
  console.log(
    `[stale-recompute] scanned=${report.scanned} vectors=${report.vectorsRecomputed} `
    + `centroids=${report.centroidsRefreshed} skipped=${report.skipped} errors=${report.errors.length}`,
  );
  for (const e of report.errors) {
    console.error(`[stale-recompute] ${e.userId}: ${e.message}`);
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};
