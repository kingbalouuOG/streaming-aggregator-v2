/**
 * User Interactions Event Log
 *
 * Emits immutable events to the user_interactions table.
 * Events are fire-and-forget — failures are logged but do not
 * block the user action that triggered them.
 */

import { isSupabaseActive, getAuthUserId } from '../storage';
import { supabase } from '../supabase';
import type { Json } from '../database.types';
import { invalidateDismissedIdsCache } from './recommendations';
import { getCurrentSessionId } from '../instrumentation/sessionId';
import { getCardClickContext } from '../instrumentation/clickContext';
import { recordSearchTimestamp } from '../taste-v2/searchAttribution';

// — Event types ——————————————————————————————————————————————————

export type InteractionEventType =
  | 'thumbs_up'
  | 'thumbs_down'
  | 'watchlist_add'
  | 'watched'
  | 'removed'
  | 'quiz_answer'
  | 'quiz_completed'
  | 'detail_view'
  | 'dwell_event'
  | 'deep_link_click'
  | 'not_interested'
  | 'search';

export type ExitReason =
  | 'deep_link_click'
  | 'added_to_watchlist'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'marked_watched'
  | 'not_interested'
  | 'back_to_previous'
  | 'app_backgrounded';

export interface InteractionEvent {
  event_type: InteractionEventType;
  content_id?: number | null;
  media_type?: 'movie' | 'tv' | null;
  source_surface?: string | null;
  session_id?: string | null;
  metadata?: Record<string, unknown>;
}

// — Emit ———————————————————————————————————————————————————————————

/**
 * ENG-1 Workstream D: outcome events whose metadata gains the
 * position-at-click context ({ position, origin_surface }) when the
 * click-context stash matches the event's content_id. The training
 * extract view (migration 045) reads metadata->>'position'.
 */
const CLICK_CONTEXT_EVENTS = new Set<InteractionEventType>([
  'detail_view', 'thumbs_up', 'thumbs_down', 'watchlist_add', 'watched',
  'removed', 'deep_link_click', 'not_interested',
]);

/**
 * Emit a user interaction event.
 * Fire-and-forget: errors are logged but never thrown.
 * No-op when Supabase is not active (guest/unauthenticated users).
 */
export async function emitInteraction(event: InteractionEvent): Promise<void> {
  if (!isSupabaseActive()) return;

  try {
    const userId = getAuthUserId();
    if (!userId) return;

    // ENG-1 Workstream D: merge position-at-click into outcome metadata.
    // Caller-supplied position wins; contentKey match is enforced by
    // getCardClickContext.
    let metadata = event.metadata ?? {};
    if (event.content_id != null && CLICK_CONTEXT_EVENTS.has(event.event_type)) {
      const click = getCardClickContext(event.content_id);
      if (click && metadata.position === undefined) {
        metadata = { ...metadata, position: click.position, origin_surface: click.origin_surface };
      }
    }

    const { error } = await supabase
      .from('user_interactions')
      .insert({
        user_id: userId,
        event_type: event.event_type,
        content_id: event.content_id ?? null,
        media_type: event.media_type ?? null,
        source_surface: event.source_surface ?? null,
        session_id: event.session_id ?? null,
        metadata: metadata as unknown as Json,
      });

    if (error) {
      console.error('[Interactions] Failed to emit event:', event.event_type, error.message);
    }
  } catch (err) {
    console.error('[Interactions] Unexpected error emitting event:', err);
  }
}

// — Convenience emitters ———————————————————————————————————————————

/** Emit a content-related interaction (thumbs_up, watched, etc.) */
export function emitContentInteraction(
  eventType: 'thumbs_up' | 'thumbs_down' | 'watchlist_add' | 'watched' | 'removed',
  contentId: number,
  mediaType: 'movie' | 'tv',
  metadata?: Record<string, unknown>
): void {
  emitInteraction({
    event_type: eventType,
    content_id: contentId,
    media_type: mediaType,
    metadata,
  }).catch(() => {});
}

