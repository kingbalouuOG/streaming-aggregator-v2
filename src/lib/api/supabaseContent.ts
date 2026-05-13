/**
 * Supabase Content Queries
 * Reads cached streaming availability and deep links from Supabase.
 * Data is populated by the sync script (scripts/sync-content.ts).
 */

import { supabase } from '../supabase';
import { getCachedData, setCachedData, CACHE_PREFIXES } from './cache';
import { saServiceToServiceId } from '../adapters/platformAdapter';
import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import { buildPosterUrl, buildBackdropUrl } from './tmdb';
import { GENRE_NAMES } from '../constants/genres';
import { isoToLanguageName } from '../adapters/contentAdapter';

export interface StreamingLink {
  serviceId: ServiceId;
  saServiceId: string;
  streamType: 'subscription' | 'rent' | 'buy' | 'free' | 'addon';
  deepLinkUrl: string;
  videoLinkUrl?: string;
  quality?: string;
  priceFormatted?: string;
  expiresSoon?: boolean;
}

/**
 * Fetch streaming links for a title from Supabase.
 * Returns an array of StreamingLink objects with deep link URLs.
 */
export async function getStreamingLinks(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<StreamingLink[]> {
  // Check client-side cache first (24h TTL via SA prefix)
  const cacheKey = `${CACHE_PREFIXES.SA}links_${tmdbId}_${mediaType}`;
  const cached = await getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from('streaming_availability')
      .select('service_id, sa_service_id, stream_type, deep_link_url, video_link_url, quality, price_amount, price_currency, price_formatted, expires_soon')
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .order('stream_type', { ascending: true });

    if (error || !data) return [];

    const result = data
      .map((row: any) => {
        const serviceId = saServiceToServiceId(row.sa_service_id) || row.service_id;
        return {
          serviceId: serviceId as ServiceId,
          saServiceId: row.sa_service_id,
          streamType: row.stream_type,
          deepLinkUrl: row.deep_link_url,
          videoLinkUrl: row.video_link_url || undefined,
          quality: row.quality === 'default' ? undefined : row.quality,
          priceFormatted: row.price_amount != null
            ? `£${parseFloat(row.price_amount).toFixed(2)}`
            : undefined,
          expiresSoon: row.expires_soon || false,
        };
      })
      .filter((link: StreamingLink) => !!link.serviceId);

    if (result.length > 0) await setCachedData(cacheKey, result);
    return result;
  } catch {
    return [];
  }
}

/**
 * Cheapest rent/buy price for a title, formatted as "From £X.XX".
 *
 * Queries `streaming_availability` for any rent/buy entries with a
 * known price and returns the lowest, formatted. Returns null when
 * the title has no rent/buy availability OR no price data (some
 * SA rows record availability without a concrete price).
 *
 * Used on the search results grid to surface the "From £X.XX" pill
 * for off-service titles that are still actionable. Caching follows
 * the existing SA prefix (24h TTL) so a re-search of the same title
 * doesn't re-query.
 */
export async function getRentBuyPrice(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<{ fromFormatted: string } | null> {
  const cacheKey = `${CACHE_PREFIXES.SA}rentbuy_${tmdbId}_${mediaType}`;
  const cached = await getCachedData(cacheKey);
  // The cache stores `{ fromFormatted: string } | { absent: true }`;
  // both branches are cache hits and skip the Supabase round-trip.
  if (cached) {
    return 'absent' in cached ? null : cached;
  }

  try {
    const { data, error } = await supabase
      .from('streaming_availability')
      .select('price_amount, price_formatted, price_currency, stream_type')
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .in('stream_type', ['rent', 'buy'])
      .not('price_amount', 'is', null)
      .order('price_amount', { ascending: true })
      .limit(1);

    if (error || !data || data.length === 0) {
      await setCachedData(cacheKey, { absent: true });
      return null;
    }

    const row: any = data[0];
    const label = row.price_formatted
      ? `From ${row.price_formatted}`
      : `From £${parseFloat(row.price_amount).toFixed(2)}`;
    const result = { fromFormatted: label };
    await setCachedData(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Substring search against the Postgres `titles` cache.
 *
 * Companion to TMDb `/search/movie` + `/search/tv`. TMDb tokenises the
 * query by word boundary and ignores anything that isn't a whole-word
 * prefix — so "salt" never finds "Saltburn". The Postgres cache covers
 * ~20K UK-available titles and we own the matching logic here, which
 * lets us paper over the gap for compound-word titles, slightly-mis-
 * spelled queries, and partial recall on franchise titles.
 *
 * Returns the same `ContentItem` shape as `tmdbMovieToContentItem` so
 * callers can merge the two sources by `id` and re-rank uniformly.
 *
 * Soft cap at 20 rows — anything more is noise; the user is better
 * served by typing more characters. Empty `services` array left in
 * place; per-item TMDb /watch/providers fills it in like the TMDb
 * path does.
 */
export async function searchTitlesByText(
  query: string,
  limit = 20,
): Promise<ContentItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const { data, error } = await supabase
      .from('titles')
      .select('tmdb_id, media_type, title, overview, release_year, poster_path, backdrop_path, genre_ids, vote_average, vote_count, popularity, original_language, runtime')
      .ilike('title', `%${q}%`)
      .order('popularity', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error || !data) return [];

    return data
      .filter((row: any) => row.media_type === 'movie' || row.media_type === 'tv')
      .map((row: any) => {
        const genreIds: number[] = Array.isArray(row.genre_ids) ? row.genre_ids : [];
        const isDoc = row.media_type === 'movie' && genreIds.includes(99);
        return {
          id: `${row.media_type}-${row.tmdb_id}`,
          title: row.title || 'Untitled',
          image: buildPosterUrl(row.poster_path) || '',
          backdrop: buildBackdropUrl(row.backdrop_path, 'w780') || undefined,
          services: [] as ServiceId[],
          rating: row.vote_average ?? undefined,
          year: row.release_year ?? undefined,
          type: row.media_type === 'tv' ? 'tv' : isDoc ? 'doc' : 'movie',
          genre: genreIds[0] != null ? GENRE_NAMES[genreIds[0]] : undefined,
          overview: row.overview || undefined,
          language: row.original_language ? isoToLanguageName(row.original_language) : undefined,
          genreIds,
          originalLanguage: row.original_language ?? undefined,
          popularity: row.popularity ?? undefined,
          voteCount: row.vote_count ?? undefined,
          runtime: row.runtime ?? undefined,
        } as ContentItem;
      });
  } catch {
    return [];
  }
}
