// useItemAvailability — runs `processItemAvailability` over a list of
// ContentItems and exposes the aggregated state (removals, off-service
// flags, price labels, available tiers, displayable service badges).
// Both the search path (useSearch's results) and the filter-only
// browse path (useBrowse's items) consume this — same algorithm,
// same state shape, single source of truth.
//
// Batching: per-item callbacks resolve at different times, so we
// accumulate updates in refs and flush via setTimeout to coalesce
// re-renders. Pattern carried over from useSearch's pre-refactor flow.

import { useCallback, useEffect, useRef, useState } from "react";
import { processItemAvailability, type Tier } from "@/lib/search/itemAvailability";
import type { ContentItem } from "@/components/ContentCard";
import type { ServiceId } from "@/components/platformLogos";

const FLUSH_INTERVAL_MS = 200;

export interface UseItemAvailabilityOptions {
  /** True when off-service items should be dropped from the result
   *  set; false keeps them visible (tinted, with "where it lives"
   *  service icons). Mirrors `FilterState.onlyOnMyServices`. */
  onlyOnMyServices?: boolean;
  /** Initial sets/maps for snapshot restoration — pairs with
   *  navigation that preserves the result list. */
  initialUnavailableIds?: readonly string[];
  initialRentBuyPrices?: ReadonlyArray<readonly [string, string]>;
  initialAvailableTiers?: ReadonlyArray<readonly [string, ReadonlyArray<Tier>]>;
  initialServiceBadges?: ReadonlyArray<readonly [string, ReadonlyArray<ServiceId>]>;
}

export interface ItemAvailabilityState {
  /** Content IDs the per-item check decided to drop (no UK
   *  availability OR off-service + drop mode). Renderer filters
   *  these out of displayItems. */
  removedIds: Set<string>;
  /** Content IDs that are off-service (in UK but not on user's
   *  services). Renderer applies state 2/3 treatment. */
  unavailableIds: Set<string>;
  /** Per-item "Rent/Buy from £X.XX" labels. Renderer passes to
   *  ContentCard.rentBuyPriceLabel. */
  rentBuyPrices: Map<string, string>;
  /** Per-item tiers the user can use to watch. Renderer feeds into
   *  the cost filter. */
  availableTiers: Map<string, Set<Tier>>;
  /** Per-item displayable service badges. Renderer overrides
   *  item.services with this map's entry when present so the
   *  ServiceStack reflects the on-service / off-service decision. */
  serviceBadges: Map<string, ServiceId[]>;
}

