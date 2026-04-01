/**
 * User Interactions Event Log
 *
 * Emits immutable events to the user_interactions table.
 * Events are fire-and-forget — failures are logged but do not
 * block the user action that triggered them.
 */

import { isSupabaseActive, getAuthUserId } from '../storage';
import { supabase } from '../supabase';

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
  | 'search'
  | 'dismiss';

export interface InteractionEvent {
  event_type: InteractionEventType;
  content_id?: number | null;
  media_type?: 'movie' | 'tv' | null;
  metadata?: Record<string, unknown>;
}

// — Emit ———————————————————————————————————————————————————————————

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

    const { error } = await supabase
      .from('user_interactions')
      .insert({
        user_id: userId,
        event_type: event.event_type,
        content_id: event.content_id ?? null,
        media_type: event.media_type ?? null,
        metadata: event.metadata ?? {},
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

/** Emit a quiz answer event */
export function emitQuizAnswer(pairId: string, chosen: string, phase: string): void {
  emitInteraction({
    event_type: 'quiz_answer',
    metadata: { pair_id: pairId, chosen, phase },
  }).catch(() => {});
}

/** Emit quiz completion event */
export function emitQuizCompleted(answerCount: number, topGenres: string[]): void {
  emitInteraction({
    event_type: 'quiz_completed',
    metadata: { answer_count: answerCount, top_genres: topGenres },
  }).catch(() => {});
}

/** Emit a detail page view event */
export function emitDetailView(
  contentId: number,
  mediaType: 'movie' | 'tv',
  title: string,
  source?: string
): void {
  emitInteraction({
    event_type: 'detail_view',
    content_id: contentId,
    media_type: mediaType,
    metadata: { title, source },
  }).catch(() => {});
}

/** Emit a search event */
export function emitSearch(query: string, resultCount: number): void {
  emitInteraction({
    event_type: 'search',
    metadata: { query, result_count: resultCount },
  }).catch(() => {});
}

// — Query helpers (for future replay/analytics) ————————————————————

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

    return data || [];
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
