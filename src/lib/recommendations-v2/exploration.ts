/**
 * Exploration Slot (ENG-1 Workstream C)
 *
 * Reserves EXPLORATION_COUNT positions in Recommended For You for
 * exploration candidates: titles with zero prior impressions for this
 * user, drawn from the moderate-similarity band (EXPLORATION_BAND taste
 * percentiles of the scored pool), popularity-weighted. A structural
 * defence against filter-bubble drift — this formalises inside the
 * flagship row what "Outside Your Usual" gestures at.
 *
 * Determinism: sampling is seeded from `${userId}:${UTC day}` — the slot
 * is stable within a day (no flicker on re-render or slider re-rank, and
 * Edge ≡ client for the parity probe) and rotates daily. UTC on both
 * sides by design.
 *
 * Impression tagging: picks carry `exploration: true` on the ContentItem;
 * ContentRow writes it into card_impressions.metadata so ENG-2 can read
 * exploration CTR straight from the training extract.
 *
 * "Zero prior impressions" = not among the user's most recent 1,000
 * impressions (90-day window). PostgREST caps unpaginated reads at 1,000
 * rows (the C18 lesson) — the most recent 1,000 are exactly the ones that
 * matter for novelty, so we order DESC and accept the cap rather than
 * paginate. Documented in the eval doc.
 */

import { supabase } from '../supabase';
import { getAuthUserId, isSupabaseActive } from '../storage';
import type { ScoredCandidate } from './types';

const SEEN_WINDOW_DAYS = 90;
const SEEN_FETCH_CAP = 1000;

/** FNV-1a 32-bit string hash (duplicated in taste-v2/kmeans.ts — the
 *  mirror boundary makes a shared helper module more coupling than 10
 *  lines of hash is worth; PLAT-3 collapses this). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — deterministic given the seed */
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

/** UTC day stamp — same value on client and Edge within a day */
export function explorationDayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Most recent impressions for the signed-in user → Set of content_ids */
export async function fetchSeenContentIds(): Promise<Set<number>> {
  const seen = new Set<number>();
  if (!isSupabaseActive()) return seen;

  const userId = getAuthUserId();
  if (!userId) return seen;

  const since = new Date(Date.now() - SEEN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('card_impressions')
    .select('content_id')
    .eq('user_id', userId)
    .gte('shown_at', since)
    .order('shown_at', { ascending: false })
    .limit(SEEN_FETCH_CAP);

  if (error) {
    console.error('[Exploration] seen-set query failed:', error.message);
    return seen;
  }

  for (const row of data ?? []) {
    if (row.content_id != null) seen.add(row.content_id);
  }
  return seen;
}

export interface ExplorationOptions {
  seenContentIds: Set<number>;
  /** contentKeys already used by built rows — picks must not duplicate */
  excludeKeys: Set<string>;
  count: number;
  /** Taste-score percentile band [low, high) of the scored pool */
  band: [number, number];
  /** Seed string — `${userId}:${explorationDayStamp()}` */
  seed: string;
}

/**
 * Pure selection: percentile-band slice by taste score → drop seen +
 * excluded → popularity-weighted sample of `count` without replacement,
 * seeded. Exported for unit tests and the eval rig.
 */
export function selectExplorationCandidates(
  scored: ScoredCandidate[],
  opts: ExplorationOptions,
): ScoredCandidate[] {
  const { seenContentIds, excludeKeys, count, band, seed } = opts;
  if (scored.length === 0 || count <= 0) return [];

  // Band by taste-score rank (scored is finalScore-ordered; taste rank is
  // the similarity dimension the band is defined over)
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
    // Popularity-weighted roulette; missing popularity → neutral 1
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

/**
 * Splice picks into a built row at the configured positions (clamped to
 * the row length as it grows). Pure; returns a new array.
 */
export function spliceAtPositions<T>(row: T[], picks: T[], positions: number[]): T[] {
  const out = [...row];
  for (let i = 0; i < picks.length; i++) {
    const pos = Math.min(positions[i] ?? out.length, out.length);
    out.splice(pos, 0, picks[i]);
  }
  return out;
}
