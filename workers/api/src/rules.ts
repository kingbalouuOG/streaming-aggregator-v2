/**
 * Videx API proxy — pure routing/caching rules (PLAT-2).
 *
 * No I/O, no Workers APIs — unit-tested from the root vitest rig. The
 * Hono app composes these; keeping them pure is the same discipline as
 * interestPools/interestGrouping in the engine.
 *
 * Allowlist philosophy (plan Q4): the proxy exposes exactly the TMDb
 * read surface the client uses — nothing else forwards. Key injection
 * happens in the app layer; these rules only decide ALLOWED + TTL.
 */

const HOUR = 3600;
const DAY = 24 * HOUR;

export interface PassthroughRule {
  pattern: RegExp;
  /** CDN/browser cache lifetime in seconds (s-maxage + SWR window). */
  ttlSeconds: number;
}

/**
 * Allowlisted TMDb GET paths (relative, no leading slash) with per-class
 * TTLs. Order matters only for readability — patterns are disjoint.
 */
export const TMDB_PASSTHROUGH_RULES: PassthroughRule[] = [
  // Volatile, query-shaped reads
  { pattern: /^discover\/(movie|tv)$/, ttlSeconds: HOUR },
  { pattern: /^search\/(movie|tv|multi)$/, ttlSeconds: HOUR },
  { pattern: /^trending\/(all|movie|tv)\/(day|week)$/, ttlSeconds: HOUR },
  // Per-title reads — stable for a day (matches the client's 24h tier)
  { pattern: /^(movie|tv)\/\d+$/, ttlSeconds: DAY },
  { pattern: /^(movie|tv)\/\d+\/(similar|recommendations)$/, ttlSeconds: DAY },
  // Availability shifts intra-day
  { pattern: /^(movie|tv)\/\d+\/watch\/providers$/, ttlSeconds: 6 * HOUR },
  // Near-static
  { pattern: /^configuration$/, ttlSeconds: 7 * DAY },
];

/** TTL for the merged /v1/title endpoint. */
export const TITLE_TTL_SECONDS = DAY;

/**
 * Match a relative TMDb path against the allowlist.
 * Returns the TTL when allowed, null otherwise.
 */
export function matchTmdbPath(path: string): number | null {
  for (const rule of TMDB_PASSTHROUGH_RULES) {
    if (rule.pattern.test(path)) return rule.ttlSeconds;
  }
  return null;
}

/**
 * Cache-Control for a proxied response: CDN-cached for ttl, allowed to
 * serve stale for one more ttl window while revalidating (the brief's
 * s-maxage + SWR shape). Browsers get a short max-age — the client's
 * TanStack Query layer is the binding client-side cache, not HTTP.
 */
export function cacheControlFor(ttlSeconds: number): string {
  return `public, max-age=60, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds}`;
}

/**
 * Sanitise forwarded query params: strip any client-supplied credential
 * keys (the Worker injects its own) and anything non-TMDb.
 */
export function sanitiseParams(params: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (k === 'api_key' || k === 'apikey' || k === 'session_id') continue;
    out.append(k, v);
  }
  out.sort();
  return out;
}

/** Validate the /v1/title path params. */
export function isValidTitleRequest(type: string, id: string): type is 'movie' | 'tv' {
  return (type === 'movie' || type === 'tv') && /^\d+$/.test(id) && Number(id) > 0;
}
