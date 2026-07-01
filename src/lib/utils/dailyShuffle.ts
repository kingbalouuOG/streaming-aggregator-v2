/**
 * Day-seeded rotation helpers.
 *
 * The Home rails are otherwise deterministic (popularity snapshots), so
 * they look frozen day-to-day. These helpers add visible movement WITHOUT
 * new data by seeding a PRNG on the current UTC day: the order is stable
 * within a day (no flicker on re-render, same result on web and Edge) and
 * changes at 00:00 UTC. Same seeding convention as the For You exploration
 * slot (recommendations-v2/exploration.ts).
 */

/** FNV-1a 32-bit string hash. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — deterministic given the seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC day stamp (YYYY-MM-DD) — same value on client and Edge within a day. */
export function utcDayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Seeded RNG for `${salt}:${UTC day}`. */
function dayRng(salt: string): () => number {
  return mulberry32(fnv1a(`${salt}:${utcDayStamp()}`));
}

/**
 * Fisher–Yates shuffle of the first `topN` items (the rest kept in place
 * and appended), seeded by `${salt}:${UTC day}`. Shuffling only the head
 * keeps quality high — a stable top pool reorders daily without weak
 * tail items floating up. Pure; returns a new array.
 */
export function dailyShuffleTopN<T>(items: T[], topN: number, salt = ''): T[] {
  if (items.length <= 1) return [...items];
  const n = Math.min(topN, items.length);
  const head = items.slice(0, n);
  const rng = dayRng(salt);
  for (let i = head.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [head[i], head[j]] = [head[j], head[i]];
  }
  return [...head, ...items.slice(n)];
}

/**
 * Deterministic daily pick of one element from the first `topN` items.
 * Returns undefined for an empty list. Used to rotate the hero among the
 * top contenders while leaving the underlying ranking intact.
 */
export function dailyPick<T>(items: T[], topN = items.length, salt = ''): T | undefined {
  if (items.length === 0) return undefined;
  const n = Math.min(topN, items.length);
  const rng = dayRng(salt);
  return items[Math.floor(rng() * n)];
}
