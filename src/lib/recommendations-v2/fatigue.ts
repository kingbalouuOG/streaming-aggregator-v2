/**
 * Engagement fatigue — Workstream C1.
 *
 * THE PROBLEM, measured 2026-08-26. The For You pipeline is deterministic:
 * same taste vector → same pool → same scores → same MMR → same order. So
 * repetition scales directly with how often a user comes back:
 *
 *   For You sessions   distinct titles   views/title
 *          1                  18            1.00
 *          2                  20            2.10
 *          6                  40            2.93
 *          9                  29            4.45
 *
 * Nine sessions, 129 impressions, 29 distinct titles — out of a catalogue
 * of 24,496. `seenIds` was already being fetched on every render, but only
 * to pick exploration candidates; it demoted nothing.
 *
 * THE FIX. A two-stage demotion, applied to the score exactly as
 * `applyAvoidPenalty` does:
 *
 *   PARK  (below the bury threshold)  small per-view nudge; the title
 *                                     slides down but stays eligible
 *   BURY  (at the threshold, default 4+)  decisive demotion; effectively
 *                                     out of the top 20
 *
 * Both decay to nothing over FATIGUE_DECAY_DAYS, so a parked title
 * genuinely returns rather than being permanently blacklisted.
 *
 * ENGAGEMENT EXEMPTS. A title the user interacted with — opened, dwelled
 * on, watched, saved, liked, shared, clicked through — is never fatigued.
 * Repetition is only a problem for things being ignored.
 *
 * ⚠ WHY THIS NEEDED C2 FIRST. Demoting from a pure top-K pool does not
 * surface anything new — it just shuffles the same K and shrinks what is
 * usable. C2 raised retrieval depth (500→800, 200→400 per centroid) so
 * demoted titles have something to fall behind.
 *
 * ⚠ VALIDATION IS THIN, DELIBERATELY. The plan says validate via
 * exploration CTR rather than offline eval — but with ~10 users and 42
 * For You impressions in a fortnight there is no CTR signal and no A/B to
 * run. This ships on reasoning. The check is re-measuring views-per-title
 * for multi-session users in a few weeks; if the thresholds are wrong,
 * the data will be slow to say so. That is the argument for the gentler
 * bury threshold.
 */

import type { UserScope } from '../server/userScope';
import type { ScoredCandidate } from './types';

/** Impression history for one title, for this user. */
export interface FatigueEntry {
  views: number;
  /** Epoch ms of the most recent impression — drives the decay. */
  lastSeenMs: number;
}

/**
 * Keyed by `content_id` (the TMDb id) rather than the `movie-123`
 * contentKey, because `card_impressions` has no `media_type` column —
 * the same limitation the existing `fetchSeenContentIdsScoped` carries.
 * A movie and a series sharing a TMDb id would collide; the consequence
 * is one wrongly-demoted title, so it is not worth a schema change.
 */
export type FatigueMap = Map<number, FatigueEntry>;

export interface FatigueData {
  fatigue: FatigueMap;
  /** content_ids the user has actually engaged with — exempt from fatigue. */
  engaged: Set<number>;
}

export interface FatigueConfig {
  /** Views at or above which a title is buried rather than parked. */
  buryThreshold: number;
  /** Score penalty per view while parked (below the threshold). */
  parkPenaltyPerView: number;
  /** Score penalty once buried. */
  buryPenalty: number;
  /** Days over which a penalty decays linearly to zero. */
  decayDays: number;
}

/**
 * Events that count as engagement. Deliberately broad: the signal we want
 * is "the user did anything at all with this", not "the user liked it".
 *
 * `not_interested` and `thumbs_down` are absent on purpose — those are
 * already hard-filtered out of the pool upstream, so fatiguing them would
 * be dead code.
 *
 * NOTE (deferred): the plan plausibly argues that a `deep_link_click`
 * with no follow-through should demote PLACEMENT while leaving TASTE
 * alone — the user went and did not come back. There are 10
 * `deep_link_click` rows in the entire database, which is nothing to tune
 * against, so it is treated as ordinary engagement for now.
 */
const ENGAGEMENT_EVENTS = [
  'detail_view',
  'dwell_event',
  'watched',
  'deep_link_click',
  'watchlist_add',
  'thumbs_up',
  'share',
] as const;

/** Impressions older than the decay window carry no penalty, so there is
 *  no reason to fetch them. Slightly wider than the default decay so a
 *  config change does not silently truncate its own input. */
const FATIGUE_WINDOW_DAYS = 45;
const FATIGUE_FETCH_CAP = 2000;

