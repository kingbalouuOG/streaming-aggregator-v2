/**
 * Dwell Timer (IN-001, IN-003, IN-004)
 *
 * Tracks how long the user stays on the detail page and what they
 * did when they left. Coordinates with the lifecycle manager
 * (appState.ts) to exclude background time from dwell and with the
 * session ID module (sessionId.ts) so the emitted dwell_event is
 * tagged with the session the user was actually looking at the
 * page during — NOT a fresh session ID lookup at emit time, which
 * matters when a 5+ minute background causes a session rollover
 * mid-dwell (the abandonment timer still fires with the OLD
 * session ID).
 *
 * This module is a singleton — only one detail page can be tracked
 * at a time, which matches v1's navigation model (no detail-in-detail
 * stack; each detail view replaces the previous one via
 * App.tsx's selectedItem state).
 *
 * ─── Idempotent exit path ──────────────────────────────────────
 * All state-mutating functions (exitDwell, pauseDwell, resumeDwell)
 * are no-ops when internal state is null. Multiple code paths can
 * race to call exitDwell (safety-net timer, action buttons, unmount
 * effect, post-deep-link .then handler); idempotency ensures only
 * the first call emits the dwell_event. Callers are free to
 * defensively call exitDwell() on unmount even if an earlier code
 * path already exited.
 *
 * ─── Expected-background handling ──────────────────────────────
 * On appState background with `expected: true` (inside the 3-second
 * deep-link correlation window), the dwell timer does NOTHING. No
 * pause, no exit, no state change. The caller that triggered the
 * deep link is responsible for calling exitDwell('deep_link_click')
 * after `await openDeepLink(...)` resolves. A 10-second safety-net
 * timer is armed to protect against a hung or thrown await.
 *
 * ─── Session negative accumulator ───────────────────────────────
 * Running per-session total of negative dwell weight, capped at -1.0.
 * Phase 0 does not interpret dwell signals — the v1 engine doesn't
 * read dwell_event at all — but we compute the value using the
 * interpretation matrix from Signal Spec §3.2 / §4.2 and emit it as
 * dwell_event.metadata.session_negative_accumulator. Phase 3 can
 * decide whether to consume or retire the field. Reset to 0 on
 * session rollover via the sessionId module's onSessionReset hook.
 */

import { subscribe as appStateSubscribe } from '../lifecycle/appState';
import { getCurrentSessionId, onSessionReset } from './sessionId';
import { emitDwellEvent, type ExitReason } from '../storage/interactions';

const ABANDON_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEEP_LINK_SAFETY_MS = 10 * 1000; // 10 seconds

// ── Module state ────────────────────────────────────────────────

let startedAt: number | null = null;
let accumulatedMs = 0;
let isPaused = false;
let contentId: number | null = null;
let mediaType: 'movie' | 'tv' | null = null;
let sessionIdAtStart: string | null = null; // captured at startDwell(), used at emit time
let lastAction: ExitReason | null = null;
let sessionNegativeAccumulator = 0; // per-session; reset on session rollover
let backgroundAbandonTimer: ReturnType<typeof setTimeout> | null = null;
let deepLinkSafetyTimer: ReturnType<typeof setTimeout> | null = null;
let initialised = false;

// ── Helpers ─────────────────────────────────────────────────────

function computeDwellSeconds(): number {
  if (contentId === null) return 0;
  if (isPaused) return accumulatedMs / 1000;
  if (startedAt === null) return accumulatedMs / 1000;
  return (accumulatedMs + (Date.now() - startedAt)) / 1000;
}

/**
 * Apply the Signal Spec §3.2/§4.2 negative-weight rules for a
 * `back_to_previous` exit. All other exit reasons return 0 here —
 * their positive/negative weighting is Phase 3's job; Phase 0 only
 * tracks the running negative accumulator for the session cap.
 */
function computeNegativeWeight(dwellSeconds: number, reason: ExitReason): number {
  if (reason !== 'back_to_previous') return 0;
  if (dwellSeconds < 3) return 0;
  if (dwellSeconds < 10) return -0.15;
  if (dwellSeconds < 30) return -0.25;
  return -0.35;
}

function clearBackgroundAbandonTimer(): void {
  if (backgroundAbandonTimer !== null) {
    clearTimeout(backgroundAbandonTimer);
    backgroundAbandonTimer = null;
  }
}

