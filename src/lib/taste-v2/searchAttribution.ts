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
 * Constants live in `./types.ts` (mirrored to `_shared/taste-v2/`).
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