/**
 * Emit a detail page view event. Anchor event for subsequent dwell
 * and outcome events — IT IS NOT a positive signal (IN-002).
 *
 * `source_surface` is now a top-level column populated as 'detail'.
 * The legacy `source` field that was nested in metadata is dropped.
 */
export function emitDetailView(
  contentId: number,
  mediaType: 'movie' | 'tv',
  title: string
): void {
  emitInteraction({
    event_type: 'detail_view',
    content_id: contentId,
    media_type: mediaType,
    source_surface: 'detail',
    session_id: getCurrentSessionId(),
    metadata: { title },
  }).catch(() => {});
}

/**
 * Search mode — drives the downstream consumption pipeline (Phase 3
 * search-as-signal). `lookup` is the default Mode A keyword search.
 * `filter` is a FilterSheet-only entry with no query string. `semantic`
 * is reserved for Mode C / Cluster B when the embedding path goes live.
 */
export type SearchMode = 'lookup' | 'filter' | 'semantic';

/**
 * Emit a search event. `session_id` + `mode` were added in Phase Search
 * V2 — they're optional on the wire (column allows NULL) so older
 * captures don't break, but every new emission populates them.
 */
export function emitSearch(
  query: string,
  resultCount: number,
  options: { mode?: SearchMode; metadata?: Record<string, unknown> } = {},
): void {
  const { mode = 'lookup', metadata = {} } = options;
  const sessionId = getCurrentSessionId();
  // Mark the session as "recently searched" so the next content
  // interaction within SEARCH_ATTRIBUTION_WINDOW_SECONDS gets a taste-
  // vector boost. The incremental path reads from this cache; the
  // 24h recompute reads search rows from the DB instead.
  recordSearchTimestamp(sessionId);
  emitInteraction({
    event_type: 'search',
    session_id: sessionId,
    metadata: { query, result_count: resultCount, mode, ...metadata },
  }).catch(() => {});
}

/**
 * Mark a title as "Not Interested" (IN-007).
 *
 * Writes a not_interested event to user_interactions and invalidates
 * the in-memory dismissed-ids cache so the v1 recommendation engine
 * picks up the new dismissal on its next refresh.
 *
 * Source surface is hard-coded to 'detail' because the only entry
 * point in v2 is the "Not Interested" button on the detail page.
 */
export async function markNotInterested(
  contentId: number,
  mediaType: 'movie' | 'tv'
): Promise<void> {
  await emitInteraction({
    event_type: 'not_interested',
    content_id: contentId,
    media_type: mediaType,
    source_surface: 'detail',
    session_id: getCurrentSessionId(),
  });
  invalidateDismissedIdsCache();
}

/**
 * Emit a dwell_event when a detail page is closed (IN-001, IN-003, IN-004).
 *
 * The dwell timer (Task 8) calls this on exit. The session_id MUST be
 * the value the dwell timer captured at startDwell() time, not a fresh
 * lookup — see Task 8 for the rationale (5-minute abandonment case).
 *
 * `session_negative_accumulator` is the running per-session negative
 * weight at emit time, capped at -1.0 by the dwell timer. Phase 0 emits
 * it as a real metadata field for verification and Phase 3 consumption.
 */
export function emitDwellEvent(args: {
  contentId: number;
  mediaType: 'movie' | 'tv';
  dwellSeconds: number;
  exitReason: ExitReason;
  sessionId: string;
  sessionNegativeAccumulator: number;
}): void {
  emitInteraction({
    event_type: 'dwell_event',
    content_id: args.contentId,
    media_type: args.mediaType,
    source_surface: 'detail',
    session_id: args.sessionId,
    metadata: {
      dwell_seconds: args.dwellSeconds,
      exit_reason: args.exitReason,
      session_negative_accumulator: args.sessionNegativeAccumulator,
    },
  }).catch(() => {});
}

/**
 * Emit a deep_link_click event (IN-013).
 *
 * Called from openDeepLink.ts after AppLauncher.openUrl() either
 * succeeds (confidence: 'high') or falls back to the browser
 * (confidence: 'low').
 */
