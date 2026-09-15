/**
 * Provider Classifier
 * Splits streaming and rental providers into 3 tiers for the Detail page "Where to Watch" section.
 *
 * Tier 1: User's connected streaming services (orange glow), plus add-on
 *         channels the user holds (IN-SC-004).
 * Tier 2: Other subscription/free services (neutral chips)
 * Tier 3: Rent/buy options (price list) — passed through as-is, no exclusion here.
 *         Rent/buy deduplication against all streaming services is handled upstream in detailAdapter.ts.
 * Channels the user does not hold stay a separate, labelled "Via a channel" list.
 */

import type { ServiceId } from '@/lib/types/content';
import type { ChannelOption, RentalOption } from '@/lib/adapters/detailAdapter';

export interface ClassifiedProviders {
  tier1: ServiceId[];
  tier2: ServiceId[];
  tier3: RentalOption[];
  /** Channel options whose token the user holds — rendered with tier 1. */
  heldChannels: ChannelOption[];
  /** Channel options the user does not hold — the "Via a channel" list. */
  otherChannels: ChannelOption[];
}

export function classifyProviders(
  allStreamingServices: ServiceId[],
  rentalOptions: RentalOption[],
  connectedServiceIds: ServiceId[],
  channelOptions: ChannelOption[] = [],
  /** `channel_services` tokens the user holds (entitlements/channels). */
  heldChannelTokens: readonly string[] = [],
): ClassifiedProviders {
  const connectedSet = new Set(connectedServiceIds);
  const heldSet = new Set(heldChannelTokens);

  const tier1 = allStreamingServices.filter((s) => connectedSet.has(s));
  const tier2 = allStreamingServices.filter((s) => !connectedSet.has(s));
  const tier3 = rentalOptions;

  const isHeld = (o: ChannelOption) => o.channelToken !== undefined && heldSet.has(o.channelToken);
  const heldChannels = channelOptions.filter(isHeld);
  const otherChannels = channelOptions.filter((o) => !isHeld(o));

  return { tier1, tier2, tier3, heldChannels, otherChannels };
}
