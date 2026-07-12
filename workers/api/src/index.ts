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
 * Caching: caches.default keyed on the normalised request URL; the
 * Cache-Control written by cacheControlFor() drives both the Worker
 * cache and Cloudflare's CDN tier. Failures are never cached.
 */

import { Hono } from 'hono';
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
import { renderResetBridgePage, TOKEN_HASH_RE } from './resetBridge';
import {
  platformBucket,
  renderTitlePage,
  renderTitleNotFoundPage,
  SHARE_SERVICE_LABELS,
  type TitlePageData,
} from './titlePage';
// Bundled as text (wrangler [[rules]] Text rule) — the single source of
// truth for the hosted /privacy + /terms pages is docs/legal/*.md.
import privacyMd from '../../../docs/legal/privacy-policy.md';
import termsMd from '../../../docs/legal/terms-of-service.md';
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
import { buildFeedCacheKey, coalesce } from './foryouCache';

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
};

/** Cloudflare rate-limit binding surface (the `limit()` runtime API). */
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com';

// Public web origin for canonical/og:url on shared pages. Pinned (not
// request-derived) so workers.dev requests canonicalise to the real domain.
const CANONICAL_ORIGIN = 'https://videxstreaming.com';

const app = new Hono<{ Bindings: Env }>();

// Capacitor WebView origins (Android https://localhost, iOS
// capacitor://localhost) + the Vite dev server.
app.use(
  '*',
  cors({
    origin: ['https://localhost', 'capacitor://localhost', 'http://localhost:3000'],
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
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Content-Security-Policy', "frame-ancestors 'none'");
}

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
app.get('/reset', (c) => {
  c.header('Cache-Control', 'private, no-store');
  c.header('Referrer-Policy', 'no-referrer');
  htmlSecurityHeaders(c);
  const tokenHash = c.req.query('token_hash') ?? '';
  const type = c.req.query('type') === 'recovery' ? 'recovery' : '';
  if (!TOKEN_HASH_RE.test(tokenHash) || !type) {
    return c.html(renderResetBridgePage(null), 400);
  }
  const appUrl = `videx://reset-password?token_hash=${tokenHash}&type=${type}`;
  return c.html(renderResetBridgePage(appUrl));
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

// ── Public share / SEO title page (H0 Stream B — Share v1) ───────────
// GET /t/:type/:tmdbId — a minimal, crawlable, server-rendered
// "where to watch X in the UK" page. Rendered from the Supabase content
// cache (titles + streaming_availability), OG-tagged for link unfurls,
// carrying store links + an "Open in Videx" deep link. 24h CDN cache.
// This is the target of the native Share action AND the SEO seed.
const TITLE_PAGE_TTL_SECONDS = 24 * 60 * 60;

app.get('/t/:type/:tmdbId', async (c) => {
  const { type, tmdbId } = c.req.param();
  if (!isValidTitleRequest(type, tmdbId)) {
    return c.text('Not found', 404);
  }
  const id = Number(tmdbId);

  // Beta feedback 2026-07-09: the store CTA said "Get Videx on Android"
  // to iPhone visitors. Render is now UA-dependent, so the edge cache
  // key MUST vary by a coarse platform bucket — otherwise the first
  // visitor's platform sticks for all 24h. Three buckets → at most 3
  // cached variants per title (android|ios|other).
  const bucket = platformBucket(c.req.header('user-agent'));

  const resp = await withEdgeCache(
    c,
    `https://cache.videx/t/${type}/${id}?p=${bucket}`,
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
        return new Response(renderTitleNotFoundPage(bucket), {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "frame-ancestors 'none'",
          },
        });
      }

      // Distinct service labels, split by whether you can stream vs rent/buy.
      const subSet = new Set<string>();
      const rentBuySet = new Set<string>();
      for (const row of avail ?? []) {
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

      return new Response(renderTitlePage(type, id, data, CANONICAL_ORIGIN, bucket), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "frame-ancestors 'none'",
        },
      });
    },
  );
  return resp;
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
]);
// 20 min — mid-range of the brief's 15–30. Stale-feed worst case is one
// TTL; vector-moving interactions bust earlier via the key timestamp.
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
    const keyFields = await getTasteProfileKeyFieldsScoped(scope);
    const cacheKey = buildFeedCacheKey(userId, keyFields.updatedAt, keyFields.sliders, services);

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
          hourOfDay,
          dayOfWeek,
          userAgent: c.req.header('user-agent'),
          profile,
        },
        { availableIdsCache },
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
