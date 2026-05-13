import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMovies, searchTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem, parseContentItemId } from '@/lib/adapters/contentAdapter';
import { getServiceProviders } from '@/lib/utils/serviceCache';
import { extractYearFromQuery, reRankSearchResults } from '@/lib/utils/searchUtils';
import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import { API_CONFIG } from '@/lib/constants/config';
import { emitSearch } from '@/lib/storage/interactions';
import { searchTitlesByText, getRentBuyPrice } from '@/lib/api/supabaseContent';

const BADGE_FLUSH_INTERVAL_MS = 200;

interface UseSearchOptions {
  /** When true, results not available on any of `userServices` are
   *  dropped before render. When false, they stay in the grid but get
   *  flagged in `unavailableIds` so the renderer can tag them
   *  notOnYours. Defaults to true to match `FilterState.onlyOnMyServices`
   *  default. */
  onlyOnMyServices?: boolean;
  /** Restore the off-services tag set across navigation. Paired with
   *  `initialResults` — if the caller passes restored results from
   *  `BrowseStateSnapshot`, this prop carries the matching off-services
   *  decisions so a tap-into-detail-then-back doesn't drop them. */
  initialUnavailableIds?: readonly string[];
  /** Same role as `initialUnavailableIds` but for rent/buy price
   *  labels. Pass as a list of `[contentId, label]` tuples so the
   *  snapshot stays JSON-safe. */
  initialRentBuyPrices?: ReadonlyArray<readonly [string, string]>;
  /** Per-item tier set across navigation. Stored as
   *  `[contentId, tier[]]` tuples. */
  initialAvailableTiers?: ReadonlyArray<readonly [string, ReadonlyArray<'free' | 'rent' | 'buy'>]>;
}

