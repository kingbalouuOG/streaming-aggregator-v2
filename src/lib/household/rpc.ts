/**
 * Typed wrappers over the household RPCs (migrations 093 and 094).
 *
 * Each call takes the Supabase client explicitly (the *Scoped pattern), so the
 * module stays pure and testable; native passes its singleton. Table-returning
 * RPCs come back as arrays: the wrappers unwrap data[0]. Every failure throws
 * a HouseholdError carrying the stable code (errors.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import { HouseholdError, householdErrorCode } from './errors';

type Client = SupabaseClient<Database>;

interface RpcResult<T> {
  data: T | null;
  error: unknown;
}

function unwrap<T>(result: RpcResult<T>): T | null {
  if (result.error) throw new HouseholdError(householdErrorCode(result.error), result.error);
  return result.data;
}

function first<T>(result: RpcResult<T[]>): T {
  const rows = unwrap(result);
  const row = rows?.[0];
  if (!row) throw new HouseholdError('unknown');
  return row;
}

export interface CreatedHousehold {
  householdId: string;
  watchlistId: string;
}

export async function createHousehold(client: Client, name: string): Promise<CreatedHousehold> {
  const row = first(await client.rpc('create_household', { p_name: name.trim() }));
  return { householdId: row.household_id, watchlistId: row.watchlist_id };
}

export interface HouseholdInvite {
  token: string;
  expiresAt: string;
}

/** Owner only. Revokes the open invite and mints a new one (7 days, 6 uses). */
export async function createInvite(client: Client, householdId: string): Promise<HouseholdInvite> {
  const row = first(await client.rpc('create_invite', { p_household_id: householdId }));
  return { token: row.token, expiresAt: row.expires_at };
}

export interface JoinResult {
  householdId: string;
  watchlistId: string;
  /** True for a replay by an existing member (never an error). */
  alreadyMember: boolean;
}

export async function joinHousehold(client: Client, token: string): Promise<JoinResult> {
  const row = first(await client.rpc('join_household', { p_token: token }));
  return {
    householdId: row.household_id,
    watchlistId: row.watchlist_id,
    alreadyMember: row.already_member,
  };
}

export async function leaveHousehold(client: Client, householdId: string): Promise<void> {
  unwrap(await client.rpc('leave_household', { p_household_id: householdId }));
}

export interface HouseholdMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export async function householdMembersView(client: Client, householdId: string): Promise<HouseholdMember[]> {
  const rows = unwrap(await client.rpc('household_members_view', { p_household_id: householdId })) ?? [];
  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    role: r.role === 'owner' ? 'owner' : 'member',
    joinedAt: r.joined_at,
  }));
}

/** Owner only (094). The removed member leaves exactly as leave_household would. */
export async function removeMember(client: Client, householdId: string, userId: string): Promise<void> {
  unwrap(await client.rpc('remove_member', { p_household_id: householdId, p_user_id: userId }));
}

/** Owner only (094). Revokes the open invite without minting a new one; returns how many were open. */
export async function revokeInvite(client: Client, householdId: string): Promise<number> {
  return unwrap(await client.rpc('revoke_invite', { p_household_id: householdId })) ?? 0;
}
