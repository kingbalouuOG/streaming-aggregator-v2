import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribe as appStateSubscribe } from '@/lib/lifecycle/appState';
import { reconcileSettled, type SettledQuery } from '@/lib/search/settledQuery';
import { emitSearch, type SearchMode } from '@/lib/storage/interactions';

// Search-term logging on native (recommendation 2026-09-08-002 §5).
//
// The emitter has existed since Phase Search V2 — `emitSearch` writes a
// `user_interactions` row with `event_type = 'search'`, a session id and a
// `metadata` blob. The web app has called it since 2026-05; native never did,
// so production held zero `search` rows. These hooks are the native call
// sites. No new table, no new column: deletion (migration 042) and export
// (043/061) already cover `user_interactions`, and the 30-day retention on
// the free-text field lands in migration 079.
//
// The rule that matters for the privacy promise: SETTLED queries only, once
// each. Never one row per keystroke — and, since the first real capture,
// never one row per pause either (see `settledQuery.ts`).
//
// SHIPS DARK — but the gate is no longer here. `emitSearch` itself checks
// the per-user `search_logging` flag (default false), so no caller can
// bypass it by forgetting. This module therefore buffers and reconciles
// unconditionally and lets the emitter decide; the wasted work for a
// user with logging off is a couple of timers and no network at all.
// See `src/lib/storage/interactions.ts` for the reasoning and the
// consent position (IN-SL-003).

/** How long the typed text must hold still before a query counts as settled. */
const SETTLE_MS = 1500;

/**
 * How long a settled query is held before being written anyway.
 *
 * Generous on purpose. Every *terminal* signal flushes the buffer already,
 * so this only catches a search abandoned with the app still open and
 * Browse still on screen. Making it short would reintroduce the bug it
 * sits alongside: a user who pauses, then resumes typing, would have their
 * prefix written before the real query ever arrived.
 */
const FLUSH_IDLE_MS = 8000;

/** Below this the search itself does not run (see `useSearch`). */
const MIN_QUERY_LENGTH = 2;

/**
 * Log a typed query — once per search, not once per pause.
 *
 * A query settles when its results have arrived AND the text has been
 * unchanged for {@link SETTLE_MS}, or when the user short-circuits that wait
 * via the returned `markSettled` (keyboard search key, first result tap).
 *
 * A settled query is then **held, not written**, because the next settled
 * query may reveal it was only half-typed. `settledQuery.ts` has the capture
 * that forced this. The held query is written when an unrelated query
 * settles, on a terminal signal (`markSettled`, cleared box, leaving the
 * screen), or after {@link FLUSH_IDLE_MS}.
 */