export function emitDeepLinkClick(args: {
  contentId: number;
  mediaType: 'movie' | 'tv';
  serviceId: string;
  deepLinkUrl: string;
  dwellSecondsBeforeClick: number;
  confidence: 'high' | 'low';
  /**
   * Whether the resolved URL was an exact deep link or a search-page
   * fallback. Computed in the opener (openDeepLink.native.ts) and passed
   * through — until A2 (roadmap 0.3) it was spread in but silently
   * dropped here, so this now persists as `link_type`. Optional because
   * legacy/web callers may not supply it; null when unknown.
   */
  linkType?: 'exact' | 'search';
  /**
   * The rent/buy price string shown at click time, exactly as rendered
   * (e.g. "Rent from £3.49"), or null for flat-rate "on your stack"
   * services that show no price. Completes the click-out record for
   * Weekly Watch Decisions + affiliate/B2B seed data (A2 / roadmap 0.3).
   */
  priceShown?: string | null;
}): void {
  emitInteraction({
    event_type: 'deep_link_click',
    content_id: args.contentId,
    media_type: args.mediaType,
    source_surface: 'detail',
    session_id: getCurrentSessionId(),
    metadata: {
      service_id: args.serviceId,
      deep_link_url: args.deepLinkUrl,
      dwell_seconds_before_click: args.dwellSecondsBeforeClick,
      confidence: args.confidence,
      link_type: args.linkType ?? null,
      price_shown: args.priceShown ?? null,
    },
  }).catch(() => {});
}

// — Query helpers (for future replay/analytics) ————————————————————

/**
 * Whether the current user has already logged an interaction of this
 * (content_id, media_type, event_type) identity.
 *
 * The incremental taste path (useTasteProfile.trackInteraction) uses this
 * to apply a signal at most once — matching the recompute's
 * dedupeInteractionsByIdentity() (A4 / roadmap 0.5) — so repeated taps
 * (e.g. mark-watched ×4) don't multiply a title's weight.
 *
 * Call BEFORE emitting the new event, so the just-tapped row isn't what
 * gets detected. Fails open (returns false) on error: a rare double-count
 * is better than silently dropping a real signal, and the 24h recompute
 * is the source of truth that heals either way.
 */
export async function hasPriorInteraction(
  contentId: number,
  mediaType: 'movie' | 'tv',
  eventType: InteractionEventType,
): Promise<boolean> {
  if (!isSupabaseActive()) return false;

  try {
    const userId = getAuthUserId();
    if (!userId) return false;

    const { data, error } = await supabase
      .from('user_interactions')
      .select('id')
      .eq('user_id', userId)
      .eq('content_id', contentId)
      .eq('media_type', mediaType)
      .eq('event_type', eventType)
      .limit(1);

    if (error) {
      console.error('[Interactions] hasPriorInteraction check failed:', error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.error('[Interactions] hasPriorInteraction unexpected error:', err);
    return false;
  }
}

/** Get all interactions for the current user, ordered by created_at */
export async function getUserInteractions(
  limit = 500,
  eventTypes?: InteractionEventType[]
): Promise<InteractionEvent[]> {
  if (!isSupabaseActive()) return [];

  try {
    let query = supabase
      .from('user_interactions')
      .select('event_type, content_id, media_type, metadata')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (eventTypes && eventTypes.length > 0) {
      query = query.in('event_type', eventTypes);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Interactions] Failed to query interactions:', error.message);
      return [];
    }

    // Database returns string for event_type; cast to the narrowed
    // InteractionEventType union the caller expects. Runtime values
    // are constrained by the CHECK constraint to stay in the union.
    return (data ?? []) as unknown as InteractionEvent[];
  } catch (err) {
    console.error('[Interactions] Unexpected error querying interactions:', err);
    return [];
  }
}

/** Count interactions by type for the current user */
export async function getInteractionCounts(): Promise<Record<string, number>> {
  if (!isSupabaseActive()) return {};

  try {
    const { data, error } = await supabase
      .from('user_interactions')
      .select('event_type');

    if (error || !data) return {};

    const counts: Record<string, number> = {};
    for (const row of data) {
      counts[row.event_type] = (counts[row.event_type] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}
