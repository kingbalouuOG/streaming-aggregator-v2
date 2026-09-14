/**
 * shared_rooms reads and writes for the videx-api Worker (Growth G0-4,
 * migration 088). Service-role only: the table has RLS on and no policies.
 *
 * loadSharedRoom is the ONE read path for a snapshot — the public page
 * (GET /room/:id) and the app (GET /v1/room/:id) both render from it.
 * Titles keep the snapshot's order; a title that has since left the
 * catalogue is skipped. Availability is today's, not the share date's.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  SharedRoomKind,
  SharedRoomPayload,
  ShareRoomRequest,
} from '../../../src/lib/growth/roomSnapshot';
import { titleRowToContentItem } from '../../../src/lib/recommendations-v2/titleAdapter';
import {
  EXTENDED_TITLE_SELECT,
  type ExtendedTitleRow,
} from '../../../src/lib/recommendations-v2/types';
import type { ServiceId } from '../../../src/lib/types/content';
import { parseStoredTitleRefs } from './sharedRooms';

interface SharedRoomRow {
  id: string;
  kind: SharedRoomKind;
  label: string;
  description: string | null;
  tmdb_ids: unknown;
  created_at: string;
}

type RoomTitleRow = ExtendedTitleRow & { available_services: string[] | null };

export async function loadSharedRoom(
  client: SupabaseClient,
  id: string,
): Promise<SharedRoomPayload | null> {
  const { data, error } = await client
    .from('shared_rooms')
    .select('id, kind, label, description, tmdb_ids, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`shared_rooms read failed: ${error.message}`);
  if (!data) return null;
  const row = data as SharedRoomRow;

  const refs = parseStoredTitleRefs(row.tmdb_ids);
  const byKey = new Map<string, RoomTitleRow>();
  const ids = [...new Set(refs.map((r) => r.tmdb_id))];
  if (ids.length > 0) {
    const { data: titles, error: titlesError } = await client
      .from('titles')
      .select(`${EXTENDED_TITLE_SELECT}, available_services`)
      .in('tmdb_id', ids);
    if (titlesError) throw new Error(`titles read failed: ${titlesError.message}`);
    for (const t of (titles ?? []) as unknown as RoomTitleRow[]) {
      byKey.set(`${t.media_type}-${t.tmdb_id}`, t);
    }
  }

  const items = refs.flatMap((ref) => {
    const t = byKey.get(`${ref.media_type}-${ref.tmdb_id}`);
    if (!t) return [];
    // available_services already excludes addon rows (migration 084).
    return [{ ...titleRowToContentItem(t), services: (t.available_services ?? []) as ServiceId[] }];
  });

  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    description: row.description,
    createdAt: row.created_at,
    items,
  };
}

export async function insertSharedRoom(
  client: SupabaseClient,
  userId: string,
  room: Required<ShareRoomRequest>,
): Promise<string> {
  const { data, error } = await client
    .from('shared_rooms')
    .insert({
      created_by: userId,
      kind: room.kind,
      source_ref: room.source_ref,
      label: room.label,
      description: room.description,
      tmdb_ids: room.titles,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`shared_rooms insert failed: ${error?.message ?? 'no row'}`);
  return (data as { id: string }).id;
}