export function useTypedSearchLog(args: {
  /** Raw box text. Drives the settle timer, so it measures from the keystroke. */
  query: string;
  /** The text `results` were fetched for (the debounced value). */
  resultsFor: string;
  category: string;
  results: readonly unknown[] | undefined;
  isFetching: boolean;
}): () => void {
  const { query, resultsFor, category, results, isFetching } = args;
  const q = query.trim();

  // `force` marks a terminal signal: write immediately instead of holding.
  const [settled, setSettled] = useState<{ text: string; force: boolean } | null>(null);
  const [pending, setPending] = useState<SettledQuery | null>(null);
  const loggedRef = useRef<Set<string>>(new Set());
  // Mirror of `pending` for the unmount flush, whose closure cannot see the
  // latest state.
  const pendingRef = useRef<SettledQuery | null>(null);
  pendingRef.current = pending;

  const write = useCallback((row: SettledQuery) => {
    const key = JSON.stringify([row.query, row.category]);
    if (loggedRef.current.has(key)) return;
    loggedRef.current.add(key);
    emitSearch(row.query, row.resultCount, {
      mode: 'lookup',
      metadata: { category: row.category },
    });
  }, []);

  useEffect(() => {
    if (q.length < MIN_QUERY_LENGTH) {
      setSettled(null);
      return;
    }
    const t = setTimeout(() => setSettled({ text: q, force: false }), SETTLE_MS);
    return () => clearTimeout(t);
  }, [q]);

  /** Submit / first-result-tap: settle now, and write rather than hold. */
  const markSettled = useCallback(() => {
    if (q.length >= MIN_QUERY_LENGTH) setSettled({ text: q, force: true });
  }, [q]);

  useEffect(() => {
    // `settled.text !== q` means the text moved on while we were waiting —
    // the settled value is stale and its count would be for other text.
    if (!settled || settled.text !== q) return;
    // On submit/tap the settle timer is short-circuited, so the debounce may
    // still be trailing a keystroke behind. Waiting for it to catch up is
    // what stops a submitted query being logged as its own prefix.
    if (settled.text !== resultsFor.trim()) return;
    if (isFetching || !results) return;

    const candidate: SettledQuery = {
      query: settled.text,
      category,
      resultCount: results.length,
    };
    const next = reconcileSettled(pendingRef.current, candidate);
    if (next.emit) write(next.emit);

    if (settled.force) {
      // Terminal signal — nothing can supersede this one.
      write(next.pending);
      setPending(null);
    } else {
      setPending(next.pending);
    }
  }, [settled, q, resultsFor, category, results, isFetching, write]);

  // Idle flush — a search abandoned in place still gets recorded.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      write(pending);
      setPending(null);
    }, FLUSH_IDLE_MS);
    return () => clearTimeout(t);
  }, [pending, write]);

  // Cleared box: the search is over, so whatever is held is final.
  useEffect(() => {
    if (q.length >= MIN_QUERY_LENGTH || !pending) return;
    write(pending);
    setPending(null);
  }, [q, pending, write]);

  // — Terminal signals that a held query would otherwise die with —————
  // Buffering trades fabricated rows for lost ones, and the first test of
  // it lost two real searches ("The Bear", "Lord of The..."): both were
  // held, and neither a following query, a tap, a clear nor the 8 s idle
  // ever came. Holding is only safe if every way of leaving writes first.
  // `write` dedupes on (query, category), so overlapping flushes are free.

  // App backgrounded — same terminal signal, and the same subscriber, the
  // impression batcher already uses for its own buffer.
  useEffect(
    () =>
      appStateSubscribe((isActive) => {
        if (isActive || !pendingRef.current) return;
        write(pendingRef.current);
        setPending(null);
      }),
    [write],
  );

  // Navigating away from Browse — switching tabs does not unmount the
  // screen, so the unmount cleanup below never fires for the commonest
  // way of leaving a search behind.
  useFocusEffect(
    useCallback(
      () => () => {
        if (pendingRef.current) write(pendingRef.current);
      },
      [write],
    ),
  );

  // Unmount. Last resort; a hard kill with no background event still
  // loses the held query, which is an accepted under-count — better than
  // writing a query the user was still editing.
  useEffect(
    () => () => {
      if (pendingRef.current) write(pendingRef.current);
    },
    [write],
  );

  return markSettled;
}

/**
 * A discrete, non-typed search intent: a mood card tap or a FilterSheet
 * apply. Unlike a typed query these are already settled at the moment of the
 * tap — there is no half-typed state to collapse, so they are written as soon
 * as the result count is known.
 *
 * `nonce` is what makes each tap its own event: tapping mood A, then B, then
 * A again is three intents, not two. `query` is the semantic phrase on the
 * flag-on path and null everywhere else, and it is passed through metadata so
 * it overrides the positional argument `emitSearch` spreads in.
 */
export interface SearchIntent {
  nonce: number;
  mode: SearchMode;
  /** Free text actually sent to retrieval, or null when there is none. */
  query: string | null;
  metadata: Record<string, unknown>;
}

/** Emit one row per {@link SearchIntent} as soon as its results land. */
export function useSearchIntentLog(
  intent: SearchIntent | null,
  results: readonly unknown[] | undefined,
  loading: boolean,
): void {
  const loggedNonceRef = useRef(0);

  useEffect(() => {
    if (!intent || loading || !results) return;
    if (loggedNonceRef.current === intent.nonce) return;
    loggedNonceRef.current = intent.nonce;

    emitSearch(intent.query ?? '', results.length, {
      mode: intent.mode,
      metadata: { query: intent.query, ...intent.metadata },
    });
  }, [intent, results, loading]);
}
