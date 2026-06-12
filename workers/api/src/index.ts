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
// PLAT-3: the engine imports directly from src/lib — the
// wrangler-bundles-from-anywhere property that dissolves ADR-011.
import { renderForYou, type ForYouPayload } from '../../../src/lib/server/foryouRender';
import {
  createServiceRoleClient,
  withUserScope,
} from '../../../src/lib/server/userScope';
import { getV2TasteProfileScoped } from '../../../src/lib/taste-v2/tasteProfileV2';

type Env = {
  TMDB_API_KEY: string;
  OMDB_API_KEY: string;
  /** Public project URL — wrangler.toml [vars]. */
  SUPABASE_URL: string;
  /** Worker secret (wrangler secret put). */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** PLAT-3 W3: per-user feed cache. */
  FORYOU_CACHE: KVNamespace;
};

const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com';

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

// ── Server-side For You render (PLAT-3) ──────────────────────────────
// GET /v1/foryou?services=netflix,prime&hour=20&dow=4
// Authorization: Bearer <supabase user JWT> (verified against JWKS).
// Response: ForYouPayload — byte-compatible with the retired Edge
// function, including the scored pool for client-side slider re-ranks.
// Per-user content: never CDN/Cache-API cached (W3 adds a KV feed
// cache keyed on user + taste freshness instead).
const MAX_SERVICES = 20;
const SERVICE_ID_RE = /^[a-z0-9_-]{1,32}$/i;
// 20 min — mid-range of the brief's 15–30. Stale-feed worst case is one
// TTL; vector-moving interactions bust earlier via the key timestamp.
const FORYOU_CACHE_TTL_SECONDS = 20 * 60;

app.get('/v1/foryou', async (c) => {
  const servicesRaw = c.req.query('services') ?? '';
  const services = servicesRaw
    ? servicesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  if (services.length > MAX_SERVICES) {
    return c.json({ error: `services exceeds ${MAX_SERVICES}` }, 400);
  }
  if (services.some((s) => !SERVICE_ID_RE.test(s))) {
    return c.json({ error: 'invalid service id' }, 400);
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

  const client = createServiceRoleClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const scope = withUserScope(client, userId);

  try {
    // Feed cache (brief §7.2-3). The profile read happens BEFORE the
    // cache lookup because the key embeds taste_vector_updated_at —
    // an interaction that moves the vector busts the entry naturally
    // (the embedding-cache invalidation trick, reused). Sliders are
    // hashed separately: slider saves don't bump the vector timestamp.
    const profile = await getV2TasteProfileScoped(scope);
    const s = profile?.sliders;
    const sliderHash = s
      ? `${s.catalogueAge}.${s.comfortZone}.${s.contentMix}.${s.variety}`
      : 'none';
    const cacheKey =
      `foryou:v1:${userId}:${profile?.updatedAt ?? 0}:${sliderHash}:${[...services].sort().join(',')}`;

    const cached = await c.env.FORYOU_CACHE.get(cacheKey, 'text');
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': 'application/json', 'x-videx-cache': 'hit' },
      });
    }

    const payload: ForYouPayload = await renderForYou(client, scope, {
      services,
      hourOfDay,
      dayOfWeek,
      userAgent: c.req.header('user-agent'),
      profile,
    });

    // Don't cache the no-taste-vector empty payload — the user is mid
    // onboarding and a 20-minute-stale empty feed is the worst outcome.
    const body = JSON.stringify(payload);
    if (profile?.tasteVector) {
      c.executionCtx.waitUntil(
        c.env.FORYOU_CACHE.put(cacheKey, body, { expirationTtl: FORYOU_CACHE_TTL_SECONDS }),
      );
    }
    return new Response(body, {
      headers: { 'Content-Type': 'application/json', 'x-videx-cache': 'miss' },
    });
  } catch (err) {
    console.error('[foryou] uncaught error:', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
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

export default app;
