import { useCallback, useSyncExternalStore } from 'react';

import type { QuickFilterCategory } from '@/lib/content/quickFilter';

// Which chip is active, per surface (recommendation 2026-09-08-002 §1.6).
//
// Only the STATE lives here. What a category means, which rails survive and
// which chips a payload can offer are pure functions in
// `src/lib/content/quickFilter.ts` — in the shared tree, because that is
// where the vitest suite can reach them.
//
// The state is deliberately the least durable thing in the app:
//
//   - EPHEMERAL. Nothing is persisted. Module scope means the selection
//     survives a tab switch — which screen-local state would not, since the
//     tab bar keeps screens mounted — and dies with the process on a cold
//     start. A sticky filter on a tab called "New" makes the tab lie, and is
//     the classic "why is my feed empty" support ticket.
//   - PER-SURFACE. New and For You hold their own. Filtering "what's new"
//     and filtering "what's for me" are different intents.
//   - NOT A TASTE SIGNAL (§1.7). Changes are logged (see useQuickFilterLog)
//     and never learned from. The explicit, visible, reversible control for
//     a movie/TV preference is the contentMix slider in Profile; if the
//     logging later shows someone filtering to Movies on most opens, the
//     right move is to SUGGEST moving that slider, not to nudge their
//     vector behind their back.
//
// Why not Zustand or Context: this is two enum values. useSyncExternalStore
// over a module-scoped object is the whole implementation, with no provider
// to thread through the tab layout.

export * from '@/lib/content/quickFilter';

/** The two surfaces that carry a strip. Browse is untouched — it has the full sheet. */
export type QuickFilterSurface = 'new' | 'forYou';

interface SurfaceState {
  category: QuickFilterCategory;
  /**
   * Increments on every user-driven change. The screens log against this
   * rather than against `category`, so Movies → All → Movies is three
   * intents, not two — and so the initial 'All' (nonce 0), which nobody
   * chose, is never logged as though someone did.
   */
  nonce: number;
}

const INITIAL: SurfaceState = { category: 'All', nonce: 0 };

const state: Record<QuickFilterSurface, SurfaceState> = {
  new: INITIAL,
  forYou: INITIAL,
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Set a surface's chip.
 *
 * Returns nothing and logs nothing: the store cannot know how many rails
 * survived, and a filter event without those counts is not worth writing.
 * The screen owns the emit — see `useQuickFilterLog`.
 */
export function setQuickFilter(surface: QuickFilterSurface, category: QuickFilterCategory): void {
  const current = state[surface];
  if (current.category === category) return;
  state[surface] = { category, nonce: current.nonce + 1 };
  for (const listener of listeners) listener();
}

/**
 * Read a surface's chip state.
 *
 * The snapshot is the per-surface object, which is REPLACED rather than
 * mutated on every change — `useSyncExternalStore` compares by reference, so
 * building a fresh object in the getter would loop forever.
 */
export function useQuickFilter(surface: QuickFilterSurface): SurfaceState & {
  setCategory: (category: QuickFilterCategory) => void;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state[surface],
    () => state[surface],
  );
  const setCategory = useCallback(
    (category: QuickFilterCategory) => setQuickFilter(surface, category),
    [surface],
  );
  return { ...snapshot, setCategory };
}

/** Test seam — the store is module state, so suites must be able to clear it. */
export function resetQuickFilters(): void {
  state.new = INITIAL;
  state.forYou = INITIAL;
  for (const listener of listeners) listener();
}
