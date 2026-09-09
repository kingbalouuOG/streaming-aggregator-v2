import { useEffect, useRef } from 'react';

import { emitSearch } from '@/lib/storage/interactions';
import type { QuickFilterCategory, QuickFilterSurface } from '@/state/quickFilter';

// Quick-filter chip events (recommendation 2026-09-08-002 §10, §6).
//
// These are `mode: 'filter'` rows with no `mood_key`, which means
// `isContentIntentSearch` returns FALSE for them and they earn no
// search-attribution taste boost. That is the rule working as designed, not
// a gap: a chip re-slices the page in front of you, it does not say what you
// want (§1.7). Do not add a mood_key to "fix" it.
//
// The gate is in `emitSearch` itself, so this writes nothing for a user
// whose `search_logging` flag is off. That is exactly why the gate moved
// there — a store-driven emit like this one has no hook in its path to
// carry a flag check.
//
// `rails_visible` / `items_visible` are the measurement that decides whether
// the thin-rail threshold and the Documentaries backfill were set right
// (§6, §1.3). Without them a filter row says a chip was tapped and nothing
// about whether the result was worth looking at.

interface QuickFilterEvent {
  surface: QuickFilterSurface;
  category: QuickFilterCategory;
  /** Rails still on screen after filtering — the empty state is 0. */
  railsVisible: number;
  /** Total items across those rails. */
  itemsVisible: number;
}

/**
 * Emit one row per chip change.
 *
 * Keyed on `nonce`, not on `category`: Movies → All → Movies is three
 * intents. Nonce 0 is the initial 'All' that nobody chose, so it is skipped
 * — the first row a user generates is their first actual tap.
 */
export function useQuickFilterLog(nonce: number, event: QuickFilterEvent): void {
  const loggedNonceRef = useRef(0);
  // Read through a ref so the effect fires on the nonce alone, capturing the
  // counts AS OF THE TAP. That is the measurement §6 wants — "was filtering
  // in place enough?" — so the Documentaries backfill, which lands a moment
  // later, is deliberately not counted here. Depending on the counts
  // directly would instead log again every time one moved.
  const eventRef = useRef(event);
  eventRef.current = event;

  useEffect(() => {
    if (nonce === 0 || loggedNonceRef.current === nonce) return;
    loggedNonceRef.current = nonce;

    const { surface, category, railsVisible, itemsVisible } = eventRef.current;
    emitSearch('', itemsVisible, {
      mode: 'filter',
      metadata: {
        surface,
        category,
        rails_visible: railsVisible,
        items_visible: itemsVisible,
      },
    });
  }, [nonce]);
}
