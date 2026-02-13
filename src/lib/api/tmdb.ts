import axios from 'axios';
import { getCachedData, setCachedData, createTMDbCacheKey } from './cache';
import { logError, ErrorType } from '../utils/errorHandler';
import { networkNameToProviderId } from '../constants/platforms';

const BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

const DEBUG = __DEV__;
const USE_CACHE = true;

const tmdbClient = axios.create({
  baseURL: BASE_URL,
  params: { api_key: API_KEY },
  timeout: 10000,
});

tmdbClient.interceptors.request.use(
  (config) => {
    if (DEBUG) console.log('[TMDb Request]', config.method?.toUpperCase(), config.url, config.params);
    return config;
  },
  (error) => {
    if (DEBUG) console.error('[TMDb Request Error]', error);
    return Promise.reject(error);
  }
);

tmdbClient.interceptors.response.use(
  (response) => {
    if (DEBUG) console.log('[TMDb Response]', response.config.url, 'Status:', response.status);
    return response;
  },
  (error) => {
    if (DEBUG) console.error('[TMDb Response Error]', error.config?.url, error.response?.status, error.message);
    return Promise.reject(handleTMDbError(error));
  }
);

const handleTMDbError = (error: any) => {
  let enhancedError: any;

  if (error.response) {
    const { status, data } = error.response;
    const message = data?.status_message || 'TMDb API error';

    switch (status) {
      case 401:
        enhancedError = new Error('Invalid API key. Please check your TMDb API key configuration.');
        enhancedError.code = ErrorType.AUTHENTICATION;
        break;
      case 404:
        enhancedError = new Error('Resource not found.');
        enhancedError.code = ErrorType.API;
        break;
      case 429:
        enhancedError = new Error('Too many requests. Please try again later.');
        enhancedError.code = ErrorType.RATE_LIMIT;
        break;
      default:
        enhancedError = new Error(`TMDb API Error: ${message}`);
        enhancedError.code = ErrorType.API;
    }
    enhancedError.status = status;
  } else if (error.request) {
    enhancedError = new Error('Network error. Please check your internet connection.');
    enhancedError.code = ErrorType.NETWORK;
  } else {
    enhancedError = new Error(error.message || 'An unexpected error occurred.');
    enhancedError.code = ErrorType.UNKNOWN;
  }

  logError(enhancedError, 'TMDb API');
  return enhancedError;
};

