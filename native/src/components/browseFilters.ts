// Browse filter model (native v1) — one import site for the filter
// vocabulary. The model itself lives in the shared tree at
// `src/lib/content/browseFilters.ts`, because it is pure and the root vitest
// suite only covers `src/`; native has no test runner. Same split as
// `quickFilter.ts`, and the same reason.
//
// The web supports 9 axes; native filters the axes ContentItem actually
// carries plus the two the presets session added server-side handling for:
// services, type, genre, rating, runtime, released, cost, watched.
// (`language` still needs per-item data the native search doesn't fetch —
// deferred.)
//
// `cost` is a SERVER-SIDE-ONLY axis: nothing on ContentItem carries a stream
// type, so `applyBrowseFilters` deliberately ignores it. See the note there.

export {
  DEFAULT_FILTERS,
  GENRE_OPTIONS,
  SORT_LABELS,
  applyBrowseFilters,
  countActiveFilters,
  minYearForWindow,
  sortItems,
  type BrowseFilters,
  type ContentType,
  type CostFilter,
  type ReleasedWindow,
  type RuntimeBand,
  type SortMode,
  type WatchedFilter,
} from '@/lib/content/browseFilters';

// Re-exported so native code has one import site for the filter vocabulary.
// The definitions live in the shared tree because both content adapters do,
// and because the root vitest suite only covers `src/` — see
// `src/lib/content/__tests__/documentary.test.ts`.
export { contentMediaType, isDocumentary, DOCUMENTARY_GENRE_ID } from '@/lib/content/documentary';
