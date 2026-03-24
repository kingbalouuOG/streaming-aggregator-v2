/**
 * Detail Adapter
 * Maps TMDb detail responses + OMDB ratings + streaming pricing
 * to the DetailData interface used by DetailPage.tsx.
 */

import type { ServiceId } from '@/components/platformLogos';
import type { StreamingLink } from '../api/supabaseContent';
import { buildBackdropUrl, buildPosterUrl, buildImageUrl } from '../api/tmdb';
import { providerIdsToServiceIds, providerIdToServiceId } from './platformAdapter';
import { mapProviderIdToCanonical, normalizePlatformName, networkNameToProviderId } from '../constants/platforms';
import { isoToLanguageName } from './contentAdapter';

export interface CastMember {
  name: string;
  character: string;
  image: string;
}

export interface RentalOption {
  service: string;
  serviceKey: ServiceId;
  price: string;
  type: 'buy' | 'rent';
  deepLinkUrl?: string;
}

export interface ServiceLink {
  url: string;
  type: 'exact' | 'search';
}

export interface DetailData {
  id: string;
  title: string;
  heroImage: string;
  year: number;
  contentRating: string;
  imdbRating: number;
  rottenTomatoes: number;
  description: string;
  genres: string[];
  services: ServiceId[];
  allServices: ServiceId[];
  rentalOptions: RentalOption[];
  serviceLinks: Record<string, ServiceLink>;
  cast: CastMember[];
  runtime?: string;
  seasons?: number;
  language?: string;
  mediaType: 'movie' | 'tv';
}

/**
 * Try to resolve a provider name to a ServiceId.
 * Returns null for unrecognized services (not in our app).
 */
const NAME_TO_SERVICE_ID: Record<string, ServiceId> = {
  'netflix': 'netflix',
  'amazon prime video': 'prime', 'prime video': 'prime', 'amazon': 'prime', 'amazon video': 'prime',
  'apple tv+': 'apple', 'apple tv plus': 'apple', 'appletv': 'apple', 'apple tv': 'apple', 'apple itunes': 'apple',
  'disney+': 'disney', 'disney plus': 'disney',
  'now tv': 'now', 'now': 'now',
  'sky go': 'skygo', 'sky store': 'skygo',
  'paramount+': 'paramount', 'paramount plus': 'paramount',
  'bbc iplayer': 'bbc',
  'itvx': 'itvx',
  'channel 4': 'channel4', 'all 4': 'channel4',
};

function resolveServiceKey(providerName: string, providerId?: number): ServiceId | null {
  if (providerId) {
    const canonical = mapProviderIdToCanonical(providerId);
    const serviceId = providerIdToServiceId(canonical);
    if (serviceId) return serviceId;
  }
  // Fallback: try to match by name (case-insensitive)
  const normalized = normalizePlatformName(providerName).toLowerCase();
  return NAME_TO_SERVICE_ID[normalized] || null;
}

/**
 * Build a DetailData object from TMDb detail, OMDB ratings, and Supabase streaming links.
 * - TMDb watch/providers → service detection (all 10 UK services)
 * - streamingLinks (from Supabase/SA API) → deep link URLs + rent/buy pricing
 * - BBC iPlayer + Sky Go → search URL fallbacks (not in SA API)
 */