interface ImpressionRow {
  content_id: number | null;
  shown_at: string | null;
}

interface InteractionRow {
  content_id: number | null;
}

/**
 * Impression counts and engagement, in one parallel window.
 *
 * Aggregated in TypeScript rather than SQL: PostgREST has no clean
 * group-by, and the row volume per user inside the window is small
 * (the whole table is ~5k rows across all users).
 *
 * Never throws — a fatigue failure must degrade to "no demotion", not to
 * a broken feed.
 */
export async function fetchFatigueScoped(scope: UserScope): Promise<FatigueData> {
  const empty: FatigueData = { fatigue: new Map(), engaged: new Set() };

  const since = new Date(Date.now() - FATIGUE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [impressionsRes, interactionsRes] = await Promise.all([
      scope
        .select('card_impressions', 'content_id, shown_at')
        .gte('shown_at', since)
        .order('shown_at', { ascending: false })
        .limit(FATIGUE_FETCH_CAP),
      scope
        .select('user_interactions', 'content_id')
        .in('event_type', ENGAGEMENT_EVENTS as unknown as readonly unknown[]),
    ]);

    if (impressionsRes.error) {
      console.error('[Fatigue] impression query failed:', impressionsRes.error.message);
      return empty;
    }

    const fatigue: FatigueMap = new Map();
    for (const row of (impressionsRes.data ?? []) as ImpressionRow[]) {
      if (row.content_id == null) continue;
      const seenMs = row.shown_at ? new Date(row.shown_at).getTime() : 0;
      const existing = fatigue.get(row.content_id);
      if (existing) {
        existing.views += 1;
        if (seenMs > existing.lastSeenMs) existing.lastSeenMs = seenMs;
      } else {
        fatigue.set(row.content_id, { views: 1, lastSeenMs: seenMs });
      }
    }

    const engaged = new Set<number>();
    // An interaction-query failure is non-fatal on its own: without it we
    // simply fatigue some titles the user did engage with. Log and carry
    // on rather than dropping the impression data too.
    if (interactionsRes.error) {
      console.error('[Fatigue] interaction query failed:', interactionsRes.error.message);
    } else {
      for (const row of (interactionsRes.data ?? []) as InteractionRow[]) {
        if (row.content_id != null) engaged.add(row.content_id);
      }
    }

    return { fatigue, engaged };
  } catch (err) {
    console.error('[Fatigue] fetch threw:', err instanceof Error ? err.message : String(err));
    return empty;
  }
}

/**
 * Penalty for one title. Exported for testing and for the eval rig.
 *
 * Returns 0 for anything engaged with, never seen, or seen long enough
 * ago that the demotion has decayed away.
 */
export function fatiguePenaltyFor(
  entry: FatigueEntry | undefined,
  engaged: boolean,
  config: FatigueConfig,
  nowMs: number,
): number {
  if (!entry || engaged || entry.views <= 0) return 0;

  const ageDays = (nowMs - entry.lastSeenMs) / (24 * 60 * 60 * 1000);
  // Linear decay to zero. A title last shown a full decay window ago is
  // treated as unseen, which is what lets parked titles come back.
  const freshness = 1 - ageDays / config.decayDays;
  if (freshness <= 0) return 0;
  const decay = Math.min(1, freshness);

  const base =
    entry.views >= config.buryThreshold
      ? config.buryPenalty
      : // Park: proportional to how often it has been ignored, capped just
        // below the bury threshold so there is a clear step up to burial
        // rather than a gradual slide into it.
        config.parkPenaltyPerView * Math.min(entry.views, config.buryThreshold - 1);

  return base * decay;
}

/**
 * Demote seen-but-ignored titles. Mirrors `applyAvoidPenalty`: subtract
 * from `finalScore`, then re-sort, so every downstream stage (row
 * building, MMR, exploration) sees the adjusted order without needing to
 * know fatigue exists.
 */
export function applyFatiguePenalty(
  scored: ScoredCandidate[],
  data: FatigueData,
  config: FatigueConfig,
  nowMs: number = Date.now(),
): ScoredCandidate[] {
  if (scored.length === 0 || data.fatigue.size === 0) return scored;

  const out = scored.map((c) => {
    const penalty = fatiguePenaltyFor(
      data.fatigue.get(c.tmdbId),
      data.engaged.has(c.tmdbId),
      config,
      nowMs,
    );
    return penalty === 0 ? c : { ...c, finalScore: c.finalScore - penalty };
  });

  out.sort((a, b) => b.finalScore - a.finalScore);
  return out;
}
