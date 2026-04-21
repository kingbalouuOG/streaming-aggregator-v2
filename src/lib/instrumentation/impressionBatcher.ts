/**
 * Impression Batcher (IN-010)
 *
 * Accumulates card_impressions events in memory and flushes them
 * to Supabase in batches. recordImpression() is called from every
 * card render in the home surface, so it MUST be cheap and
 * synchronous — it's a plain array append.
 *
 * ─── Six flush triggers ──────────────────────────────────────────
 *
 *   1. Interval timer: every 10 seconds
 *   2. Buffer size: flush immediately on reaching 100 events
 *   3. App lifecycle BACKGROUND  (via appState.subscribe)
 *   4. App lifecycle FOREGROUND  (via appState.subscribe)
 *   5. Bottom nav tab change     (wired in App.tsx:handleTabChange)
 *   6. Detail page entry         (wired in App.tsx:handleItemSelect)
 *
 * Triggers 1-4 are wired inside this module. Triggers 5 and 6 are
 * wired in App.tsx (which already owns those event handlers) by
 * calling flushNow() directly before the navigation side-effect.
 * Forgetting one of the six is the most likely Phase 0 bug — the
 * original brief flagged this specifically.
 *
 * ─── user_id stamping ────────────────────────────────────────────
 *
 * Per Joe's Task 7 reminder: user_id MUST be stamped on every
 * ImpressionEvent at recordImpression() call time, not left to a
 * database default. The card_impressions RLS policy requires
 * auth.uid() = user_id, and any row with a NULL user_id (or a
 * user_id mismatching the current session) is silently dropped by
 * RLS. We look up getAuthUserId() synchronously at recordImpression()
 * time and drop the impression silently if no authenticated user is
 * present — impressions are not critical enough to buffer unbound
 * for unauthenticated users.
 *
 * ─── Failure handling ────────────────────────────────────────────
 *
 * Impressions are not critical data. On flush failure we retry once
 * and then drop the batch with a console error. We do NOT
 * re-enqueue failed events into the buffer because (a) the same
 * failure is likely to recur on the next flush, (b) unbound buffer
 * growth is worse than dropped analytics, and (c) the whole
 * pipeline degrades gracefully — missing a batch of impressions
 * affects only downstream CTR analytics, not user-facing behaviour.
 */

import { subscribe as appStateSubscribe } from '../lifecycle/appState';
import { getCurrentSessionId } from './sessionId';
import { supabase } from '../supabase';
import { isSupabaseActive, getAuthUserId } from '../storage';

const FLUSH_INTERVAL_MS = 10 * 1000;
const BUFFER_FLUSH_THRESHOLD = 100;

export type ImpressionSurface =
  | 'home'
  | 'for_you'
  | 'mood_room'
  | 'browse'
  | 'watchlist'
  | 'search'
  | 'detail';

export interface RecordImpressionInput {
  contentId: number;
  sourceSurface: ImpressionSurface;
  position: number;
}

// Internal buffered shape — matches the card_impressions table
// column set so the flush is a straight INSERT.
interface BufferedImpression {
  user_id: string;
  content_id: number;
  source_surface: ImpressionSurface;
  position: number;
  session_id: string;
  shown_at: string; // ISO8601
}

// ── Module state ────────────────────────────────────────────────

let buffer: BufferedImpression[] = [];
let flushInFlight = false;
let initialised = false;

// ── Lifecycle init ──────────────────────────────────────────────

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;

  // Trigger 1: periodic flush. The interval lives for the app
  // lifetime — no cleanup path because the module is never torn
  // down outside unit tests.
  setInterval(() => {
    void flushNow();
  }, FLUSH_INTERVAL_MS);

  // Triggers 3 + 4: app lifecycle transitions. Fire on both
  // directions (background AND foreground) so we capture pending
  // impressions on the way out and start fresh on the way back in.
  appStateSubscribe(() => {
    void flushNow();
  });
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Append a card impression to the buffer. Synchronous and cheap —
 * safe to call from every card render. No-op when no authenticated
 * user is present (guest users do not populate card_impressions).
 */
export function recordImpression(input: RecordImpressionInput): void {
  ensureInitialised();

  if (!isSupabaseActive()) return;

  const userId = getAuthUserId();
  if (!userId) return;

  buffer.push({
    user_id: userId,
    content_id: input.contentId,
    source_surface: input.sourceSurface,
    position: input.position,
    session_id: getCurrentSessionId(),
    shown_at: new Date().toISOString(),
  });

  // Trigger 2: buffer size threshold.
  if (buffer.length >= BUFFER_FLUSH_THRESHOLD) {
    void flushNow();
  }
}

/**
 * Drain the buffer and batch-insert to Supabase. Resolves when
 * the write completes (or is silently dropped on retry failure).
 * Safe to call concurrently — a flush already in flight will
 * absorb any events that race in during its execution, and a
 * second caller just sees flushInFlight and returns immediately.
 */
export async function flushNow(): Promise<void> {
  ensureInitialised();

  if (flushInFlight) return;
  if (buffer.length === 0) return;
  if (!isSupabaseActive()) return;

  // Atomically drain. Any new impressions recorded after this point
  // land in a fresh buffer and will be picked up by the next flush.
  const batch = buffer;
  buffer = [];
  flushInFlight = true;

  try {
    let { error } = await supabase.from('card_impressions').insert(batch);

    if (error) {
      // Single retry — impressions are not critical.
      const retry = await supabase.from('card_impressions').insert(batch);
      error = retry.error;
    }

    if (error) {
      console.error(
        '[impressionBatcher] dropped batch of',
        batch.length,
        'impressions after retry:',
        error.message
      );
    }
  } catch (err) {
    console.error('[impressionBatcher] unexpected flush error:', err);
  } finally {
    flushInFlight = false;
  }
}
