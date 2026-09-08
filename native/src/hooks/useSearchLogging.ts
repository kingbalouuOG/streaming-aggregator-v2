import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getFlag } from '@/lib/featureFlags';
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
// SHIPS DARK. Every emit here is gated on the per-user `search_logging`
// flag, default false. The policy text describing search capture is live
// from the same build, but no row is written for a user until Joe turns
// the flag on for them, having told them first. That per-user consent is
// the interim stand-in for the policy's section 10 in-app change notice,
// which does not exist yet (IN-SL-003, deferred to H1).

/** How long the typed text must hold still before a query counts as settled. */
const SETTLE_MS = 1500;

/**
 * How long a settled query is held before being written anyway.
 *
 * Generous on purpose. Every *terminal* signal flushes the buffer already
 * (submit, result tap, cleared box, leaving the screen), so this only
 * catches a search abandoned in place. Making it short would reintroduce
 * the bug it sits alongside: a user who pauses, then resumes typing, would
 * have their prefix written before the real query ever arrived.
 */
const FLUSH_IDLE_MS = 8000;

/** Below this the search itself does not run (see `useSearch`). */
const MIN_QUERY_LENGTH = 2;

/**
 * Per-user gate for everything in this module, cached the way
 * `useSemanticFlag` caches `search_semantic`: one round-trip held for the
 * session. `getFlag` memoises per (user, flag), so the call sites below
 * share a single read.
 *
 * Fails CLOSED. A logged-out user, an unset flag and a failed query all
 * resolve to `false`, and `data` is `undefined` until the read lands --
 * every one of those means "do not log", which is the only safe default
 * for a capture the user has not been told about yet.
 */
export function useSearchLoggingFlag() {
  return useQuery({
    queryKey: ['native', 'flag', 'search_logging'],
    queryFn: () => getFlag('search_logging', false),
    staleTime: 10 * 60 * 1000,
  });
}

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
  const { data: loggingOn } = useSearchLoggingFlag();

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
    // Checked BEFORE anything is held or written, so a flag turned on
    // mid-session can still log a query that settled while it was off.
    if (!loggingOn) return;

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
  }, [settled, q, resultsFor, category, results, isFetching, loggingOn, write]);

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

  // Leaving the screen.
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
  const { data: loggingOn } = useSearchLoggingFlag();

  useEffect(() => {
    if (!intent || loading || !results) return;
    if (!loggingOn) return;
    if (loggedNonceRef.current === intent.nonce) return;
    loggedNonceRef.current = intent.nonce;

    emitSearch(intent.query ?? '', results.length, {
      mode: intent.mode,
      metadata: { query: intent.query, ...intent.metadata },
    });
  }, [intent, results, loading, loggingOn]);
}
