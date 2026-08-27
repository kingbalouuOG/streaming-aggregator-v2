/**
 * Minimal server-side TMDb client — B5.
 *
 * WHY THIS EXISTS RATHER THAN REUSING `lib/api/tmdb.ts`.
 *
 * The client TMDb module cannot run server-side. PLAT-2 commit 6 removed
 * the API key from client code entirely — reads go through the Worker's
 * `/v1/tmdb` allowlisted passthrough, which injects the key. Its own
 * comment calls direct mode "a keyless degraded path". It is also bound
 * to axios and a localStorage-backed response cache, neither of which
 * belongs in a Worker.
 *
 * The Worker could have called its own `/v1/tmdb` proxy over loopback and
 * reused the client module unchanged, but that turns every Home render
 * into ~8 extra self-requests to avoid writing 60 lines.
 *
 * So: plain `fetch`, explicit key, only the four endpoints the Home render
 * actually needs.
 *
 * ⚠ PAIRED WITH `lib/api/tmdb.ts`. The two are separate implementations of
 * the same upstream calls, and the response shape here deliberately mimics
 * axios (`{ data: { results } }`) so the row builders read identically on
 * both paths. If a TMDb request shape changes on one side, change it on
 * the other — a drift here shows up as Home quietly differing between the
 * Worker render and the client fallback.
 */

const TMDB_BASE = 'https://api.themoviedb.org/3';

/** Mirrors the axios envelope the client module returns, so row builders
 *  moved from the client path need no reshaping. */
export interface TmdbServerResponse<T = unknown> {
  data: { results: T[] } | null;
}

export type TmdbDiscoverParams = Record<string, string | number | undefined>;

export interface TmdbServerClient {
  discoverMovies<T = unknown>(params: TmdbDiscoverParams): Promise<TmdbServerResponse<T>>;
  discoverTV<T = unknown>(params: TmdbDiscoverParams): Promise<TmdbServerResponse<T>>;
  getTrendingMovies<T = unknown>(window?: 'day' | 'week'): Promise<TmdbServerResponse<T>>;
  getTrendingTV<T = unknown>(window?: 'day' | 'week'): Promise<TmdbServerResponse<T>>;
}

/** Requests that outlive this are worth abandoning: Home has other rows to
 *  render and one slow upstream must not hold the whole payload. */
const REQUEST_TIMEOUT_MS = 8000;

export function createTmdbServerClient(apiKey: string): TmdbServerClient {
  async function get<T>(path: string, params: TmdbDiscoverParams = {}): Promise<TmdbServerResponse<T>> {
    const url = new URL(`${TMDB_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    url.searchParams.set('api_key', apiKey);

    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        // A 401 here means the same dead-credential class of failure that
        // froze the catalogue for 79 days, so name it explicitly rather
        // than folding it into a generic warning.
        if (res.status === 401 || res.status === 403) {
          console.error(
            `[tmdbServer] TMDb rejected the credential (HTTP ${res.status}) on ${path}. ` +
            'TMDB_API_KEY is missing, revoked, or is a v4 read token in a v3 api_key slot.',
          );
        } else {
          console.error(`[tmdbServer] TMDb ${res.status} on ${path}`);
        }
        return { data: null };
      }
      const json = (await res.json()) as { results?: T[] };
      return { data: { results: json.results ?? [] } };
    } catch (err) {
      // Never throw: one failed row must degrade to an empty row, not to a
      // failed Home render.
      console.error(
        `[tmdbServer] ${path} failed:`,
        err instanceof Error ? err.message : String(err),
      );
      return { data: null };
    }
  }

  return {
    discoverMovies: (params) => get('/discover/movie', params),
    discoverTV: (params) => get('/discover/tv', params),
    getTrendingMovies: (window = 'week') => get(`/trending/movie/${window}`),
    getTrendingTV: (window = 'week') => get(`/trending/tv/${window}`),
  };
}
