/**
 * Deep Link Utility
 * Resolves the best URL for opening a title on a streaming service.
 * Prefers SA API exact deep links, falls back to service search URLs.
 */

import type { ServiceId } from '@/lib/types/content';

export interface DeepLinkResult {
  url: string;
  type: 'exact' | 'search';
}

/**
 * Build a Channel 4 /programmes/ slug from title + year.
 * Channel 4 uses lowercase kebab-case with year suffix for movies.
 * e.g. "Predator" (1987) → "predator-1987"
 */
function buildChannel4Slug(title: string, year?: number): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return year ? `${slug}-${year}` : slug;
}

const SEARCH_FALLBACKS: Record<string, (title: string, year?: number) => string> = {
  netflix: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  prime: (t) => `https://www.primevideo.com/search?phrase=${encodeURIComponent(t)}`,
  apple: (t) => `https://tv.apple.com/gb/search?term=${encodeURIComponent(t)}`,
  disney: (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`,
  now: (t) => `https://www.nowtv.com/watch/search?q=${encodeURIComponent(t)}`,
  skygo: (t) => `https://www.google.com/search?q=${encodeURIComponent(t)}+site:sky.com`,
  paramount: (t) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`,
  bbc: (t) => `https://www.bbc.co.uk/iplayer/search?q=${encodeURIComponent(t)}`,
  itvx: (t) => `https://www.itv.com/watch/search?q=${encodeURIComponent(t)}`,
  channel4: (t, y) => `https://www.channel4.com/programmes/${buildChannel4Slug(t, y)}`,
};

// Services where SA API deep links don't work on Android and should use
// the search fallback instead. Amazon Prime Video's amazon.co.uk URLs open
// the Shopping app, not Prime Video — and no reliable detail page deep link
// format exists for the Prime Video app.
const FORCE_SEARCH_FALLBACK = new Set<ServiceId>(['prime']);

/**
 * Get the deep link for a title on a specific service.
 * Prefers the exact SA API link if available, otherwise falls back to search URL.
 */
export function getDeepLink(
  serviceId: ServiceId,
  saLink: string | null | undefined,
  title: string,
  year?: number
): DeepLinkResult {
  if (saLink && !FORCE_SEARCH_FALLBACK.has(serviceId)) {
    return { url: saLink, type: 'exact' };
  }

  const fallback = SEARCH_FALLBACKS[serviceId];
  if (fallback) {
    return { url: fallback(title, year), type: 'search' };
  }

  // Last resort: Google search
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(title)}+watch+online`,
    type: 'search',
  };
}
