/**
 * Pull-to-refresh timing and outcome rules (IN-UX-002).
 *
 * The native New and For You feeds are served from the videx-api Worker's
 * KV cache, so a refetch usually comes back in a couple of hundred
 * milliseconds with the same titles. Two things followed from that on
 * device (2026-09-14): the spinner was dismissed before the finger had
 * even lifted, and nothing on the page changed — so a refresh that worked
 * looked exactly like one that did nothing. These helpers hold the
 * spinner long enough to be seen and say plainly what the refresh found.
 */

/** Shortest time the spinner stays up, however fast the refetch is. */
export const MIN_REFRESH_MS = 700;

/** How long the completion cue stays on screen. */
export const REFRESH_CUE_MS = 1200;

export type RefreshOutcome = 'updated' | 'current' | 'failed';

export const REFRESH_CUE_COPY: Record<RefreshOutcome, string> = {
  updated: 'Updated just now',
  // The common case while the Worker serves a cached feed. Saying so is
  // the whole point: it tells the user the refresh ran and why the page
  // did not move.
  current: "You're up to date",
  failed: "Couldn't refresh. Check your connection.",
};

/**
 * Resolve (or reject) with `work`, but never before `ms` have passed.
 * `wait` is injectable for tests.
 */
export async function holdAtLeast<T>(
  work: Promise<T>,
  ms: number,
  wait: (ms: number) => Promise<void> = (d) => new Promise((resolve) => setTimeout(resolve, d)),
): Promise<T> {
  const floor = wait(ms);
  try {
    return await work;
  } finally {
    await floor;
  }
}

/**
 * Compares what is on screen before and after, rather than the payload
 * object: react-query's structural sharing would keep an identical Home
 * payload's reference, but the For You payload carries a client-measured
 * `wallclockMs` that differs on every fetch, so reference equality would
 * report "updated" for the same titles.
 */
export function refreshOutcome({
  failed,
  before,
  after,
}: {
  failed: boolean;
  before: string;
  after: string;
}): RefreshOutcome {
  if (failed) return 'failed';
  return before === after ? 'current' : 'updated';
}

/** Order-sensitive signature of the titles a feed renders. */
export function itemSignature(
  groups: ReadonlyArray<ReadonlyArray<{ id: string }> | null | undefined>,
): string {
  return groups.map((group) => (group ?? []).map((item) => item.id).join(',')).join('|');
}
