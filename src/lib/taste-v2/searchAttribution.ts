/**
 * Search-attribution boost — Phase Search V2 follow-up (Level 1).
 *
 * Two surfaces use the same window logic but differ in how they
 * source recent-search timestamps:
 *
 *  - **Incremental update** (`applyInteractionIncremental`):
 *    `emitSearch` populates an in-memory cache keyed by session_id
 *    at search-emit time. The next content interaction queries
 *    `getMostRecentSearchAt(sessionId)` before the vector update.
 *    Zero DB round-trips on the hot path.
 *
 *  - **Batch recompute** (`recomputeFromInteractions`): replays the
 *    full `user_interactions` history. Fetches search events from the
 *    DB and walks them in lockstep with taste-relevant events,
 *    applying `isWithinAttributionWindow` for the same gating.
 *
 * Constants live in `./types.ts` (single-sourced since PLAT-3).
 * This module is client-only — Edge Functions never run incremental
 * updates, so no mirror is required here.
 */

import {
  SEARCH_ATTRIBUTION_WINDOW_SECONDS,
} from './types';

// ── In-memory cache (incremental path) ──────────────────────────────

// Keyed by session_id. Stores the timestamp (ms since epoch) of the
// most recent search emitted in that session. Module-scope; no
// persistence — session continuity comes from getCurrentSessionId(),
// and a fresh process / sign-out starts the cache empty.
const recentSearches = new Map<string, number>();

export function recordSearchTimestamp(sessionId: string | null | undefined): void {
  if (!sessionId) return;
  recentSearches.set(sessionId, Date.now());
}

export function getMostRecentSearchAt(sessionId: string | null | undefined): number | null {
  if (!sessionId) return null;
  return recentSearches.get(sessionId) ?? null;
}

export function resetSearchAttributionCache(): void {
  recentSearches.clear();
}

// ── Content-intent gate (used by both paths) ────────────────────────

/**
 * Does a `search` row express *content intent* — i.e. should the next
 * interaction in its session get the attribution boost?
 *
 * Not every `search` row is a search for something. Since 2026-09-08 the
 * native Browse screen emits `mode: 'filter'` rows for a FilterSheet
 * apply, and Session 2's quick-filter chips will emit one on **every chip
 * change** on New and For You. Those are re-slices of a page the user is
 * already looking at, not a statement of what they want. Left ungated,
 * a tap on the "Movies" chip would mark the session "recently searched"
 * and hand a 1.3x boost to every interaction on that page for the next
 * 60 seconds — turning an idle browse into a taste-vector event.
 *
 * The rule, and the ONLY definition of it:
 *
 * | `mode`     | metadata          | Boost |
 * |------------|-------------------|-------|
 * | `lookup`   | —                 | yes — the user typed what they wanted |
 * | `semantic` | `mood_key`        | yes — the user picked a described vibe |
 * | `filter`   | `mood_key`        | yes — a mood preset with the flag off; same intent, different retrieval |
 * | `filter`   | has `refine`      | **no** — a refine chip, whatever else the row carries |
 * | `filter`   | no `mood_key`     | **no** — a filter apply or a quick-filter chip |
 *
 * The `refine` row wins over the `mood_key` row, and that ORDER is the whole
 * point of it. Browse's refine chips shipped on 2026-09-09 stamping
 * `mood_key: intent.moodKey` on every toggle, so a chip tapped while a preset
 * was lit satisfied the mood-preset line above and re-armed the boost on what
 * is a re-slice of the page the user is already looking at — three sessions
 * apart, a later one writing metadata an earlier one's rule read as intent.
 * The call site no longer sends `mood_key`; this excludes the row anyway,
 * because a rule that only holds while every caller remembers is not a rule,
 * and because the batch recompute still has to judge the rows already written.
 *
 * A row with no `mode` at all is treated as intent-bearing: the only way
 * to produce one is a caller predating the field, and dropping real
 * history is worse than an occasional boost.
 *
 * Both paths call this: `emitSearch` before `recordSearchTimestamp`
 * (incremental), and `recomputeFromInteractionsScoped` when it builds
 * `searchesBySession` (batch). Keeping one predicate is the point — the
 * two paths silently disagreeing is exactly the bug class this prevents.
 */
export function isContentIntentSearch(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return true;
  if (metadata.mode !== 'filter') return true;
  // A refine chip is a constraint on the current page, never a statement of
  // what the user wants — no matter what else the row carries.
  if (metadata.refine !== null && metadata.refine !== undefined) return false;
  const moodKey = metadata.mood_key;
  return moodKey !== null && moodKey !== undefined && moodKey !== '';
}

// ── Pure window check (used by both paths) ──────────────────────────

/**
 * True when an event occurred at or after `searchAtMs` and within
 * `SEARCH_ATTRIBUTION_WINDOW_SECONDS` of it. The lower bound prevents
 * a pathological clock skew or out-of-order replay from boosting an
 * event that *preceded* the search.
 */
export function isWithinAttributionWindow(
  eventAtMs: number,
  searchAtMs: number | null,
): boolean {
  if (searchAtMs === null) return false;
  const ageMs = eventAtMs - searchAtMs;
  return ageMs >= 0 && ageMs <= SEARCH_ATTRIBUTION_WINDOW_SECONDS * 1000;
}
