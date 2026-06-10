/**
 * Streaming Availability API Client
 * Replaces WatchMode for streaming availability, deep links, and rent/buy pricing.
 * Uses Movie of the Night's SA API via RapidAPI.
 *
 * NOTE: The SA API key is server-side only (no VITE_ prefix).
 * This client is NOT used for direct client-side calls — the app reads from
 * Supabase instead. This module exists for:
 *   - Type definitions (SAShow, SAStreamingOption) shared across the codebase
 *   - Future Supabase Edge Function usage (server-side only)
 *
 * For initial population, the sync script (scripts/sync-content.ts) uses
 * its own fetch helpers with the key read directly from .env.
 */

import axios from 'axios';
import { getCachedData, setCachedData, CACHE_PREFIXES, CACHE_TTL } from './cache';
import { logError, ErrorType, type ErrorTypeValue } from '../utils/errorHandler';
import md5 from 'crypto-js/md5';

const SA_API_HOST = 'streaming-availability.p.rapidapi.com';
const BASE_URL = `https://${SA_API_HOST}`;

const DEBUG = __DEV__;
const USE_CACHE = true;

// SA API key is server-side only. For client-side usage, read from Supabase instead.
// This client is configured without a key — callers must provide it or use Supabase.
const saClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'X-RapidAPI-Host': SA_API_HOST,
  },
});

saClient.interceptors.request.use(
  (config) => {
    if (DEBUG) console.log('[SA Request]', config.method?.toUpperCase(), config.url, config.params);
    return config;
  },
  (error) => {
    if (DEBUG) console.error('[SA Request Error]', error);
    return Promise.reject(error);
  }
);

saClient.interceptors.response.use(
  (response) => {
    if (DEBUG) console.log('[SA Response]', response.config.url, 'Status:', response.status);
    return response;
  },
  (error) => {
    if (DEBUG) console.error('[SA Response Error]', error.config?.url, error.response?.status, error.message);
    return Promise.reject(handleSAError(error));
  }
);

/** Minimal axios-error shape — only the fields this handler reads. */
interface SAAxiosError {
  response?: { status: number; data?: { message?: string } };
  request?: unknown;
  message?: string;
}

/** Error enriched with classification code + HTTP status for errorHandler. */
interface EnhancedSAError extends Error {
  code?: ErrorTypeValue;
  status?: number;
}

const handleSAError = (error: SAAxiosError) => {
  let enhancedError: EnhancedSAError;

  if (error.response) {
    const { status, data } = error.response;
    const message = data?.message || 'Streaming Availability API error';

    switch (status) {
      case 401:
      case 403:
        enhancedError = new Error('Invalid SA API key. Check your RapidAPI key configuration.');
        enhancedError.code = ErrorType.AUTHENTICATION;
        break;
      case 404:
        enhancedError = new Error('Title not found in SA API.');
        enhancedError.code = ErrorType.API;
        break;
      case 429:
        enhancedError = new Error('SA API rate limit exceeded. Please try again later.');
        enhancedError.code = ErrorType.RATE_LIMIT;
        break;
      default:
        enhancedError = new Error(`SA API Error: ${message}`);
        enhancedError.code = ErrorType.API;
    }
    enhancedError.status = status;
  } else if (error.request) {
    enhancedError = new Error('Network error connecting to SA API.');
    enhancedError.code = ErrorType.NETWORK;
  } else {
    enhancedError = new Error(error.message || 'An unexpected error occurred.');
    enhancedError.code = ErrorType.UNKNOWN;
  }

  logError(enhancedError, 'SA API');
  return enhancedError;
};

// ── Cache helpers ──────────────────────────────────────

const createSACacheKey = (endpoint: string, params: Record<string, unknown> = {}): string => {
  const paramsHash = md5(JSON.stringify(
    Object.keys(params).sort().reduce((acc: Record<string, unknown>, key) => {
      acc[key] = params[key];
      return acc;
    }, {})
  )).toString();
  return `${CACHE_PREFIXES.SA}${endpoint}_${paramsHash}`;
};

