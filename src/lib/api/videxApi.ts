/**
 * videx-api Worker client (PLAT-2).
 *
 * fetchMergedTitle: ONE request to the Worker's /v1/title/:type/:id —
 * TMDb detail (credits, external_ids, watch/providers appended) merged
 * with OMDB ratings server-side, CDN-cached 24h. Replaces the client's
 * two-leg TMDb + OMDB sequence on the detail page.
 *
 * When VITE_API_PROXY_URL is unset (rollback lever), the same shape is
 * composed client-side from the direct TMDb + OMDB clients, so the
 * consuming hook has exactly one code path.
 */

import { getMovieDetails, getTVDetails } from './tmdb';
import { getRatings, parseOmdbBody, type RatingsData, type OmdbRawBody } from './omdb';
import type { TMDbDetailResponse } from '../adapters/detailAdapter';
import { env } from '../env';

const PROXY_URL = env.API_PROXY_URL;

/** TMDb detail fields the detail pipeline reads beyond the adapter's view. */
export interface MergedTitleTmdb extends TMDbDetailResponse {
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  genres?: Array<{ id: number; name: string }>;
  genre_ids?: number[];
}

export interface MergedTitle {
  tmdb: MergedTitleTmdb;
  /** Parsed ratings — null when no IMDb id exists or OMDB had nothing. */
  ratings: RatingsData | null;
}

export async function fetchMergedTitle(
  mediaType: 'movie' | 'tv',
  tmdbId: number,
): Promise<{ success: boolean; data: MergedTitle | null; error?: string }> {
  if (PROXY_URL) {
    try {
      const res = await fetch(`${PROXY_URL}/v1/title/${mediaType}/${tmdbId}`);
      if (!res.ok) {
        return {
          success: false,
          data: null,
          error: res.status === 404 ? 'Content not found' : `Proxy error ${res.status}`,
        };
      }
      const body = (await res.json()) as { tmdb: MergedTitleTmdb; omdb: OmdbRawBody | null };
      return {
        success: true,
        data: {
          tmdb: body.tmdb,
          ratings: body.omdb ? parseOmdbBody(body.omdb) : null,
        },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : 'Proxy request failed',
      };
    }
  }

  // Direct-mode fallback: compose the same shape client-side.
  const detailFn = mediaType === 'movie' ? getMovieDetails : getTVDetails;
  const detailRes = await detailFn(tmdbId);
  if (!detailRes.success || !detailRes.data) {
    return { success: false, data: null, error: 'Content not found' };
  }
  const tmdb = detailRes.data as MergedTitleTmdb;

  let ratings: RatingsData | null = null;
  const imdbId = tmdb.external_ids?.imdb_id || tmdb.imdb_id || null;
  if (imdbId) {
    const omdbRes = await getRatings(imdbId, mediaType);
    if (omdbRes.success) ratings = omdbRes.data;
  }

  return { success: true, data: { tmdb, ratings } };
}
