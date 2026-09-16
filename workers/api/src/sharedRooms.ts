/**
 * POST /v1/share/room body validation (Growth G0-4, migration 088).
 *
 * Pure module, tested from the root vitest rig. The Worker inserts the
 * validated value with the service role, so this is the only gate on
 * what lands in shared_rooms.
 *
 * Shared rooms are anonymous (Joe, 14 Sept): the label is rewritten so it
 * never carries the sharer's own history. "Because you liked Heat" and
 * "If you love Heat" both become "More like Heat".
 */

import {
  MAX_ROOM_TITLES,
  neutraliseRoomLabel,
  type ShareRoomRequest,
  type SharedRoomTitleRef,
} from '../../../src/lib/growth/roomSnapshot';

export const LABEL_MAX = 120;
export const DESCRIPTION_MAX = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANCHOR_REF_RE = /^anchor:(movie|tv)-[1-9]\d{0,9}$/;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

// Lives with the room contract so the app's share copy uses the same rule.
export { neutraliseRoomLabel };

export type ShareRoomValidation =
  | { ok: true; value: Required<ShareRoomRequest> }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateShareRoomBody(body: unknown): ShareRoomValidation {
  if (!isRecord(body)) return { ok: false, error: 'body must be an object' };

  const { kind, source_ref: sourceRef, label, description, titles } = body;

  if (kind !== 'global' && kind !== 'anchor') {
    return { ok: false, error: "kind must be 'global' or 'anchor'" };
  }
  if (typeof sourceRef !== 'string') return { ok: false, error: 'source_ref must be a string' };
  if (kind === 'global' ? !UUID_RE.test(sourceRef) : !ANCHOR_REF_RE.test(sourceRef)) {
    return { ok: false, error: 'source_ref does not match kind' };
  }

  if (typeof label !== 'string') return { ok: false, error: 'label must be a string' };
  const cleanLabel = neutraliseRoomLabel(label);
  if (!cleanLabel || cleanLabel.length > LABEL_MAX) {
    return { ok: false, error: `label must be 1..${LABEL_MAX} characters` };
  }

  let cleanDescription: string | null = null;
  if (description != null) {
    if (typeof description !== 'string') return { ok: false, error: 'description must be a string' };
    cleanDescription = description.trim() || null;
    if (cleanDescription && cleanDescription.length > DESCRIPTION_MAX) {
      return { ok: false, error: `description must be at most ${DESCRIPTION_MAX} characters` };
    }
  }

  if (!Array.isArray(titles) || titles.length === 0) {
    return { ok: false, error: 'titles must be a non-empty array' };
  }
  if (titles.length > MAX_ROOM_TITLES) {
    return { ok: false, error: `titles exceeds ${MAX_ROOM_TITLES}` };
  }
  const seen = new Set<string>();
  const cleanTitles: SharedRoomTitleRef[] = [];
  for (const t of titles) {
    if (!isRecord(t)) return { ok: false, error: 'each title must be an object' };
    const id = t.tmdb_id;
    const type = t.media_type;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
      return { ok: false, error: 'tmdb_id must be a positive integer' };
    }
    if (type !== 'movie' && type !== 'tv') {
      return { ok: false, error: "media_type must be 'movie' or 'tv'" };
    }
    const key = `${type}-${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleanTitles.push({ tmdb_id: id, media_type: type });
  }

  return {
    ok: true,
    value: {
      kind,
      source_ref: sourceRef,
      label: cleanLabel,
      description: cleanDescription,
      titles: cleanTitles,
    },
  };
}

/** Read shared_rooms.tmdb_ids back, skipping anything malformed. */
export function parseStoredTitleRefs(raw: unknown): SharedRoomTitleRef[] {
  if (!Array.isArray(raw)) return [];
  const out: SharedRoomTitleRef[] = [];
  for (const t of raw) {
    if (!isRecord(t)) continue;
    if (typeof t.tmdb_id !== 'number' || !Number.isInteger(t.tmdb_id) || t.tmdb_id <= 0) continue;
    if (t.media_type !== 'movie' && t.media_type !== 'tv') continue;
    out.push({ tmdb_id: t.tmdb_id, media_type: t.media_type });
  }
  return out.slice(0, MAX_ROOM_TITLES);
}
