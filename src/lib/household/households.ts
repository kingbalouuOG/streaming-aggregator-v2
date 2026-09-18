/**
 * The caller's households, as the app shows them (Growth G2, migration 093).
 *
 * Two reads under the membership RLS, both scoped by the policies rather than
 * by a filter: household_members returns every member row of every household
 * the caller belongs to (so counts come free), and households returns those
 * households with their list(s). v1 has exactly one list per household (D3);
 * the earliest is taken if a later version adds more, as join_household does.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import { HouseholdError, householdErrorCode } from './errors';

type Client = SupabaseClient<Database>;

export const HOUSEHOLD_MEMBER_CAP = 6;
export const HOUSEHOLD_NAME_MAX = 40;

export interface MemberRow {
  household_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

export interface HouseholdRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  watchlists: { id: string; name: string; created_at: string }[] | null;
}

export interface Household {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  /** The household's one shared list (null only if the read raced a delete). */
  watchlistId: string | null;
  listName: string;
  memberCount: number;
  /** When the caller joined; households are ordered by it. */
  joinedAt: string;
}

export function assembleHouseholds(
  households: readonly HouseholdRow[],
  members: readonly MemberRow[],
  userId: string,
): Household[] {
  const out: Household[] = [];
  for (const h of households) {
    const rows = members.filter((m) => m.household_id === h.id);
    const mine = rows.find((m) => m.user_id === userId);
    if (!mine) continue;
    const list = [...(h.watchlists ?? [])].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )[0];
    out.push({
      id: h.id,
      name: h.name,
      ownerId: h.owner_id,
      isOwner: h.owner_id === userId,
      watchlistId: list?.id ?? null,
      listName: list?.name ?? 'Shared',
      memberCount: rows.length,
      joinedAt: mine.joined_at,
    });
  }
  return out.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
}

export async function fetchHouseholds(client: Client, userId: string): Promise<Household[]> {
  const [households, members] = await Promise.all([
    client.from('households').select('id, name, owner_id, created_at, watchlists(id, name, created_at)'),
    client.from('household_members').select('household_id, user_id, role, joined_at'),
  ]);
  const error = households.error ?? members.error;
  if (error) throw new HouseholdError(householdErrorCode(error), error);
  return assembleHouseholds(
    (households.data ?? []) as HouseholdRow[],
    (members.data ?? []) as MemberRow[],
    userId,
  );
}

/** The trimmed name, or null when it is outside 1 to 40 characters. */
export function validHouseholdName(raw: string): string | null {
  const name = raw.trim();
  const length = Array.from(name).length;
  return length >= 1 && length <= HOUSEHOLD_NAME_MAX ? name : null;
}