export function useItemAvailability(
  items: readonly ContentItem[],
  userServices: readonly ServiceId[] | undefined,
  options: UseItemAvailabilityOptions = {},
): ItemAvailabilityState {
  const {
    onlyOnMyServices = true,
    initialUnavailableIds,
    initialRentBuyPrices,
    initialAvailableTiers,
    initialServiceBadges,
  } = options;

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(() =>
    initialUnavailableIds ? new Set(initialUnavailableIds) : new Set(),
  );
  const [rentBuyPrices, setRentBuyPrices] = useState<Map<string, string>>(() =>
    initialRentBuyPrices ? new Map(initialRentBuyPrices) : new Map(),
  );
  const [availableTiers, setAvailableTiers] = useState<Map<string, Set<Tier>>>(() =>
    initialAvailableTiers
      ? new Map(initialAvailableTiers.map(([id, tiers]) => [id, new Set(tiers)]))
      : new Map(),
  );
  const [serviceBadges, setServiceBadges] = useState<Map<string, ServiceId[]>>(() =>
    initialServiceBadges
      ? new Map(initialServiceBadges.map(([id, ids]) => [id, [...ids]]))
      : new Map(),
  );

  // Pending updates accumulated between flushes
  const pendingRemoveRef = useRef<Set<string>>(new Set());
  const pendingOffRef = useRef<Set<string>>(new Set());
  const pendingPricesRef = useRef<Map<string, string>>(new Map());
  const pendingTiersRef = useRef<Map<string, Set<Tier>>>(new Map());
  const pendingBadgesRef = useRef<Map<string, ServiceId[]>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // IDs that have already been processed (or are in-flight) so re-
  // renders of the same items don't re-fetch.
  const processedIdsRef = useRef<Set<string>>(new Set());
  // Onlyonmy / userServices snapshot used to decide whether to reset
  // processed state when the inputs change.
  const optionsKeyRef = useRef<string>("");

  // Mirror onlyOnMyServices via ref so the async callbacks see the
  // current value without re-closing.
  const onlyOnMyServicesRef = useRef(onlyOnMyServices);
  onlyOnMyServicesRef.current = onlyOnMyServices;

  const flush = useCallback(() => {
    const remove = pendingRemoveRef.current;
    const off = pendingOffRef.current;
    const prices = pendingPricesRef.current;
    const tiers = pendingTiersRef.current;
    const badges = pendingBadgesRef.current;
    if (
      remove.size === 0 && off.size === 0 && prices.size === 0
      && tiers.size === 0 && badges.size === 0
    ) return;

    const nextRemove = new Set(remove);
    const nextOff = new Set(off);
    const nextPrices = new Map(prices);
    const nextTiers = new Map(tiers);
    const nextBadges = new Map(badges);
    remove.clear();
    off.clear();
    prices.clear();
    tiers.clear();
    badges.clear();

    if (nextRemove.size > 0) {
      setRemovedIds((prev) => {
        const merged = new Set(prev);
        nextRemove.forEach((id) => merged.add(id));
        return merged;
      });
    }
    if (nextOff.size > 0) {
      setUnavailableIds((prev) => {
        const merged = new Set(prev);
        nextOff.forEach((id) => merged.add(id));
        return merged;
      });
    }
    if (nextPrices.size > 0) {
      setRentBuyPrices((prev) => {
        const merged = new Map(prev);
        nextPrices.forEach((label, id) => merged.set(id, label));
        return merged;
      });
    }
    if (nextTiers.size > 0) {
      setAvailableTiers((prev) => {
        const merged = new Map(prev);
        nextTiers.forEach((set, id) => merged.set(id, set));
        return merged;
      });
    }
    if (nextBadges.size > 0) {
      setServiceBadges((prev) => {
        const merged = new Map(prev);
        nextBadges.forEach((ids, id) => merged.set(id, ids));
        return merged;
      });
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = undefined;
      flush();
    }, FLUSH_INTERVAL_MS);
  }, [flush]);

  // Reset state when the inputs that affect the decision tree change
  // (userServices set, onlyOnMyServices flag). Items themselves are
  // accumulated — re-processing the same items would waste API calls.
  useEffect(() => {
    const key = `${(userServices ?? []).join(",")}|${onlyOnMyServices ? 1 : 0}`;
    if (optionsKeyRef.current === key) return;
    optionsKeyRef.current = key;
    processedIdsRef.current.clear();
    pendingRemoveRef.current.clear();
    pendingOffRef.current.clear();
    pendingPricesRef.current.clear();
    pendingTiersRef.current.clear();
    pendingBadgesRef.current.clear();
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    setRemovedIds(new Set());
    setUnavailableIds(new Set());
    setRentBuyPrices(new Map());
    setAvailableTiers(new Map());
    setServiceBadges(new Map());
  }, [userServices, onlyOnMyServices]);

  // Process items as they arrive. Dedupe via processedIdsRef so re-
  // renders with the same items don't re-fetch.
  useEffect(() => {
    if (items.length === 0) return;
    const services = userServices ?? [];
    let cancelled = false;

    items.forEach((item) => {
      if (processedIdsRef.current.has(item.id)) return;
      processedIdsRef.current.add(item.id);

      (async () => {
        try {
          const outcome = await processItemAvailability(
            item,
            services,
            onlyOnMyServicesRef.current,
          );
          if (cancelled) return;
          applyOutcome(item.id, outcome, {
            removeRef: pendingRemoveRef.current,
            offRef: pendingOffRef.current,
            pricesRef: pendingPricesRef.current,
            tiersRef: pendingTiersRef.current,
            badgesRef: pendingBadgesRef.current,
          });
          scheduleFlush();
        } catch {
          // Silently skip; item stays visible without enrichment.
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [items, userServices, scheduleFlush]);

  // Final cleanup on unmount — flush any pending state so navigation
  // snapshot captures the latest enrichments before we tear down.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = undefined;
      }
      flush();
    };
  }, [flush]);

  return { removedIds, unavailableIds, rentBuyPrices, availableTiers, serviceBadges };
}

// ── Internal helpers ──────────────────────────────────────────────

function applyOutcome(
  id: string,
  outcome: Awaited<ReturnType<typeof processItemAvailability>>,
  refs: {
    removeRef: Set<string>;
    offRef: Set<string>;
    pricesRef: Map<string, string>;
    tiersRef: Map<string, Set<Tier>>;
    badgesRef: Map<string, ServiceId[]>;
  },
): void {
  switch (outcome.kind) {
    case "remove":
      refs.removeRef.add(id);
      break;
    case "no-user-services":
      refs.badgesRef.set(id, outcome.allServices);
      refs.tiersRef.set(id, outcome.tiers);
      break;
    case "on-service":
      refs.badgesRef.set(id, outcome.matchedServices);
      refs.tiersRef.set(id, outcome.tiers);
      if (outcome.priceLabel) refs.pricesRef.set(id, outcome.priceLabel);
      break;
    case "off-service":
      refs.offRef.add(id);
      refs.badgesRef.set(id, outcome.allServices.slice(0, 3));
      refs.tiersRef.set(id, outcome.tiers);
      if (outcome.priceLabel) refs.pricesRef.set(id, outcome.priceLabel);
      break;
  }
}
