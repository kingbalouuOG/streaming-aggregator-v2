/**
 * Application Configuration Constants
 * Centralized configuration for the Videx app
 */

export const DEFAULT_REGION = 'GB';

export const API_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_BATCH_SIZE: 10,
  DEBOUNCE_DELAY_MS: 300,
  THROTTLE_DELAY_MS: 500,
};

export const CACHE_CONFIG = {
  MAX_ENTRIES: 1000,
  TMDB_TTL_HOURS: 24,
  OMDB_TTL_DAYS: 7,
  WATCHMODE_TTL_HOURS: 24,
};

export const SPECIAL_GENRE_IDS = {
  DOCUMENTARY: 99,
};

export const SORT_OPTIONS = {
  POPULARITY_DESC: 'popularity.desc',
  VOTE_AVERAGE_DESC: 'vote_average.desc',
  RELEASE_DATE_DESC: 'release_date.desc',
  FIRST_AIR_DATE_DESC: 'first_air_date.desc',
};

export const MIN_VOTE_COUNT = 100;

export const CONTENT_TYPES = {
  ALL: 'all',
  MOVIES: 'movies',
  TV: 'tv',
  DOCUMENTARIES: 'documentaries',
};

export const COST_FILTERS = {
  ALL: 'all',
  FREE: 'free',
  PAID: 'paid',
};
