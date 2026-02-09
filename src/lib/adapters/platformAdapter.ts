/**
 * Platform Adapter
 * Bidirectional mapping between TMDb provider IDs (numbers)
 * and the UI's ServiceId strings.
 */

import type { ServiceId } from '@/components/platformLogos';
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

/**
 * Convert an array of ServiceId strings to TMDb provider IDs.
 */
export function serviceIdsToProviderIds(serviceIds: ServiceId[]): number[] {
  return serviceIds.map(serviceIdToProviderId);
}
