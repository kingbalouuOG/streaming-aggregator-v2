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

type Env = {
  TMDB_API_KEY: string;
  OMDB_API_KEY: string;
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
