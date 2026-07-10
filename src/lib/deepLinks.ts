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
 * Coarse platform hint. Native callers pass their `Platform.OS`; web
 * callers omit it (treated as 'web'). Kept as a plain string union so
 * this shared module never has to import react-native — it must bundle
 * under Vite for the web app too.
 */
export type DeepLinkPlatform = 'ios' | 'android' | 'web';

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

// Services where the SA API exact deep link should be discarded in favour
// of the service search URL, keyed by platform.
//
// Prime Video (beta feedback 2026-07-09 revisit):
//  - Android: amazon.co.uk URLs open the Shopping app, not Prime Video,
//    and no reliable detail-page deep-link format exists for the Prime
//    Video Android app — so we force the search fallback (unchanged).
//  - iOS: primevideo.com/watch Universal Links ARE reliable — they open
//    the Prime Video app on a device that has it installed, and fall back
//    to the web player otherwise. So iOS uses the exact SA link.
//  - web: the browser opens the exact link directly; no fallback needed.
//
// A service listed here for a platform is forced to search on that
// platform only. Platforms not listed keep the exact link.
const FORCE_SEARCH_FALLBACK: Record<DeepLinkPlatform, Set<ServiceId>> = {
  android: new Set<ServiceId>(['prime']),
  ios: new Set<ServiceId>(),
  web: new Set<ServiceId>(),
};

/**
 * Get the deep link for a title on a specific service.
 * Prefers the exact SA API link if available, otherwise falls back to
 * a service search URL. `platform` gates the per-service force-fallback
 * list (Prime falls back on Android only) — defaults to 'web'.
 */
export function getDeepLink(
  serviceId: ServiceId,
  saLink: string | null | undefined,
  title: string,
  year?: number,
  platform: DeepLinkPlatform = 'web'
): DeepLinkResult {
  if (saLink && !FORCE_SEARCH_FALLBACK[platform].has(serviceId)) {
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