function clearDeepLinkSafetyTimer(): void {
  if (deepLinkSafetyTimer !== null) {
    clearTimeout(deepLinkSafetyTimer);
    deepLinkSafetyTimer = null;
  }
}

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;

  appStateSubscribe((active, expected) => {
    if (contentId === null) return;

    if (!active) {
      // Background. Two cases:
      //   (a) expected=true: deep-link correlation window. Do
      //       NOTHING. Arm the 10-second safety net for the case
      //       where the caller's exitDwell never fires.
      //   (b) expected=false: pause the timer and arm the
      //       5-minute abandonment fallback.
      if (expected) {
        // Arm the safety net. Clear any prior one first so we
        // don't stack timers across multiple rapid deep links.
        clearDeepLinkSafetyTimer();
        deepLinkSafetyTimer = setTimeout(() => {
          // If exitDwell has not been called within 10 seconds,
          // force-exit with deep_link_click. The dwell seconds
          // are computed at emit time, which by then is frozen
          // because we never unpaused (the `expected=true` branch
          // does not pause).
          if (contentId !== null) {
            exitDwell('deep_link_click');
          }
        }, DEEP_LINK_SAFETY_MS);
        return;
      }

      // Normal background: pause the running timer.
      if (!isPaused && startedAt !== null) {
        accumulatedMs += Date.now() - startedAt;
        startedAt = null;
        isPaused = true;
      }

      // Arm the 5-minute abandonment fallback.
      clearBackgroundAbandonTimer();
      backgroundAbandonTimer = setTimeout(() => {
        if (contentId !== null) {
          exitDwell('app_backgrounded');
        }
      }, ABANDON_TIMEOUT_MS);
      return;
    }

    // Foreground. Clear the abandonment timer (user returned in
    // time) and resume if paused.
    clearBackgroundAbandonTimer();
    if (isPaused) {
      startedAt = Date.now();
      isPaused = false;
    }
  });

  onSessionReset(() => {
    sessionNegativeAccumulator = 0;
  });
}

// ── Public API ──────────────────────────────────────────────────

export function startDwell(id: number, type: 'movie' | 'tv'): void {
  ensureInitialised();

  // If a previous dwell is still open (shouldn't happen in normal
  // usage, but be defensive), exit it first with back_to_previous
  // so we don't leak state between consecutive detail pages.
  if (contentId !== null) {
    exitDwell('back_to_previous');
  }

  startedAt = Date.now();
  accumulatedMs = 0;
  isPaused = false;
  contentId = id;
  mediaType = type;
  sessionIdAtStart = getCurrentSessionId();
  lastAction = null;
  clearBackgroundAbandonTimer();
  clearDeepLinkSafetyTimer();
}

/**
 * Record the most recent user action on the currently-tracked
 * detail page. On exitDwell() with no explicit reason, this is
 * the exit_reason that gets emitted. No-op when no dwell is active.
 *
 * Callers: action button onClick handlers in DetailPage.tsx
 * (thumbs up/down, watchlist toggle, mark as watched).
 */
export function setLastAction(reason: ExitReason): void {
  if (contentId === null) return;
  lastAction = reason;
}

/**
 * Current dwell duration in seconds for the active dwell, or 0 if
 * none is active. Used by the "Watch on {service}" button handler
 * to capture dwell_seconds_before_click for the deep_link_click
 * event (Task 9a).
 */
export function getCurrentDwellSeconds(): number {
  return computeDwellSeconds();
}

/**
 * Exit the current dwell, finalise dwell_seconds, update the
 * session negative accumulator if the exit is a `back_to_previous`
 * falling in one of the negative weight bands, and emit the
 * dwell_event.
 *
 * No-op when no dwell is active (idempotent exit — see header).
 *
 * If `reason` is omitted, the exit reason is (a) the most recent
 * setLastAction() call if any, or (b) 'back_to_previous' as the
 * default for a plain unmount without an intervening action.
 */
export function exitDwell(reason?: ExitReason): void {
  if (contentId === null) return;

  const finalReason: ExitReason = reason ?? lastAction ?? 'back_to_previous';
  const finalDwellSeconds = computeDwellSeconds();

  // Update session negative accumulator (capped at -1.0). The
  // weight is 0 for any reason other than back_to_previous, so
  // this is a no-op for explicit actions.
  const weight = computeNegativeWeight(finalDwellSeconds, finalReason);
  if (weight < 0) {
    sessionNegativeAccumulator = Math.max(-1, sessionNegativeAccumulator + weight);
  }

  emitDwellEvent({
    contentId,
    mediaType: mediaType!, // contentId !== null implies mediaType !== null
    dwellSeconds: finalDwellSeconds,
    exitReason: finalReason,
    sessionId: sessionIdAtStart!, // captured at startDwell, always non-null when contentId is set
    sessionNegativeAccumulator,
  });

  // Clear per-dwell state. sessionNegativeAccumulator persists
  // across dwells within a session — it's per-session, not per-dwell.
  startedAt = null;
  accumulatedMs = 0;
  isPaused = false;
  contentId = null;
  mediaType = null;
  sessionIdAtStart = null;
  lastAction = null;
  clearBackgroundAbandonTimer();
  clearDeepLinkSafetyTimer();
}
