import axios from 'axios';
import { getCachedData, setCachedData, createOMDbCacheKey } from './apiQueryCache';

const BASE_URL = 'https://www.omdbapi.com/';
// PLAT-2 commit 6: OMDB key removed from client code — ratings come
// through the Worker's /v1/title merge; this direct path survives only
// as the proxy-unset fallback and degrades to no-ratings without a key.
const DEBUG = __DEV__;
const USE_CACHE = true;

const omdbClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

/** Minimal axios-error shape — only the fields this handler reads. */
interface OMDbAxiosError {
  response?: { status: number; data?: { Error?: string } };
  request?: unknown;
  message?: string;
}

const handleOMDbError = (error: unknown): Error => {
  const err = error as OMDbAxiosError;
  if (err.response) {
    const { status, data } = err.response;
    const message = data?.Error || 'OMDb API error';
    switch (status) {
      case 401: return new Error('Invalid OMDb API key. Please check your configuration.');
      case 404: return new Error('Movie/show not found in OMDb database.');
      default: return new Error(`OMDb API Error: ${message}`);
    }
  } else if (err.request) {
    return new Error('Network error. Please check your internet connection.');
  }
  return new Error(err.message || 'An unexpected error occurred.');
};

export interface RatingsData {
  imdbRating: string | null;
  rottenTomatoes: number | null;
  imdbVotes: string | null;
  metacritic: string | null;
  rawRatings: Array<{ Source: string; Value: string }>;
}

export const getRatings = async (imdbId: string, type = 'movie'): Promise<{ success: boolean; data: RatingsData; error?: string }> => {
  try {
    if (!imdbId) throw new Error('IMDb ID is required');

    if (USE_CACHE) {
      const cacheKey = createOMDbCacheKey(imdbId);
      const cached = await getCachedData(cacheKey);
      if (cached) return { success: true, data: cached as RatingsData };
    }

    if (DEBUG) console.log('[OMDb Request] GET', { imdbId, type });

    const response = await omdbClient.get('/', {
      params: { i: imdbId, type },
    });

    if (response.data.Response === 'False') {
      throw new Error(response.data.Error || 'Not found');
    }

    const ratingsData: RatingsData = parseOmdbBody(response.data);

    if (USE_CACHE) {
      const cacheKey = createOMDbCacheKey(imdbId);
      await setCachedData(cacheKey, ratingsData);
    }

    return { success: true, data: ratingsData };
  } catch (error) {
    const enhancedError = handleOMDbError(error);
    console.error('[OMDb Error]', enhancedError.message);
    return {
      success: false,
      error: enhancedError.message,
      data: { imdbRating: null, rottenTomatoes: null, imdbVotes: null, metacritic: null, rawRatings: [] },
    };
  }
};

/** Raw OMDB body fields this module reads. */
export interface OmdbRawBody {
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
}

/**
 * Parse a raw OMDB response body into RatingsData. Shared by the direct
 * getRatings path and the PLAT-2 proxy path (the Worker's /v1/title
 * returns the raw OMDB body; the client owns parsing).
 */
export const parseOmdbBody = (body: OmdbRawBody): RatingsData => {
  const ratings = body.Ratings || [];
  return {
    imdbRating: body.imdbRating && body.imdbRating !== 'N/A' ? body.imdbRating : null,
    rottenTomatoes: getRottenTomatoesScore(ratings),
    imdbVotes: body.imdbVotes || null,
    metacritic: body.Metascore && body.Metascore !== 'N/A' ? body.Metascore : null,
    rawRatings: ratings,
  };
};

export const getRottenTomatoesScore = (ratings: Array<{ Source: string; Value: string }>): number | null => {
  if (!ratings || !Array.isArray(ratings)) return null;
  const rtRating = ratings.find((r) => r.Source === 'Rotten Tomatoes');
  if (!rtRating?.Value) return null;
  const match = rtRating.Value.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : null;
};

export const getIMDbScore = (ratings: Array<{ Source: string; Value: string }>): number | null => {
  if (!ratings || !Array.isArray(ratings)) return null;
  const imdbRating = ratings.find((r) => r.Source === 'Internet Movie Database');
  if (!imdbRating?.Value) return null;
  const match = imdbRating.Value.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
};
