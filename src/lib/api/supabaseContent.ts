/**
 * Supabase Content Queries
 * Reads cached streaming availability and deep links from Supabase.
 * Data is populated by the sync script (scripts/sync-content.ts).
 */

import { supabase } from '../supabase';
import { getCachedData, setCachedData, CACHE_PREFIXES } from './cache';
import { saServiceToServiceId } from '../adapters/platformAdapter';
import type { ServiceId } from '@/components/platformLogos';

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
