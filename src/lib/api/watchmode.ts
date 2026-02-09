import axios from 'axios';
import { getCachedData, setCachedData } from './cache';
import { logError, ErrorType } from '../utils/errorHandler';
import { normalizePlatformName } from '../constants/platforms';

const BASE_URL = 'https://api.watchmode.com/v1';
const API_KEY = import.meta.env.VITE_WATCHMODE_API_KEY;
const DEBUG = __DEV__;
const USE_CACHE = true;
const WATCHMODE_CACHE_PREFIX = 'watchmode_';
const WATCHMODE_CACHE_TTL = 24 * 60 * 60 * 1000;

const watchmodeClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

watchmodeClient.interceptors.request.use(
  (config) => {
    if (DEBUG) console.log('[WatchMode Request]', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => Promise.reject(error)
);

watchmodeClient.interceptors.response.use(
  (response) => {
    if (DEBUG) console.log('[WatchMode Response]', response.config.url, 'Status:', response.status);
    return response;
  },
  (error) => Promise.reject(handleWatchModeError(error))
);

const handleWatchModeError = (error: any) => {
  let enhancedError: any;
  if (error.response) {
    const { status, data } = error.response;
    const message = data?.statusMessage || 'WatchMode API error';
    switch (status) {
      case 401: enhancedError = new Error('Invalid WatchMode API key.'); enhancedError.code = ErrorType.AUTHENTICATION; break;
      case 404: enhancedError = new Error('Title not found in WatchMode.'); enhancedError.code = ErrorType.API; break;
      case 429: enhancedError = new Error('WatchMode rate limit exceeded.'); enhancedError.code = ErrorType.RATE_LIMIT; break;
      default: enhancedError = new Error(`WatchMode API Error: ${message}`); enhancedError.code = ErrorType.API;
    }
    enhancedError.status = status;
  } else if (error.request) {
    enhancedError = new Error('Network error connecting to WatchMode.'); enhancedError.code = ErrorType.NETWORK;
  } else {
    enhancedError = new Error(error.message || 'An unexpected error occurred.'); enhancedError.code = ErrorType.UNKNOWN;
  }
  logError(enhancedError, 'WatchMode API');
  return enhancedError;
};

const createWatchModeCacheKey = (tmdbId: number, type: string) => `${WATCHMODE_CACHE_PREFIX}${type}_${tmdbId}`;

const getWatchModeTitleId = async (tmdbId: number, type: string): Promise<number | null> => {
  try {
    const searchField = type === 'tv' ? 'tmdb_tv_id' : 'tmdb_movie_id';
    const searchType = type === 'tv' ? 'tv' : 'movie';
    const response = await watchmodeClient.get('/search/', {
      params: { apiKey: API_KEY, search_field: searchField, search_value: tmdbId, types: searchType },
    });
    if (response.data?.title_results?.length > 0) return response.data.title_results[0].id;
    return null;
  } catch {
    return null;
  }
};

interface SourceInfo {
  name: string;
  sourceId: number;
  type: string;
  format: string;
  price: number | null;
  webUrl: string;
  isFree?: boolean;
}

const processSourcesData = (sources: any[]) => {
  const rentOptions: SourceInfo[] = [];
  const buyOptions: SourceInfo[] = [];
  const subscriptionOptions: SourceInfo[] = [];

  sources.forEach((source) => {
    const platformInfo: SourceInfo = {
      name: normalizePlatformName(source.name),
      sourceId: source.source_id,
      type: source.type,
      format: source.format,
      price: source.price ? parseFloat(source.price) : null,
      webUrl: source.web_url,
    };

    switch (source.type) {
      case 'rent': rentOptions.push(platformInfo); break;
      case 'buy': buyOptions.push(platformInfo); break;
      case 'sub': subscriptionOptions.push(platformInfo); break;
      case 'free': subscriptionOptions.push({ ...platformInfo, isFree: true }); break;
    }
  });

  const groupByPlatform = (options: SourceInfo[]) => {
    const grouped: Record<string, SourceInfo> = {};
    options.forEach((opt) => {
      const key = opt.name;
      if (!grouped[key] || (opt.price && opt.price < (grouped[key].price ?? Infinity))) {
        grouped[key] = opt;
      }
    });
    return Object.values(grouped);
  };

  return { rent: groupByPlatform(rentOptions), buy: groupByPlatform(buyOptions), subscription: subscriptionOptions, allSources: sources };
};

export const getTitleSources = async (tmdbId: number, type = 'movie', region = 'GB') => {
  try {
    const cacheKey = createWatchModeCacheKey(tmdbId, type);
    if (USE_CACHE) {
      const cached = await getCachedData(cacheKey, WATCHMODE_CACHE_TTL);
      if (cached) return { success: true, data: cached };
    }

    const watchmodeId = await getWatchModeTitleId(tmdbId, type);
    if (!watchmodeId) return { success: false as const, data: null, error: 'Title not found' };

    const response = await watchmodeClient.get(`/title/${watchmodeId}/sources/`, {
      params: { apiKey: API_KEY, regions: region },
    });

    if (response.data) {
      const processed = processSourcesData(response.data);
      if (USE_CACHE) await setCachedData(cacheKey, processed);
      return { success: true as const, data: processed };
    }
    return { success: false as const, data: null };
  } catch (error: any) {
    return { success: false as const, data: null, error: error.message };
  }
};

export const getTitlePrices = async (tmdbId: number, type = 'movie') => {
  const result = await getTitleSources(tmdbId, type);
  if (!result.success || !result.data) return null;
  return { rent: result.data.rent, buy: result.data.buy };
};

export const formatPrice = (price: number | null, currency = '£'): string | null => {
  if (price === null || price === undefined) return null;
  return `${currency}${price.toFixed(2)}`;
};
