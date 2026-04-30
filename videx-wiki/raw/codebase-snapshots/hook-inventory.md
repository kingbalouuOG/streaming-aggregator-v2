---
title: Hook Inventory
generated: 2026-04-26
source: src/hooks/
---

# Hook Inventory

One line per `useX` hook. Each is a service-layer adapter between a screen and the data libraries.

| Hook | Returns | Primary callers | Depends on |
|---|---|---|---|
| `useHomeContent` | `{ rows, loading, error, refresh }` for the Home surface (hero, recently added, trending, coming soon, per-service charts, genre spotlight). | `App.tsx` Home route. | `useContentService`, `useTasteProfile`, `recommendations-v2/ranker`, `sectionSessionCache`. |
| `useForYouContent` | `{ rows, sliderState, loading, refresh }` for the For You surface. Conditional rows based on data depth. | `ForYouPage`. | `useTasteProfile`, `recommendations-v2/ranker`, `useMoodRoomsRow`. |
| `useBrowse` | `{ results, filters, setFilters, loading }` for browse and discover. | `BrowsePage`. | `tmdb`, `useSearch`, `useSectionData`. |
| `useContentDetail` | `{ detail, loading, error, refresh }` for the detail page. | `DetailPage`. | `tmdb`, `omdb`, `supabaseContent`, `detailAdapter`. |
| `useContentService` | Raw content fetchers (trending, popular, by category). | `useHomeContent`, `useBrowse`, `useSectionData`. | `tmdb`, `cache`. |
| `useTasteProfile` | `{ profile, sliders, updateSliders, recordInteraction }` for the taste system. | `useForYouContent`, `useHomeContent`, `DetailPage` (for "More Like This"). | `taste-v2/tasteProfileV2`, `taste-v2/interactionUpdate`, `storage/interactions`. |
| `useSectionData` | Paginated section data for a TMDb discover query with infinite scroll. | `BrowsePage`, `LazyGenreSection`. | `tmdb`, `cache`. |
| `useSearch` | Debounced search with recent + trending suggestions. | `BrowsePage`. | `tmdb`, `searchUtils`. |
| `useUpcoming` | Coming Soon / Calendar releases for the user's connected services. | `CalendarPage`. | `tmdb`, `useUserPreferences`. |
| `useWatchlist` | `{ items, add, remove, rate, isInWatchlist }`. Auto-invalidates recommendation caches on mutation. | `WatchlistPage`, `DetailPage`, `ContentCard`. | `storage/watchlist`, `storage/recommendations`. |
| `useUserPreferences` | `{ preferences, updatePreferences, completeOnboarding }`. | `OnboardingFlow`, `ProfilePage`. | `storage/userPreferences`, `supabaseStorage`. |
| `useNetworkStatus` | `{ online }` derived from Capacitor Network API. | `App.tsx` (offline banner), `auth/NoConnectionScreen`. | `@capacitor/network`. |
| `useIntersectionObserver` | Generic IntersectionObserver hook for lazy loading. | `LazyGenreSection`, `ContentRow`. | none. |
| `useMoodRoomsRow` | `{ rooms, loading }` for the For You mood rooms row. | `MoodRoomsRow`. | `supabaseMoodRooms`. |

## Conventions

- Hooks return memoised state; mutation actions are stable references via `useCallback`.
- Network-bound hooks expose `loading` and `error` separately.
- Hooks fire-and-forget interaction events via `storage/interactions`; never block UI on instrumentation.
- Hooks read from Supabase content cache before falling back to TMDb/OMDB live.
