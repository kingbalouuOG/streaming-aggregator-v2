/**
 * Content Adapter
 * Maps TMDb API responses to the UI's ContentItem interface.
 */

import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import { buildPosterUrl } from '../api/tmdb';
import { GENRE_NAMES } from '../constants/genres';

const ISO_TO_LANGUAGE: Record<string, string> = {
  en: "English", ja: "Japanese", ko: "Korean", es: "Spanish",
  fr: "French", de: "German", hi: "Hindi", it: "Italian",
  tr: "Turkish", da: "Danish", no: "Norwegian", sv: "Swedish",
  pt: "Portuguese", zh: "Chinese", th: "Thai", pl: "Polish",
  nl: "Dutch", ru: "Russian", ar: "Arabic",
};

export function isoToLanguageName(code: string): string | undefined {
  return ISO_TO_LANGUAGE[code];
}

/**
 * Convert a TMDb movie object to a ContentItem.
 * Services are left empty — lazy-loaded per card via serviceCache.
 */
export function tmdbMovieToContentItem(movie: any): ContentItem {
  return {
    id: `movie-${movie.id}`,
    title: movie.title || 'Untitled',
    image: buildPosterUrl(movie.poster_path) || '',
    services: [] as ServiceId[],
    rating: movie.vote_average ?? undefined,
    year: movie.release_date ? parseInt(movie.release_date.substring(0, 4), 10) : undefined,
    type: movie.genre_ids?.includes(99) ? 'doc' : 'movie',
    language: movie.original_language ? ISO_TO_LANGUAGE[movie.original_language] : undefined,
    genreIds: movie.genre_ids || [],
    originalLanguage: movie.original_language || undefined,
  };
}

/**
 * Convert a TMDb TV show object to a ContentItem.
 * Services are left empty — lazy-loaded per card via serviceCache.
 */
export function tmdbTVToContentItem(tvShow: any): ContentItem {
  return {
    id: `tv-${tvShow.id}`,
    title: tvShow.name || tvShow.title || 'Untitled',
    image: buildPosterUrl(tvShow.poster_path) || '',
    services: [] as ServiceId[],
    rating: tvShow.vote_average ?? undefined,
    year: tvShow.first_air_date ? parseInt(tvShow.first_air_date.substring(0, 4), 10) : undefined,
    type: tvShow.genre_ids?.includes(99) ? 'doc' : 'tv',
    language: tvShow.original_language ? ISO_TO_LANGUAGE[tvShow.original_language] : undefined,
    genreIds: tvShow.genre_ids || [],
    originalLanguage: tvShow.original_language || undefined,
  };
}

/**
 * Convert a TMDb search result (multi) to a ContentItem.
 * Handles both movie and TV results.
 */
export function tmdbSearchResultToContentItem(result: any): ContentItem {
  const mediaType = result.media_type || (result.title ? 'movie' : 'tv');
  if (mediaType === 'movie') {
    return tmdbMovieToContentItem(result);
  }
  return tmdbTVToContentItem(result);
}

/**
 * Parse a ContentItem id back to its TMDb components.
 * e.g., "movie-12345" → { tmdbId: 12345, mediaType: "movie" }
 */
export function parseContentItemId(id: string): { tmdbId: number; mediaType: 'movie' | 'tv' } {
  const [type, numericId] = id.split('-');
  return {
    tmdbId: parseInt(numericId, 10),
    mediaType: type as 'movie' | 'tv',
  };
}

/**
 * Convert a watchlist item (stored with TMDb metadata) to a ContentItem.
 */
export function watchlistItemToContentItem(item: any): ContentItem {
  return {
    id: `${item.type}-${item.id}`,
    title: item.metadata?.title || 'Unknown',
    image: buildPosterUrl(item.metadata?.posterPath) || '',
    services: [] as ServiceId[],
    rating: item.metadata?.voteAverage ?? undefined,
    year: item.metadata?.releaseDate ? parseInt(item.metadata.releaseDate.substring(0, 4), 10) : undefined,
    type: item.type === 'tv' ? 'tv' : (item.metadata?.genreIds?.includes(99) ? 'doc' : 'movie'),
    addedAt: item.addedAt ?? undefined,
    runtime: item.metadata?.runtime ?? undefined,
    genre: item.metadata?.genreIds?.[0] ? GENRE_NAMES[item.metadata.genreIds[0]] : undefined,
    genreIds: item.metadata?.genreIds || [],
    originalLanguage: item.metadata?.originalLanguage || undefined,
  };
}

/**
 * Get genre display names from genre IDs.
 */
export function genreIdsToNames(genreIds: number[]): string[] {
  return genreIds
    .map((id) => GENRE_NAMES[id])
    .filter(Boolean);
}
