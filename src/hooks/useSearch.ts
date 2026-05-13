import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMovies, searchTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem, parseContentItemId } from '@/lib/adapters/contentAdapter';
import { getCachedServices } from '@/lib/utils/serviceCache';
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
}

export function useSearch(
  userServices?: ServiceId[],
  initialQuery?: string,
  initialResults?: ContentItem[],
  options: UseSearchOptions = {},
) {
  const { onlyOnMyServices = true, initialUnavailableIds, initialRentBuyPrices } = options;
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<ContentItem[]>(initialResults || []);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(() =>
    initialUnavailableIds ? new Set(initialUnavailableIds) : new Set()
  );
  const [rentBuyPrices, setRentBuyPrices] = useState<Map<string, string>>(() =>
    initialRentBuyPrices ? new Map(initialRentBuyPrices) : new Map()
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
    if (pending.size === 0 && offServices.size === 0 && remove.size === 0 && rentBuy.size === 0) return;

    const badgeUpdates = new Map(pending);
    const offSet = new Set(offServices);
    const removeSet = new Set(remove);
    const rentBuyUpdates = new Map(rentBuy);
    pending.clear();
    offServices.clear();
    remove.clear();
    rentBuy.clear();

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
  }, []);

  const fetchAvailabilityAndBadges = useCallback((items: ContentItem[], q: string, connectedServices: ServiceId[]) => {
    pendingBadgesRef.current.clear();
    offServicesRef.current.clear();
    removeRef.current.clear();
    pendingRentBuyRef.current.clear();
    if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);

    let completed = 0;
    const total = items.length;
    const noUserServices = connectedServices.length === 0;
    const dropOffServices = onlyOnMyServicesRef.current && !noUserServices;

    items.forEach(async (item) => {
      try {
        const { tmdbId, mediaType } = parseContentItemId(item.id);
        const allItemServices = await getCachedServices(String(tmdbId), mediaType);

        if (allItemServices.length === 0) {
          // No UK availability — always drop.
          removeRef.current.add(item.id);
          return;
        }
        if (noUserServices) {
          // Logged-out / pre-onboarding: no service set to intersect
          // against, but the title is at least UK-available — show it.
          pendingBadgesRef.current.set(item.id, allItemServices);
          return;
        }
        const matching = allItemServices.filter((s) => connectedServices.includes(s));
        if (matching.length > 0) {
          // On-service path — title lives on at least one of the
          // user's services in some tier. Priority order:
          //   1. If it's rent/buy on a user service → state 1.5:
          //      no tint, matched service icons, price pill showing
          //      "Rent/Buy from £X.XX". The user can act on the
          //      title without leaving their existing setup, but
          //      they'll pay. Honour-the-money-they'd-spend signal.
          //   2. Otherwise → state 1: no tint, no price pill (free
          //      at point of play via subscription / ads / free).
          pendingBadgesRef.current.set(item.id, matching);
          getRentBuyPrice(tmdbId, mediaType, matching).then((price) => {
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
        } else if (dropOffServices) {
          removeRef.current.add(item.id);
        } else {
          // Off-service (state 2 or 3). Tag for tinting + populate the
          // "where it lives" icons (all the title's services, not
          // filtered). Fire the rent/buy price check across every
          // service; if it returns a label we'll upgrade to state 3.
          offServicesRef.current.add(item.id);
          pendingBadgesRef.current.set(item.id, allItemServices.slice(0, 3));
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
          if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);
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
    /** Per-item "From £X.XX" labels for off-service titles that are
     *  rentable/buyable. Renderer passes the value through to
     *  ContentCard's `rentBuyPriceLabel` prop (state 3). Items absent
     *  from this map are state 2 (off-service, no rent/buy). */
    rentBuyPrices,
  };
}