export function useSearch(
  userServices?: ServiceId[],
  initialQuery?: string,
  initialResults?: ContentItem[],
  options: UseSearchOptions = {},
) {
  const { onlyOnMyServices = true, initialUnavailableIds, initialRentBuyPrices, initialAvailableTiers } = options;
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<ContentItem[]>(initialResults || []);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(() =>
    initialUnavailableIds ? new Set(initialUnavailableIds) : new Set()
  );
  const [rentBuyPrices, setRentBuyPrices] = useState<Map<string, string>>(() =>
    initialRentBuyPrices ? new Map(initialRentBuyPrices) : new Map()
  );
  const [availableTiers, setAvailableTiers] = useState<Map<string, Set<'free' | 'rent' | 'buy'>>>(() =>
    initialAvailableTiers
      ? new Map(initialAvailableTiers.map(([id, tiers]) => [id, new Set(tiers)]))
      : new Map()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isRestoredRef = useRef(!!initialQuery);
  const currentQueryRef = useRef(query);
  const badgeFlushRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingBadgesRef = useRef<Map<string, ServiceId[]>>(new Map());
  /** Items confirmed in UK but not on the user's services (per-item check). */
  const offServicesRef = useRef<Set<string>>(new Set());
  /** Items confirmed with no UK availability OR off-services + drop mode. */
  const removeRef = useRef<Set<string>>(new Set());
  /** Rent/buy "From £X.XX" labels resolved per-item from streaming_availability. */
  const pendingRentBuyRef = useRef<Map<string, string>>(new Map());
  /** Per-item tier set — what tiers (free/rent/buy) the user can use to
   *  watch this title. For on-service items, restricted to user's
   *  services. For off-service items, tiers anywhere. Used by the cost
   *  filter to narrow results post-resolution. */
  const pendingTiersRef = useRef<Map<string, Set<'free' | 'rent' | 'buy'>>>(new Map());
  /** Mirror of `onlyOnMyServices` so the background per-item flow sees
   *  the live value without a stale closure. */
  const onlyOnMyServicesRef = useRef(onlyOnMyServices);
  onlyOnMyServicesRef.current = onlyOnMyServices;

  // Stabilize dependency to avoid infinite re-renders
  const servicesKey = userServices?.join(',') || '';

  const tooShort = query.trim().length > 0 && query.trim().length < 2;

  // Per-item provider fetch — populates badges AND owns the availability
  // verdict. The pre-call `get_available_tmdb_ids` RPC was tried in A8
  // but produces false negatives for titles outside our ~20K Postgres
  // cache (TMDb is millions of titles). `getCachedServices` calls
  // TMDb /watch/providers per item — slower but authoritative.
  //
  // Per-item outcomes:
  //   - No UK availability at all  → drop the item from `results`.
  //   - On user services           → populate ServiceStack badge.
  //   - In UK but not on services  → tag `notOnYours` (when
  //                                  onlyOnMyServices=false) or drop
  //                                  (when onlyOnMyServices=true).
  const flushPendingUpdates = useCallback((q: string) => {
    if (currentQueryRef.current !== q) return;
    const pending = pendingBadgesRef.current;
    const offServices = offServicesRef.current;
    const remove = removeRef.current;
    const rentBuy = pendingRentBuyRef.current;
    const tiers = pendingTiersRef.current;
    if (
      pending.size === 0 &&
      offServices.size === 0 &&
      remove.size === 0 &&
      rentBuy.size === 0 &&
      tiers.size === 0
    ) return;

    const badgeUpdates = new Map(pending);
    const offSet = new Set(offServices);
    const removeSet = new Set(remove);
    const rentBuyUpdates = new Map(rentBuy);
    const tierUpdates = new Map(tiers);
    pending.clear();
    offServices.clear();
    remove.clear();
    rentBuy.clear();
    tiers.clear();

    setResults(prev => {
      const filtered = removeSet.size > 0
        ? prev.filter(item => !removeSet.has(item.id))
        : prev;
      return badgeUpdates.size > 0
        ? filtered.map(item => {
            const services = badgeUpdates.get(item.id);
            return services ? { ...item, services } : item;
          })
        : filtered;
    });
    if (offSet.size > 0) {
      setUnavailableIds(prev => {
        const next = new Set(prev);
        offSet.forEach((id) => next.add(id));
        return next;
      });
    }
    if (rentBuyUpdates.size > 0) {
      setRentBuyPrices(prev => {
        const next = new Map(prev);
        rentBuyUpdates.forEach((label, id) => next.set(id, label));
        return next;
      });
    }
    if (tierUpdates.size > 0) {
      setAvailableTiers(prev => {
        const next = new Map(prev);
        tierUpdates.forEach((tierSet, id) => next.set(id, tierSet));
        return next;
      });
    }
  }, []);

  const fetchAvailabilityAndBadges = useCallback((items: ContentItem[], q: string, connectedServices: ServiceId[]) => {
    pendingBadgesRef.current.clear();
    offServicesRef.current.clear();
    removeRef.current.clear();
    pendingRentBuyRef.current.clear();
    pendingTiersRef.current.clear();
    if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);

    let completed = 0;
    const total = items.length;
    const noUserServices = connectedServices.length === 0;
    const dropOffServices = onlyOnMyServicesRef.current && !noUserServices;

    items.forEach(async (item) => {
      try {
        const { tmdbId, mediaType } = parseContentItemId(item.id);
        const providers = await getServiceProviders(String(tmdbId), mediaType);
        const allServices = [
          ...providers.free,
          ...providers.rent.filter((s) => !providers.free.includes(s)),
          ...providers.buy.filter((s) => !providers.free.includes(s) && !providers.rent.includes(s)),
        ];

        if (allServices.length === 0) {
          // No UK availability — always drop.
          removeRef.current.add(item.id);
          return;
        }

        if (noUserServices) {
          // Logged-out / pre-onboarding: no service set to intersect
          // against, but the title is at least UK-available — show
          // it. Populate availableTiers from the catalogue at large
          // so the cost filter still works.
          pendingBadgesRef.current.set(item.id, allServices);
          const tiers = new Set<'free' | 'rent' | 'buy'>();
          if (providers.free.length) tiers.add('free');
          if (providers.rent.length) tiers.add('rent');
          if (providers.buy.length) tiers.add('buy');
          pendingTiersRef.current.set(item.id, tiers);
          return;
        }

        // Tier-aware on-service decision:
        //   - freeOnUser non-empty   → state 1   (full colour, no chip)
        //   - paidOnUser non-empty   → state 1.5 (full colour, chip)
        //   - off-service            → state 2/3
        const freeOnUser = providers.free.filter((s) => connectedServices.includes(s));
        const rentOnUser = providers.rent.filter((s) => connectedServices.includes(s));
        const buyOnUser = providers.buy.filter((s) => connectedServices.includes(s));
        const paidOnUser = [...rentOnUser, ...buyOnUser.filter((s) => !rentOnUser.includes(s))];

        if (freeOnUser.length > 0) {
          // State 1 — free on user's services. The cheapest path is
          // already subscription; no rent/buy chip needed even when
          // the title is also rentable somewhere.
          pendingBadgesRef.current.set(item.id, freeOnUser);
          const tiers = new Set<'free' | 'rent' | 'buy'>(['free']);
          if (rentOnUser.length) tiers.add('rent');
          if (buyOnUser.length) tiers.add('buy');
          pendingTiersRef.current.set(item.id, tiers);
        } else if (paidOnUser.length > 0) {
          // State 1.5 — rent/buy on user's service. Show matched
          // service icons + a price chip. Try the price scoped to
          // those user services first; fall back to any service when
          // our SA cache has null prices for that service (real-world
          // data gap). Either way, "Rent/Buy from £X.XX" signals the
          // title is paid.
          pendingBadgesRef.current.set(item.id, paidOnUser);
          const tiers = new Set<'free' | 'rent' | 'buy'>();
          if (rentOnUser.length) tiers.add('rent');
          if (buyOnUser.length) tiers.add('buy');
          pendingTiersRef.current.set(item.id, tiers);
          (async () => {
            const scoped = await getRentBuyPrice(tmdbId, mediaType, paidOnUser);
            const price = scoped ?? await getRentBuyPrice(tmdbId, mediaType);
            if (price && currentQueryRef.current === q) {
              pendingRentBuyRef.current.set(item.id, price.fromFormatted);
              if (!badgeFlushRef.current) {
                badgeFlushRef.current = setTimeout(() => {
                  badgeFlushRef.current = undefined;
                  flushPendingUpdates(q);
                }, BADGE_FLUSH_INTERVAL_MS);
              }
            }
          })().catch(() => { /* silently skip */ });
        } else if (dropOffServices) {
          removeRef.current.add(item.id);
        } else {
          // Off-service path (state 2 or 3). Tint + "where it lives"
          // icons + cheapest rent/buy price across any service when
          // it exists.
          offServicesRef.current.add(item.id);
          pendingBadgesRef.current.set(item.id, allServices.slice(0, 3));
          const tiers = new Set<'free' | 'rent' | 'buy'>();
          if (providers.free.length) tiers.add('free');
          if (providers.rent.length) tiers.add('rent');
          if (providers.buy.length) tiers.add('buy');
          pendingTiersRef.current.set(item.id, tiers);
          getRentBuyPrice(tmdbId, mediaType).then((price) => {
            if (price && currentQueryRef.current === q) {
              pendingRentBuyRef.current.set(item.id, price.fromFormatted);
              if (!badgeFlushRef.current) {
                badgeFlushRef.current = setTimeout(() => {
                  badgeFlushRef.current = undefined;
                  flushPendingUpdates(q);
                }, BADGE_FLUSH_INTERVAL_MS);
              }
            }
          }).catch(() => { /* silently skip */ });
        }
      } catch {
        // Silently skip failed lookups — item stays visible.
      } finally {
        completed++;
        if (completed === total) {
          if (badgeFlushRef.current) {
            clearTimeout(badgeFlushRef.current);
            // Critical — clear the ref too so any rent/buy callback
            // that resolves AFTER this final flush can re-arm a
            // flush. Without this, `if (!badgeFlushRef.current)` in
            // the price-fetch callbacks below sees the stale cleared
            // timeout ID (still truthy) and skips scheduling, and
            // the chip never paints.
            badgeFlushRef.current = undefined;
          }
          flushPendingUpdates(q);
        } else if (!badgeFlushRef.current) {
          badgeFlushRef.current = setTimeout(() => {
            badgeFlushRef.current = undefined;
            flushPendingUpdates(q);
            if (completed < total) {
              badgeFlushRef.current = setTimeout(() => {
                badgeFlushRef.current = undefined;
                flushPendingUpdates(q);
              }, BADGE_FLUSH_INTERVAL_MS);
            }
          }, BADGE_FLUSH_INTERVAL_MS);
        }
      }
    });
  }, [flushPendingUpdates]);

  const search = useCallback(async (q: string, searchPage: number, append: boolean, category: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) {
      if (!append) {
        setResults([]);
        setUnavailableIds(new Set());
        setRentBuyPrices(new Map());
        setAvailableTiers(new Map());
        setLoading(false);
      }
      return;
    }

    if (!append) setLoading(true);
    setError(null);
    currentQueryRef.current = q;

    try {
      const { cleanQuery, year } = extractYearFromQuery(trimmed);
      const shouldFetchMovies = category === 'All' || category === 'Movies';
      const shouldFetchTV = category === 'All' || category === 'TV';
      const services = userServices || [];

      // Parallel sources:
      //   TMDb /search/movie + /search/tv — broad catalogue but
      //     tokenises queries by word boundary ("salt" never matches
      //     "Saltburn").
      //   Postgres titles ILIKE — covers the substring + compound-word
      //     gap for the ~20K UK-available titles we have cached.
      // First-page only for Postgres; TMDb pagination handles depth.
      const [movieRes, tvRes, cacheItems] = await Promise.all([
        shouldFetchMovies ? searchMovies(cleanQuery, searchPage, year) : null,
        shouldFetchTV ? searchTV(cleanQuery, searchPage, year) : null,
        searchPage === 1 ? searchTitlesByText(cleanQuery, 20) : Promise.resolve<ContentItem[]>([]),
      ]);

      // Guard against stale results
      if (currentQueryRef.current !== q) return;

      const movieItems = (movieRes?.data?.results || []).map(tmdbMovieToContentItem);
      const tvItems = (tvRes?.data?.results || []).map(tmdbTVToContentItem);
      // Filter the Postgres-cache hits to match the active category so
      // the All/Movies/TV pill still narrows results.
      const filteredCache = cacheItems.filter((item) => {
        if (category === 'Movies') return item.type === 'movie' || item.type === 'doc';
        if (category === 'TV') return item.type === 'tv';
        return true;
      });

      // Dedupe by id — Postgres entries fill in compound-word gaps
      // TMDb missed; identical hits collapse cleanly.
      const seen = new Set<string>();
      const dedupedItems: ContentItem[] = [];
      for (const item of [...movieItems, ...tvItems, ...filteredCache]) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        dedupedItems.push(item);
      }
      const ranked = reRankSearchResults(dedupedItems, cleanQuery);

      // Set results immediately — every item visible until per-item
      // /watch/providers confirms availability. This is the only path
      // that has positive ground truth for cache-missed titles like
      // "Exactly Salt" that aren't in our Postgres cache.
      const movieTotalPages = movieRes?.data?.total_pages || 0;
      const tvTotalPages = tvRes?.data?.total_pages || 0;
      const maxTotalPages = Math.max(movieTotalPages, tvTotalPages);

      if (append) {
        setResults(prev => {
          const have = new Set(prev.map((p) => p.id));
          const news = ranked.filter((r) => !have.has(r.id));
          return [...prev, ...news];
        });
      } else {
        setResults(ranked);
        setUnavailableIds(new Set());
        setRentBuyPrices(new Map());
        setAvailableTiers(new Map());
        emitSearch(cleanQuery, ranked.length);
      }
      setPage(searchPage);
      setHasMore(searchPage < maxTotalPages);

      // Per-item availability + badge fetch. Owns the notOnYours /
      // remove decisions — see fetchAvailabilityAndBadges for the
      // outcome table.
      fetchAvailabilityAndBadges(ranked, q, services);
    } catch (err: any) {
      if (currentQueryRef.current !== q) return;
      setError(err.message || 'Search failed');
      if (!append) {
        setResults([]);
        setUnavailableIds(new Set());
        setRentBuyPrices(new Map());
        setAvailableTiers(new Map());
      }
    } finally {
      if (currentQueryRef.current === q) {
        setLoading(false);
      }
    }
  }, [servicesKey, fetchAvailabilityAndBadges]);

  // Reset page when category changes
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) return;
    // Skip on initial restore
    if (isRestoredRef.current) return;
    setPage(1);
    setResults([]);
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(query, 1, false, activeCategory);
    }, API_CONFIG.DEBOUNCE_DELAY_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [activeCategory]);

  // Debounced query effect
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults(initialResults && isRestoredRef.current ? initialResults : []);
      setLoading(false);
      setHasMore(false);
      setPage(1);
      return;
    }

    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    // Skip the initial search when restoring from saved state
    if (isRestoredRef.current) {
      isRestoredRef.current = false;
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      search(query, 1, false, activeCategory);
    }, API_CONFIG.DEBOUNCE_DELAY_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      search(query, page + 1, true, activeCategory);
    }
  }, [hasMore, loading, query, page, activeCategory, search]);

  // Auto-paginate to a minimum visible count. After per-item availability
  // settles the grid often holds fewer items than the user expects from
  // page 1 (TMDb returns 40 candidates, filtering can leave 0–3). Keep
  // fetching the next page until we've shown the user at least
  // MIN_VISIBLE titles — or run out of pages, or hit the auto-fetch cap
  // (prevents runaway when a query has no on-services hits at all).
  const MIN_VISIBLE = 4;
  const MAX_AUTO_FETCH_PAGES = 3;
  const autoFetchedRef = useRef(0);
  useEffect(() => {
    // Reset the auto-fetch counter whenever the user issues a fresh query.
    autoFetchedRef.current = 0;
  }, [query, activeCategory]);
  useEffect(() => {
    if (loading) return;
    if (!query.trim() || query.trim().length < 2) return;
    if (!hasMore) return;
    if (autoFetchedRef.current >= MAX_AUTO_FETCH_PAGES) return;
    const visibleCount = results.length - unavailableIds.size;
    if (visibleCount >= MIN_VISIBLE) return;
    autoFetchedRef.current += 1;
    search(query, page + 1, true, activeCategory);
  }, [loading, hasMore, results.length, unavailableIds, query, activeCategory, page, search]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setUnavailableIds(new Set());
    setRentBuyPrices(new Map());
    setAvailableTiers(new Map());
    setError(null);
    setPage(1);
    setHasMore(false);
    currentQueryRef.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    query, setQuery, results, loading, error, clearSearch,
    hasMore, loadMore, activeCategory, setActiveCategory, tooShort,
    /** Content IDs that aren't available on any of the user's services.
     *  Empty when `onlyOnMyServices` is true (items get filtered out
     *  instead). Renderer uses this to tint the poster + show "where
     *  it lives" service icons (state 2/3). */
    unavailableIds,
    /** Per-item "From £X.XX" labels. Used for both state 1.5 (on-
     *  service paid) and state 3 (off-service rentable). Items absent
     *  from this map have no priced rent/buy entry. */
    rentBuyPrices,
    /** Per-item set of tiers the user can use to watch this title.
     *  On-service items: tiers restricted to user's services. Off-
     *  service items: tiers anywhere. Drives the cost filter post-
     *  processing in the renderer. */
    availableTiers,
  };
}
