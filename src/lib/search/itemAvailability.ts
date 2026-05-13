// itemAvailability — pure per-item availability check. The same
// decision tree used to live inside useSearch; lifted here so both
// the search path (useSearch results) and the filter-only browse
// path (useBrowse items) can run it.
//
// Outcome shape stays narrow: caller decides how to render and how to
// batch updates. Returns a lazy price fetcher so the relatively
// expensive Supabase query only runs when the caller actually wants
// the chip label.

import { getServiceProviders } from "@/lib/utils/serviceCache";
import { getRentBuyPrice } from "@/lib/api/supabaseContent";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import type { ContentItem } from "@/components/ContentCard";
import type { ServiceId } from "@/components/platformLogos";

export type Tier = "free" | "rent" | "buy";

export type AvailabilityOutcome =
  /** No UK streaming availability at all — caller should drop the item. */
  | { kind: "remove" }
  /** User has no connected services — display all the title's
   *  services informationally, no on/off-service distinction. */
  | { kind: "no-user-services"; allServices: ServiceId[]; tiers: Set<Tier> }
  /** Title is on at least one of the user's services. `matchedServices`
   *  is what the renderer should badge (free-on-user services
   *  prioritised over paid). `priceLabel` is set when the user's only
   *  path to watch is rent/buy (state 1.5); null for state 1. */
  | {
      kind: "on-service";
      matchedServices: ServiceId[];
      tiers: Set<Tier>;
      priceLabel: string | null;
    }
  /** Title is in UK but not on any user service. `allServices` is
   *  "where it lives." `priceLabel` set when rentable anywhere. */
  | {
      kind: "off-service";
      allServices: ServiceId[];
      tiers: Set<Tier>;
      priceLabel: string | null;
    };

/**
 * Process one item end-to-end. Awaits the providers fetch first, then
 * the price fetch (when applicable) before resolving. Returns the
 * final outcome the renderer can act on directly.
 *
 * `onlyOnMyServices` only affects the off-service branch — true means
 * off-service items resolve to `{ kind: 'remove' }`; false means they
 * stay visible with the tinted treatment.
 */
export async function processItemAvailability(
  item: ContentItem,
  connectedServices: readonly ServiceId[],
  onlyOnMyServices: boolean,
): Promise<AvailabilityOutcome> {
  const { tmdbId, mediaType } = parseContentItemId(item.id);
  const providers = await getServiceProviders(String(tmdbId), mediaType);

  const allServices: ServiceId[] = [
    ...providers.free,
    ...providers.rent.filter((s) => !providers.free.includes(s)),
    ...providers.buy.filter((s) => !providers.free.includes(s) && !providers.rent.includes(s)),
  ];

  if (allServices.length === 0) {
    return { kind: "remove" };
  }

  if (connectedServices.length === 0) {
    const tiers = new Set<Tier>();
    if (providers.free.length) tiers.add("free");
    if (providers.rent.length) tiers.add("rent");
    if (providers.buy.length) tiers.add("buy");
    return { kind: "no-user-services", allServices, tiers };
  }

  const userSet = new Set<ServiceId>(connectedServices);
  const freeOnUser = providers.free.filter((s) => userSet.has(s));
  const rentOnUser = providers.rent.filter((s) => userSet.has(s));
  const buyOnUser = providers.buy.filter((s) => userSet.has(s));
  const paidOnUser: ServiceId[] = [
    ...rentOnUser,
    ...buyOnUser.filter((s) => !rentOnUser.includes(s)),
  ];

  if (freeOnUser.length > 0) {
    // State 1 — free on user's services. No price chip (cheapest path
    // is the existing subscription); the rentable-also case stays
    // implicit because the chip would only invite confusion.
    const tiers = new Set<Tier>(["free"]);
    if (rentOnUser.length) tiers.add("rent");
    if (buyOnUser.length) tiers.add("buy");
    return {
      kind: "on-service",
      matchedServices: freeOnUser,
      tiers,
      priceLabel: null,
    };
  }

  if (paidOnUser.length > 0) {
    // State 1.5 — rent/buy on user's service. Try the price scoped to
    // those user services first; fall back to any-service price when
    // SA data has null prices for the user-service entries (the LotR
    // Fellowship case). When neither is priced, still surface the
    // chip with just the verb — knowing it's rentable / buyable is
    // the load-bearing signal; the price is a bonus.
    const scoped = await getRentBuyPrice(tmdbId, mediaType, paidOnUser);
    const price = scoped ?? (await getRentBuyPrice(tmdbId, mediaType));
    const tiers = new Set<Tier>();
    if (rentOnUser.length) tiers.add("rent");
    if (buyOnUser.length) tiers.add("buy");
    const fallbackLabel = rentOnUser.length > 0 ? "Rent" : "Buy";
    return {
      kind: "on-service",
      matchedServices: paidOnUser,
      tiers,
      priceLabel: price?.fromFormatted ?? fallbackLabel,
    };
  }

  // Off-service path
  if (onlyOnMyServices) {
    return { kind: "remove" };
  }
  const price = await getRentBuyPrice(tmdbId, mediaType);
  const tiers = new Set<Tier>();
  if (providers.free.length) tiers.add("free");
  if (providers.rent.length) tiers.add("rent");
  if (providers.buy.length) tiers.add("buy");
  // Same fallback as on-service paid: when rent/buy exists but no
  // priced SA entry, drop in just the verb so the user still sees
  // "this is rentable" at a glance.
  const hasRentBuy = providers.rent.length > 0 || providers.buy.length > 0;
  const fallbackLabel = providers.rent.length > 0 ? "Rent" : "Buy";
  const priceLabel = price?.fromFormatted ?? (hasRentBuy ? fallbackLabel : null);
  return {
    kind: "off-service",
    allServices,
    tiers,
    priceLabel,
  };
}
