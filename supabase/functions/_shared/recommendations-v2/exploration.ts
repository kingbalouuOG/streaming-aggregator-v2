// Mirror of src/lib/recommendations-v2/exploration.ts — ADR-011 (final
// mirror generation per E&P D1; PLAT-3 dissolves this).
//
// Edge-side adjustments vs the client copy:
// - fetchSeenContentIds reads card_impressions via UserScope (user-owned
//   table, service-role contract).
// - Selection + splice are byte-identical pure functions.

import type { UserScope } from '../userScope.ts';
import type { ScoredCandidate } from './types.ts';

const SEEN_WINDOW_DAYS = 90;
const SEEN_FETCH_CAP = 1000;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

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

export function explorationDayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function fetchSeenContentIds(scope: UserScope): Promise<Set<number>> {
  const seen = new Set<number>();

  const since = new Date(Date.now() - SEEN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await scope
    .select('card_impressions', 'content_id')
    .gte('shown_at', since)
    .order('shown_at', { ascending: false })
    .limit(SEEN_FETCH_CAP);

  if (error) {
    console.error('[Exploration] seen-set query failed:', error.message);
    return seen;
  }

  for (const row of (data ?? []) as { content_id: number | null }[]) {
    if (row.content_id != null) seen.add(row.content_id);
  }
  return seen;
}

export interface ExplorationOptions {
  seenContentIds: Set<number>;
  excludeKeys: Set<string>;
  count: number;
  band: [number, number];
  seed: string;
}

export function selectExplorationCandidates(
  scored: ScoredCandidate[],
  opts: ExplorationOptions,
): ScoredCandidate[] {
  const { seenContentIds, excludeKeys, count, band, seed } = opts;
  if (scored.length === 0 || count <= 0) return [];

  const byTaste = [...scored].sort((a, b) => b.scores.taste - a.scores.taste);
  const lo = Math.floor(byTaste.length * band[0]);
  const hi = Math.ceil(byTaste.length * band[1]);
  const bandCandidates = byTaste.slice(lo, hi).filter(c =>
    !seenContentIds.has(c.tmdbId) && !excludeKeys.has(c.contentKey),
  );

  if (bandCandidates.length === 0) return [];

  const rng = mulberry32(fnv1a(seed));
  const picks: ScoredCandidate[] = [];
  const remaining = [...bandCandidates];

  while (picks.length < count && remaining.length > 0) {
    let total = 0;
    const weights = remaining.map(c => {
      const w = Math.max(c.meta.popularity ?? 1, 0.001);
      total += w;
      return w;
    });
    let r = rng() * total;
    let idx = remaining.length - 1;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { idx = i; break; }
    }
    picks.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  return picks;
}

export function spliceAtPositions<T>(row: T[], picks: T[], positions: number[]): T[] {
  const out = [...row];
  for (let i = 0; i < picks.length; i++) {
    const pos = Math.min(positions[i] ?? out.length, out.length);
    out.splice(pos, 0, picks[i]);
  }
  return out;
}
