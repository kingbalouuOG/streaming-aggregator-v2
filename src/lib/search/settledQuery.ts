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

/** Shortest query the fuzzy test will touch — below this, edits are the word. */
const MIN_FUZZY_LENGTH = 4;

/** Edits tolerated before two queries count as different searches. */
const MAX_TYPO_DISTANCE = 2;

/** Levenshtein distance, answering only "is it within `max`?". */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  // Full DP over two rows. Queries are short; clarity beats cleverness.
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    // Every path through the remaining rows only adds cost, so once a whole
    // row exceeds the budget the answer is settled.
    if (Math.min(...current) > max) return false;
    previous = current;
  }
  return previous[b.length] <= max;
}

/**
 * Are these two settled queries the same search, still being typed or fixed?
 *
 * Two tests, because real captures broke each one on its own:
 *
 * 1. **Prefix, in both directions.** Handles typing (`sev` → `severance`)
 *    and backspacing (`severence` → `sever`). Forward-only misses the
 *    second, which the 2026-09-08 capture did.
 * 2. **Edit distance ≤ {@link MAX_TYPO_DISTANCE}.** Handles a correction
 *    that changes a character mid-word, where neither string is a prefix
 *    of the other. The second capture was exactly this: `severenc` →
 *    `severance` diverges at character six, so the prefix test called them
 *    unrelated searches and wrote the abandoned typo as a real row.
 *
 * The {@link MIN_FUZZY_LENGTH} floor keeps the fuzzy test off short
 * queries, where two edits is most of the word (`cars` / `bars` are
 * different searches; `severenc` / `severance` are one).
 *
 * This can still merge two genuinely different searches that happen to
 * look alike (`the bear` / `the bees`). That is the intended trade: a
 * merge costs one data point, while a false split fabricates a
 * zero-result row and corrupts the retrieval-bug tripwire (§6).
 *
 * Compared case-insensitively, matching how `search_terms_daily`
 * normalises terms, so `Sev` → `severance` collapses like `sev` would.
 */
export function collapsesInto(previous: string, next: string): boolean {
  const a = previous.trim().toLowerCase();
  const b = next.trim().toLowerCase();
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (a.length < MIN_FUZZY_LENGTH || b.length < MIN_FUZZY_LENGTH) return false;
  return withinEditDistance(a, b, MAX_TYPO_DISTANCE);
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
