/**
 * Shared room snapshots: the wire contract between the videx-api Worker
 * (POST /v1/share/room, GET /v1/room/:id, GET /room/:id) and the native
 * room screen (Growth G0-4, ADR-015, migration 088).
 *
 * A shared room is frozen at share time. mood_rooms ids regenerate on the
 * monthly recluster and anchored rooms have no row at all, so a live id
 * would rot; the snapshot keeps the titles the sharer saw.
 */

import type { ContentItem } from '../types/content';
import { CANONICAL_ORIGIN } from './slug';

export const MAX_ROOM_TITLES = 60;

export type SharedRoomKind = 'global' | 'anchor';

export interface SharedRoomTitleRef {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
}

/** POST /v1/share/room request body. */
export interface ShareRoomRequest {
  kind: SharedRoomKind;
  /** mood_rooms id for global rooms, "anchor:{type}-{id}" for anchored. */
  source_ref: string;
  label: string;
  description?: string | null;
  titles: SharedRoomTitleRef[];
}

/** POST /v1/share/room response body. */
export interface ShareRoomResponse {
  id: string;
  url: string;
}

/** GET /v1/room/:id response body. Items keep the snapshot's order. */
export interface SharedRoomPayload {
  id: string;
  kind: SharedRoomKind;
  label: string;
  description: string | null;
  createdAt: string;
  items: ContentItem[];
}

export function sharedRoomUrl(id: string): string {
  return `${CANONICAL_ORIGIN}/room/${id}`;
}

/** "14 September 2026" — the "picked on" line on the page and the screen. */
export function formatPickedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  // UTC, not Intl: Hermes and the Worker agree without locale data.
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
