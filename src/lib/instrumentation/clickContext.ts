/**
 * Card-click context stash (ENG-1 Workstream D)
 *
 * card_impressions already logs position / source_surface / session_id;
 * the gap is on the INTERACTION side — when a thumbs_up or deep_link_click
 * lands, nothing records which ranked position the journey started from.
 * The ENG-2 learned re-ranker needs that field reliable from day one
 * (positional bias is handled at training time; capture is our job).
 *
 * Pattern: module-scope stash set at card-tap time by the ranked surfaces
 * (ContentRow, Browse results grid, MoodRoomPage supporting grid) and read
 * by emitInteraction, which merges { position, origin_surface } into
 * outcome-event metadata. Same proven shape as searchAttribution's
 * session stash (Phase Search V2).
 *
 * Correctness: the stash only applies when the outcome event's content_id
 * MATCHES the stashed card — cross-contamination is structurally
 * impossible. It is replaced on every card tap and expires after 30
 * minutes (a detail-page dwell longer than that shouldn't claim the
 * origin position). It is intentionally NOT cleared on read: detail_view
 * → thumbs_up → deep_link_click for the same title all inherit the same
 * origin.
 */

const CLICK_CONTEXT_WINDOW_MS = 30 * 60 * 1000;

interface CardClickContext {
  contentId: number;
  position: number;
  surface: string;
  at: number;
}

let stash: CardClickContext | null = null;

/** Called from the card-tap handler of every ranked surface. */
export function setCardClickContext(ctx: {
  contentId: number;
  position: number;
  surface: string;
}): void {
  stash = { ...ctx, at: Date.now() };
}

/**
 * Origin context for an outcome event on `contentId`, or null when the
 * stash is absent, for a different title, or expired.
 */
export function getCardClickContext(
  contentId: number,
): { position: number; origin_surface: string } | null {
  if (!stash) return null;
  if (stash.contentId !== contentId) return null;
  if (Date.now() - stash.at > CLICK_CONTEXT_WINDOW_MS) {
    stash = null;
    return null;
  }
  return { position: stash.position, origin_surface: stash.surface };
}

/** Test/sign-out hook. */
export function clearCardClickContext(): void {
  stash = null;
}
