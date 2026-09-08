/**
 * Collapsing a typed search down to the query the user actually meant.
 *
 * The settle timer alone is not enough. It was assumed that a 1.5 s pause
 * meant "the user stopped on this query", so a prefix could never settle
 * and §5.3's prefix rule needed no lookahead. First real capture
 * (2026-09-08, one search for "severance") disproved that:
 *
 *   17:58:34  sev        56 results
 *   17:58:37  severence   0 results   <- typo
 *   17:58:40  sever      41 results   <- backspacing
 *   17:58:43  severance  13 results
 *
 * Four rows, ~2.8 s apart, for one search. People type in bursts and read
 * the results between them; a mid-word pause is indistinguishable from a
 * finished query if you only look at elapsed time.
 *
 * The cost is not just noise. The measurement plan (recommendation §6)
 * treats zero-result rate as the retrieval-bug tripwire — "anything above
 * ~10% is a retrieval bug to chase". That session reports 25% while the
 * user's actual outcome was a successful search, so ordinary typo
 * correction would manufacture a retrieval problem that does not exist.
 * `search_terms_daily` would likewise count `sev` and `sever` as intended
 * searches.
 *
 * So a settled query is BUFFERED rather than emitted, and the next settled
 * query decides its fate.
 */

export interface SettledQuery {
  query: string;
  category: string;
  resultCount: number;
}

/**
 * Are these two settled queries the same search, still being typed?
 *
 * True when either is a prefix of the other. The check is deliberately
 * **bidirectional**: a forward-only test handles typing (`sev` →
 * `severance`) but not correcting (`severence` → `sever`), and the real
 * capture above did both. Equal strings collapse too — the same query
 * settling twice is one search.
 *
 * Compared case-insensitively, matching how `search_terms_daily`
 * normalises terms, so `Sev` → `severance` collapses like `sev` would.
 */
export function collapsesInto(previous: string, next: string): boolean {
  const a = previous.trim().toLowerCase();
  const b = next.trim().toLowerCase();
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Decide what a newly settled query does to the buffered one.
 *
 * Returns the query to emit now (if any) and the query to hold. A held
 * query is emitted later by a terminal signal — submit, result tap, the
 * box being cleared, leaving the screen — or by the idle flush.
 *
 * Category is part of the identity: re-slicing the same text through the
 * All / Movies / TV / Docs chips is a distinct intent with a distinct
 * result count, so it flushes rather than collapses.
 */
export function reconcileSettled(
  pending: SettledQuery | null,
  candidate: SettledQuery,
): { emit: SettledQuery | null; pending: SettledQuery } {
  if (
    pending &&
    pending.category === candidate.category &&
    collapsesInto(pending.query, candidate.query)
  ) {
    // Same search, still being typed. The newer one supersedes it; the
    // older one is never written.
    return { emit: null, pending: candidate };
  }
  // An unrelated query. Whatever was held was a real, finished search.
  return { emit: pending, pending: candidate };
}
