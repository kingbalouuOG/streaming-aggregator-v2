/**
 * Platform Adapter
 * Bidirectional mapping between TMDb provider IDs (numbers),
 * SA API service slugs (strings), and the UI's ServiceId strings.
 */

import type { ServiceId } from '@/lib/types/content';
import { mapProviderIdToCanonical } from '../constants/platforms';

// TMDb provider_id → ServiceId
const TMDB_TO_SERVICE_ID: Record<number, ServiceId> = {
  8: 'netflix',
  9: 'prime',
  350: 'apple',
  337: 'disney',
  39: 'now',
  29: 'skygo',
  582: 'paramount',
  38: 'bbc',
  54: 'itvx',
  103: 'channel4',
};

// ServiceId → TMDb provider_id
const SERVICE_ID_TO_TMDB: Record<ServiceId, number> = {
  netflix: 8,
  prime: 9,
  apple: 350,
  disney: 337,
  now: 39,
  skygo: 29,
  paramount: 582,
  bbc: 38,
  itvx: 54,
  channel4: 103,
};

/**
 * Convert a TMDb provider ID to a ServiceId string.
 * Handles variant IDs (e.g., 591 → NOW → "now").
 */
export function providerIdToServiceId(providerId: number): ServiceId | null {
  const canonical = mapProviderIdToCanonical(providerId);
  return TMDB_TO_SERVICE_ID[canonical] ?? null;
}

/**
 * Convert a ServiceId string to a TMDb provider ID.
 */
export function serviceIdToProviderId(serviceId: ServiceId): number {
  return SERVICE_ID_TO_TMDB[serviceId];
}

/**
 * Convert an array of TMDb provider IDs to ServiceId strings.
 * Filters out unmapped providers.
 */
export function providerIdsToServiceIds(providerIds: number[]): ServiceId[] {
  const result: ServiceId[] = [];
  const seen = new Set<ServiceId>();
  for (const id of providerIds) {
    const serviceId = providerIdToServiceId(id);
    if (serviceId && !seen.has(serviceId)) {
      result.push(serviceId);
      seen.add(serviceId);
    }
  }
  return result;
}

// ── SA API service slug → ServiceId ─────────────────────
// Verified from live /countries/gb + /shows/search/filters responses (March 2026).
// Sky Go is not in the SA API. BBC iPlayer is listed but has an empty catalogue.
// IMPORTANT: This mapping is also duplicated in:
//   - scripts/sync-content.ts (SA_TO_VIDEX)
//   - supabase/functions/sync-incremental/index.ts (SA_TO_VIDEX)
// Keep all three in sync when adding/removing services.
const SA_SERVICE_TO_VIDEX: Record<string, ServiceId> = {
  netflix: 'netflix',
  prime: 'prime',
  apple: 'apple',
  disney: 'disney',
  now: 'now',
  paramount: 'paramount',
  itvx: 'itvx',
  all4: 'channel4',
  iplayer: 'bbc',       // Listed in API but catalogue empty as of March 2026
};

// ServiceId → SA API service slug (reverse mapping)
const VIDEX_TO_SA_SERVICE: Record<ServiceId, string> = Object.fromEntries(
  Object.entries(SA_SERVICE_TO_VIDEX).map(([saId, videxId]) => [videxId, saId])
) as Record<ServiceId, string>;

/**
 * Convert an SA API service slug to a ServiceId.
 * Returns null for unrecognised services.
 */
export function saServiceToServiceId(saServiceId: string): ServiceId | null {
  return SA_SERVICE_TO_VIDEX[saServiceId] ?? null;
}

/**
 * Convert a ServiceId to an SA API service slug.
 */
export function serviceIdToSaService(serviceId: ServiceId): string | null {
  return VIDEX_TO_SA_SERVICE[serviceId] ?? null;
}

// ── TMDb discover variant IDs ───────────────────────────
// Extra TMDb provider IDs to include in discover queries.
// TMDb's discover endpoint sometimes recognizes different IDs than the
// canonical ones returned by watch/providers. E.g., ITVX discover data
// lives under 41 (ITV Hub), not 54 (ITVX) — which returns 0 results.
const DISCOVER_VARIANT_IDS: Partial<Record<ServiceId, number[]>> = {
  itvx: [41],  // ITV Hub — TMDb discover has 878 results vs 0 for ID 54
};

/**
 * Convert an array of ServiceId strings to TMDb provider IDs.
 * Includes variant IDs for discover queries (e.g., 41 for ITVX).
 */
export function serviceIdsToProviderIds(serviceIds: ServiceId[]): number[] {
  const ids: number[] = [];
  for (const id of serviceIds) {
    const canonical = SERVICE_ID_TO_TMDB[id];
    if (canonical !== undefined) {
      ids.push(canonical);
      const extras = DISCOVER_VARIANT_IDS[id];
      if (extras) ids.push(...extras);
    }
  }
  return ids;
}
