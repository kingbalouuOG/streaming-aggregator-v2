// PLAT-1 (plan §5 / E&P brief §5 Workstream E) — app-level zustand store.
//
// SMALL by design: only genuinely app-level state lives here —
// `activeTab`, the global `filters` (FilterState), the two derived-
// from-watchlist sets every surface consumes (`bookmarkedIds`,
// `watchedIds`, plus the `ratings` map DetailPage/WatchlistPage read),
// and the user's connected services in both representations
// (`userServices: ServiceId[]` for badges, `providerIds: number[]`
// for TMDb queries). `showFilters` rides along because the global
// FilterSheet is shared between App (home) and BrowsePage.
//
// App.tsx remains the WRITER — its existing handlers/effects push
// into the store; pages are READERS via selectors. Explicitly NOT
// here (PLAT-3+ continues the shrink): selectedItem/navigation stack,
// watchlist item arrays, auth, theme, and App's scroll-position /
// pull-to-refresh state (that churns every frame; this store must
// not).
//
// `actions` is the established stable-callback-registry pattern:
// App registers a set of wrappers ONCE on mount (stable identities
// that dispatch to a ref holding the latest handlers), so memo'd
// readers never see churning callback props.

import { create } from "zustand";
import type { ContentItem } from "../types/content";
import type { ServiceId } from "../types/content";
import { defaultFor, type FilterState } from "../search/filterState";

export interface AppActions {
  /** Navigate into the detail page for an item (App's handleItemSelect). */
  onItemSelect: (item: ContentItem) => void;
  /** Add/remove an item from the watchlist (App's handleToggleBookmark). */
  onToggleBookmark: (item: ContentItem) => void;
  /** Remove a bookmark by content-item id (App's handleRemoveBookmark). */
  onRemoveBookmark: (id: string) => void;
  /** Move a watchlist item to watched (App's handleMoveToWatched). */
  onMoveToWatched: (id: string) => void;
  /** Move a watched item back to want-to-watch (App's handleMoveToWantToWatch). */
  onMoveToWantToWatch: (id: string) => void;
  /** Rate a title thumbs up/down/clear (App's handleRate). */
  onRate: (id: string, rating: "up" | "down" | null) => void;
}

const noopActions: AppActions = {
  onItemSelect: () => {},
  onToggleBookmark: () => {},
  onRemoveBookmark: () => {},
  onMoveToWatched: () => {},
  onMoveToWantToWatch: () => {},
  onRate: () => {},
};

interface AppStore {
  // ── Navigation ────────────────────────────────────────────────
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // ── Global filters (FilterState + the shared FilterSheet flag) ─
  filters: FilterState;
  setFilters: (next: FilterState | ((prev: FilterState) => FilterState)) => void;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;

  // ── Derived-from-watchlist sets (App's useWatchlist is source) ─
  bookmarkedIds: Set<string>;
  watchedIds: Set<string>;
  ratings: Record<string, "up" | "down">;
  setWatchlistDerived: (
    bookmarkedIds: Set<string>,
    watchedIds: Set<string>,
    ratings: Record<string, "up" | "down">,
  ) => void;

  // ── Connected services (App's useUserPreferences is source) ────
  userServices: ServiceId[];
  providerIds: number[];
  setConnectedServices: (providerIds: number[], userServices: ServiceId[]) => void;

  // ── Stable app-level callbacks (registered once by App) ────────
  actions: AppActions;
  registerActions: (actions: AppActions) => void;
}

export const useAppStore = create<AppStore>()((set) => ({
  activeTab: "home",
  setActiveTab: (tab) => set({ activeTab: tab }),

  filters: defaultFor([]),
  setFilters: (next) =>
    set((state) => ({
      filters: typeof next === "function" ? next(state.filters) : next,
    })),
  showFilters: false,
  setShowFilters: (show) => set({ showFilters: show }),

  bookmarkedIds: new Set<string>(),
  watchedIds: new Set<string>(),
  ratings: {},
  setWatchlistDerived: (bookmarkedIds, watchedIds, ratings) =>
    set({ bookmarkedIds, watchedIds, ratings }),

  userServices: [],
  providerIds: [],
  setConnectedServices: (providerIds, userServices) =>
    set({ providerIds, userServices }),

  actions: noopActions,
  registerActions: (actions) => set({ actions }),
}));