export function buildDetailData(
  tmdbDetail: any,
  mediaType: 'movie' | 'tv',
  omdbRatings?: any,
  streamingLinks?: StreamingLink[],
  userPlatformIds?: number[]
): DetailData {
  const id = `${mediaType}-${tmdbDetail.id}`;
  const title = tmdbDetail.title || tmdbDetail.name || 'Untitled';

  // Hero image
  const heroImage = buildBackdropUrl(tmdbDetail.backdrop_path) || buildPosterUrl(tmdbDetail.poster_path) || '';

  // Year
  const dateStr = tmdbDetail.release_date || tmdbDetail.first_air_date;
  const year = dateStr ? parseInt(dateStr.substring(0, 4), 10) : 0;

  // Genres
  const genres = (tmdbDetail.genres || []).map((g: any) => g.name);

  // Streaming services from watch/providers (flatrate + free + ads = "available to stream")
  const providers = tmdbDetail['watch/providers']?.results?.GB;
  const streamingProviders = [
    ...(providers?.flatrate || []),
    ...(providers?.free || []),
    ...(providers?.ads || []),
  ];
  const streamingIds = streamingProviders.map((p: any) => mapProviderIdToCanonical(p.provider_id));
  const allServices = providerIdsToServiceIds(streamingIds);

  // Fallback: if no streaming providers found for TV, use networks (production metadata)
  // This covers new content where JustWatch data hasn't propagated yet
  if (allServices.length === 0 && mediaType === 'tv' && tmdbDetail.networks?.length) {
    const seen = new Set<ServiceId>();
    for (const network of tmdbDetail.networks) {
      const pid = networkNameToProviderId(network.name);
      if (pid) {
        const sid = providerIdsToServiceIds([pid])[0];
        if (sid && !seen.has(sid)) {
          allServices.push(sid);
          seen.add(sid);
        }
      }
    }
  }

  // Filter "Available on" to only user's subscribed platforms
  const userServiceSet = userPlatformIds?.length
    ? new Set(providerIdsToServiceIds(userPlatformIds))
    : null;
  const services = userServiceSet
    ? allServices.filter((s) => userServiceSet.has(s))
    : allServices;

  // Ratings from OMDB
  const imdbRating = omdbRatings?.imdbRating ? parseFloat(omdbRatings.imdbRating) : (tmdbDetail.vote_average || 0);
  const rottenTomatoes = omdbRatings?.rottenTomatoes || 0;

  // Content rating / certification
  const contentRating = tmdbDetail.certification || (tmdbDetail.adult ? '18' : 'PG');

  // Cast from credits
  const cast: CastMember[] = (tmdbDetail.credits?.cast || []).slice(0, 20).map((member: any) => ({
    name: member.name,
    character: member.character || member.known_for_department || '',
    image: member.profile_path ? buildImageUrl(member.profile_path, 'w185') || '' : '',
  }));

  // ── Service links (deep link URLs from SA API, search fallbacks for BBC/Sky) ──
  const serviceLinks: Record<string, ServiceLink> = {};

  // Overlay SA API deep links for subscription/free services
  if (streamingLinks?.length) {
    for (const link of streamingLinks) {
      if ((link.streamType === 'subscription' || link.streamType === 'free') && link.deepLinkUrl) {
        // Only store the first (best quality) link per service
        if (!serviceLinks[link.serviceId]) {
          serviceLinks[link.serviceId] = { url: link.deepLinkUrl, type: 'exact' };
        }
      }
    }
  }

  // ── Rental options from SA API streaming links ──
  const flatrateServiceSet = new Set(allServices);
  const rentalOptions: RentalOption[] = [];

  if (streamingLinks?.length) {
    const seenRentBuy = new Set<string>();
    for (const link of streamingLinks) {
      if (link.streamType !== 'rent' && link.streamType !== 'buy') continue;
      const key = `${link.serviceId}-${link.streamType}`;
      if (seenRentBuy.has(key)) continue;
      seenRentBuy.add(key);

      if (!flatrateServiceSet.has(link.serviceId)) {
        rentalOptions.push({
          service: link.serviceId,
          serviceKey: link.serviceId,
          price: link.priceFormatted || (link.streamType === 'rent' ? 'Rent — check price' : 'Buy — check price'),
          type: link.streamType as 'rent' | 'buy',
          deepLinkUrl: link.deepLinkUrl,
        });
      }
    }
  }

  // Fallback to TMDb rent/buy labels if no SA API data
  if (rentalOptions.length === 0 && providers) {
    (providers.rent || []).forEach((p: any) => {
      const key = resolveServiceKey(p.provider_name, p.provider_id);
      if (key && !flatrateServiceSet.has(key)) {
        rentalOptions.push({
          service: p.provider_name,
          serviceKey: key,
          price: 'Rent — check price',
          type: 'rent',
        });
      }
    });
    (providers.buy || []).forEach((p: any) => {
      const key = resolveServiceKey(p.provider_name, p.provider_id);
      if (key && !flatrateServiceSet.has(key)) {
        rentalOptions.push({
          service: p.provider_name,
          serviceKey: key,
          price: 'Buy — check price',
          type: 'buy',
        });
      }
    });
  }

  // Runtime
  const runtime = mediaType === 'movie' && tmdbDetail.runtime
    ? `${Math.floor(tmdbDetail.runtime / 60)}h ${tmdbDetail.runtime % 60}m`
    : undefined;

  const seasons = mediaType === 'tv' ? tmdbDetail.number_of_seasons : undefined;

  const language = tmdbDetail.original_language ? isoToLanguageName(tmdbDetail.original_language) : undefined;

  return {
    id, title, heroImage, year, contentRating,
    imdbRating, rottenTomatoes, description: tmdbDetail.overview || '',
    genres, services, allServices, rentalOptions, serviceLinks, cast, runtime, seasons, language, mediaType,
  };
}