async function cachedRequest<T>(
  cacheKeyName: string,
  cacheParams: Record<string, unknown>,
  requestFn: () => Promise<T>,
  fallbackData: T
): Promise<{ success: boolean; data: T; error?: string }> {
  try {
    if (USE_CACHE) {
      const cacheKey = createSACacheKey(cacheKeyName, cacheParams);
      const cached = await getCachedData(cacheKey, CACHE_TTL.SA);
      if (cached) return { success: true, data: cached };
    }

    const data = await requestFn();

    if (USE_CACHE) {
      const cacheKey = createSACacheKey(cacheKeyName, cacheParams);
      await setCachedData(cacheKey, data);
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('SA API Error:', message);
    return { success: false, error: message, data: fallbackData };
  }
}

// ── Type definitions ──────────────────────────────────────

export interface SAStreamingOption {
  service: {
    id: string;
    name: string;
    homePage: string;
    imageSet: Record<string, string>;
  };
  type: 'subscription' | 'rent' | 'buy' | 'free' | 'addon';
  link: string;
  videoLink?: string;
  quality?: string;
  audios?: Array<{ language: string }>;
  subtitles?: Array<{ language: string }>;
  expiresSoon?: boolean;
  expiresOn?: number;
  availableSince?: number;
  price?: {
    amount: string;
    currency: string;
    formatted: string;
  };
  addon?: {
    id: string;
    name: string;
    homePage: string;
    imageSet: Record<string, string>;
  };
}

export interface SAShow {
  itemType: string;
  showType: 'movie' | 'series';
  id: string;
  imdbId: string;
  tmdbId: string;
  title: string;
  overview: string;
  releaseYear: number;
  genres: Array<{ id: string; name: string }>;
  directors?: Array<{ name: string }>;
  cast?: Array<{ name: string }>;
  rating?: number;
  runtime?: number;
  imageSet?: Record<string, Record<string, string>>;
  streamingOptions: Record<string, SAStreamingOption[]>;
}

// ── API functions ──────────────────────────────────────

/**
 * Fetch a single show by IMDb or TMDb ID.
 * SA API accepts IMDb IDs directly (e.g. "tt2442560")
 * or TMDb IDs in format "movie/238" or "tv/1396".
 */
export const fetchShowAvailability = (id: string, country = 'gb') =>
  cachedRequest<SAShow | null>(`show_${id}`, { country }, async () => {
    const response = await saClient.get(`/shows/${encodeURIComponent(id)}`, {
      params: { country },
    });
    return response.data;
  }, null);

/**
 * Fetch availability for a title using TMDb ID and media type.
 * Constructs the SA API ID format: "movie/{tmdbId}" or "tv/{tmdbId}".
 */
export const fetchAvailabilityByTmdbId = (tmdbId: number, mediaType: 'movie' | 'tv', country = 'gb') => {
  const saType = mediaType === 'tv' ? 'series' : 'movie';
  const saId = `${saType}/${tmdbId}`;
  return fetchShowAvailability(saId, country);
};

/**
 * Fetch catalogue changes (new, updated, removed, expiring, upcoming).
 * Used for daily incremental sync.
 */
export const fetchCatalogueChanges = (
  country: string,
  changeType: 'new' | 'updated' | 'removed' | 'expiring' | 'upcoming',
  catalogs: string,
  options: {
    itemType?: 'show' | 'season' | 'episode';
    from?: number;
    cursor?: string;
  } = {}
) =>
  cachedRequest(`changes_${changeType}`, { country, catalogs, ...options }, async () => {
    const params: Record<string, string> = {
      country,
      change_type: changeType,
      item_type: options.itemType || 'show',
      catalogs,
    };
    if (options.from) params.from = options.from.toString();
    if (options.cursor) params.cursor = options.cursor;

    const response = await saClient.get('/changes', { params });
    return response.data as {
      changes: Array<{ changeType: string; show: SAShow; timestamp: number }>;
      hasMore: boolean;
      nextCursor?: string;
    };
  }, { changes: [], hasMore: false });

/**
 * Search/filter shows by catalogue and country.
 * Used for initial database population.
 */
export const searchShowsByFilters = (
  country: string,
  options: {
    catalogs?: string;
    showType?: 'movie' | 'series';
    genres?: string;
    orderBy?: string;
    cursor?: string;
  } = {}
) =>
  cachedRequest('search_filters', { country, ...options }, async () => {
    const params: Record<string, string> = { country };
    if (options.catalogs) params.catalogs = options.catalogs;
    if (options.showType) params.show_type = options.showType;
    if (options.genres) params.genres = options.genres;
    if (options.orderBy) params.order_by = options.orderBy;
    if (options.cursor) params.cursor = options.cursor;

    const response = await saClient.get('/shows/search/filters', { params });
    return response.data as {
      shows: SAShow[];
      hasMore: boolean;
      nextCursor?: string;
    };
  }, { shows: [], hasMore: false });
