import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../database.types';
import { HouseholdError } from '../errors';
import { createHousehold, householdMembersView, joinHousehold, leaveHousehold, revokeInvite } from '../rpc';

function fakeClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe('household rpc wrappers', () => {
  it('unwraps the first row and trims the name', async () => {
    const { client, rpc } = fakeClient({ data: [{ household_id: 'h', watchlist_id: 'w' }], error: null });
    expect(await createHousehold(client, '  Sofa ')).toEqual({ householdId: 'h', watchlistId: 'w' });
    expect(rpc).toHaveBeenCalledWith('create_household', { p_name: 'Sofa' });
  });

  it('reports already_member', async () => {
    const { client } = fakeClient({
      data: [{ household_id: 'h', watchlist_id: 'w', already_member: true }],
      error: null,
    });
    expect(await joinHousehold(client, 'tok')).toEqual({ householdId: 'h', watchlistId: 'w', alreadyMember: true });
  });

  it('throws a HouseholdError carrying the RPC code', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'invite_expired', code: 'P0001' } });
    const err = await joinHousehold(client, 'tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HouseholdError);
    expect((err as HouseholdError).code).toBe('invite_expired');
  });

  it('throws unknown when a table RPC returns no row', async () => {
    const { client } = fakeClient({ data: [], error: null });
    await expect(createHousehold(client, 'x')).rejects.toMatchObject({ code: 'unknown' });
  });

  it('maps members and returns void or a count for the rest', async () => {
    const members = fakeClient({
      data: [{ user_id: 'u', username: 'joe', role: 'owner', joined_at: 't' }],
      error: null,
    });
    expect(await householdMembersView(members.client, 'h')).toEqual([
      { userId: 'u', username: 'joe', role: 'owner', joinedAt: 't' },
    ]);
    await expect(leaveHousehold(fakeClient({ data: null, error: null }).client, 'h')).resolves.toBeUndefined();
    expect(await revokeInvite(fakeClient({ data: 1, error: null }).client, 'h')).toBe(1);
  });
});