// Generic cached request helper
async function cachedRequest<T>(
  cacheKeyName: string,
  cacheParams: Record<string, unknown>,
  requestFn: () => Promise<T>,
  fallbackData: T
): Promise<{ success: boolean; data: T; error?: string }> {
  try {
    if (USE_CACHE) {
      const cacheKey = createTMDbCacheKey(cacheKeyName, cacheParams);
      const cached = await getCachedData(cacheKey);
      if (cached) return { success: true, data: cached };
    }

    const data = await requestFn();

    if (USE_CACHE) {
      const cacheKey = createTMDbCacheKey(cacheKeyName, cacheParams);
      await setCachedData(cacheKey, data);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error(`TMDb Error:`, error.message);
    return { success: false, error: error.message, data: fallbackData };
  }
}

export const getConfiguration = () =>
  cachedRequest('configuration', {}, async () => {
    const response = await tmdbClient.get('/configuration');
    return response.data;
  }, null);

export const discoverMovies = (params: Record<string, unknown> = {}) => {
  const requestParams = { watch_region: 'GB', include_adult: false, sort_by: 'popularity.desc', ...params };
  return cachedRequest('discover_movie', requestParams, async () => {
    const response = await tmdbClient.get('/discover/movie', { params: requestParams });
    return response.data;
  }, { results: [] });
};

export const discoverTV = (params: Record<string, unknown> = {}) => {
  const requestParams = { watch_region: 'GB', include_adult: false, sort_by: 'popularity.desc', ...params };
  return cachedRequest('discover_tv', requestParams, async () => {
    const response = await tmdbClient.get('/discover/tv', { params: requestParams });
    return response.data;
  }, { results: [] });
};

export const getMovieDetails = (movieId: number) =>
  cachedRequest(`movie_${movieId}`, {}, async () => {
    const response = await tmdbClient.get(`/movie/${movieId}`, {
      params: { append_to_response: 'credits,watch/providers,external_ids' },
    });
    return response.data;
  }, null);

export const getTVDetails = (tvId: number) =>
  cachedRequest(`tv_${tvId}`, {}, async () => {
    const response = await tmdbClient.get(`/tv/${tvId}`, {
      params: { append_to_response: 'credits,watch/providers,external_ids' },
    });
    return response.data;
  }, null);

export const searchMulti = (query: string, page = 1) => {
  if (!query || query.trim() === '') {
    return Promise.resolve({ success: false, error: 'Search query is required', data: { results: [] } });
  }
  const requestParams = { query: query.trim(), page, include_adult: false };
  return cachedRequest('search_multi', requestParams, async () => {
    const response = await tmdbClient.get('/search/multi', { params: requestParams });
    return response.data;
  }, { results: [] });
};

export const getContentWatchProviders = async (contentId: number, mediaType = 'movie', region = 'GB') => {
  return cachedRequest(`${mediaType}_${contentId}_wp2`, { region }, async () => {
    const response = await tmdbClient.get(`/${mediaType}/${contentId}/watch/providers`);
    const regionData = response.data?.results?.[region] || {};
    const result = {
      flatrate: regionData.flatrate || [],
      rent: regionData.rent || [],
      buy: regionData.buy || [],
      free: regionData.free || [],
      ads: regionData.ads || [],
    };

    // Fallback: for TV with no streaming providers, try networks (production metadata)
    if (mediaType === 'tv' && !result.flatrate.length && !result.free.length && !result.ads.length) {
      try {
        const tvResponse = await tmdbClient.get(`/tv/${contentId}`);
        const networks = tvResponse.data?.networks || [];
        const networkProviders = networks
          .map((n: any) => networkNameToProviderId(n.name))
          .filter((id: number | null): id is number => id !== null)
          .map((id: number) => ({ provider_id: id }));
        if (networkProviders.length > 0) {
          result.flatrate = networkProviders;
        }
      } catch { /* network fallback is best-effort */ }
    }

    return result;
  }, { flatrate: [], rent: [], buy: [], free: [], ads: [] });
};

export const getSimilarMovies = (movieId: number, page = 1) =>
  cachedRequest(`movie_${movieId}_similar`, { page }, async () => {
    const response = await tmdbClient.get(`/movie/${movieId}/similar`, { params: { page } });
    return response.data;
  }, { results: [] });

export const getSimilarTV = (tvId: number, page = 1) =>
  cachedRequest(`tv_${tvId}_similar`, { page }, async () => {
    const response = await tmdbClient.get(`/tv/${tvId}/similar`, { params: { page } });
    return response.data;
  }, { results: [] });

export const getMovieRecommendations = (movieId: number, page = 1) =>
  cachedRequest(`movie_${movieId}_recommendations`, { page }, async () => {
    const response = await tmdbClient.get(`/movie/${movieId}/recommendations`, { params: { page } });
    return response.data;
  }, { results: [] });

export const getTVRecommendations = (tvId: number, page = 1) =>
  cachedRequest(`tv_${tvId}_recommendations`, { page }, async () => {
    const response = await tmdbClient.get(`/tv/${tvId}/recommendations`, { params: { page } });
    return response.data;
  }, { results: [] });

export const buildImageUrl = (path: string | null, size = 'w500'): string | null => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export const buildPosterUrl = (path: string | null, size = 'w342') => buildImageUrl(path, size);
export const buildBackdropUrl = (path: string | null, size = 'w1280') => buildImageUrl(path, size);
export const buildLogoUrl = (path: string | null, size = 'w92') => buildImageUrl(path, size);
