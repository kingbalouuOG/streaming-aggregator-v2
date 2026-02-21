/**
 * Provider Classifier
 * Splits streaming and rental providers into 3 tiers for the Detail page "Where to Watch" section.
 *
 * Tier 1: User's connected streaming services (orange glow)
 * Tier 2: Other subscription/free services (neutral chips)
 * Tier 3: Rent/buy options (price list) — passed through as-is, no exclusion here.
 *         Rent/buy deduplication against all streaming services is handled upstream in detailAdapter.ts.
 */

import type { ServiceId } from '@/components/platformLogos';
import type { RentalOption } from '@/lib/adapters/detailAdapter';

export interface ClassifiedProviders {
  tier1: ServiceId[];
  tier2: ServiceId[];
  tier3: RentalOption[];
}

export function classifyProviders(
  allStreamingServices: ServiceId[],
  rentalOptions: RentalOption[],
  connectedServiceIds: ServiceId[]
): ClassifiedProviders {
  const connectedSet = new Set(connectedServiceIds);

  const tier1 = allStreamingServices.filter((s) => connectedSet.has(s));
  const tier2 = allStreamingServices.filter((s) => !connectedSet.has(s));
  const tier3 = rentalOptions;

  return { tier1, tier2, tier3 };
}
