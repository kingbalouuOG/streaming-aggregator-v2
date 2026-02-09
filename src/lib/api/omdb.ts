import axios from 'axios';
import { getCachedData, setCachedData, createOMDbCacheKey } from './cache';

const BASE_URL = 'http://www.omdbapi.com/';
const API_KEY = import.meta.env.VITE_OMDB_API_KEY;
const DEBUG = __DEV__;
const USE_CACHE = true;

const omdbClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

const handleOMDbError = (error: any): Error => {
  if (error.response) {
    const { status, data } = error.response;
    const message = data?.Error || 'OMDb API error';
    switch (status) {
      case 401: return new Error('Invalid OMDb API key. Please check your configuration.');
      case 404: return new Error('Movie/show not found in OMDb database.');
      default: return new Error(`OMDb API Error: ${message}`);
    }
  } else if (error.request) {
    return new Error('Network error. Please check your internet connection.');
  }
  return new Error(error.message || 'An unexpected error occurred.');
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
      if (cached) return { success: true, data: cached };
    }

    if (DEBUG) console.log('[OMDb Request] GET', { imdbId, type });

    const response = await omdbClient.get('/', {
      params: { i: imdbId, apikey: API_KEY, type },
    });

    if (response.data.Response === 'False') {
      throw new Error(response.data.Error || 'Not found');
    }

    const ratings = response.data.Ratings || [];
    const ratingsData: RatingsData = {
      imdbRating: response.data.imdbRating !== 'N/A' ? response.data.imdbRating : null,
      rottenTomatoes: getRottenTomatoesScore(ratings),
      imdbVotes: response.data.imdbVotes || null,
      metacritic: response.data.Metascore !== 'N/A' ? response.data.Metascore : null,
      rawRatings: ratings,
    };

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
