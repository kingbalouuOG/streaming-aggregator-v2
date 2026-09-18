import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { deliveryBelongsTo } from '../growthStore';

const USER = '6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const DELIVERY = '00000000-0000-4000-8000-000000000001';

/** Records the table, columns and filters; resolves maybeSingle with `result`. */
function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: { table: string; columns: string; filters: string[] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, columns: '', filters: [] as string[] };
      calls.push(call);
      const builder = {
        select(columns: string) {
          call.columns = columns;
          return builder;
        },
        eq(col: string, value: unknown) {
          call.filters.push(`${col}=${value}`);
          return builder;
        },
        maybeSingle: () => Promise.resolve(result),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('deliveryBelongsTo (IN-GR-041)', () => {
  it('matches on both the delivery id and the user', async () => {
    const { client, calls } = fakeClient({ data: { id: DELIVERY }, error: null });
    expect(await deliveryBelongsTo(client, DELIVERY, USER)).toBe(true);
    expect(calls).toEqual([
      { table: 'notification_deliveries', columns: 'id', filters: [`id=${DELIVERY}`, `user_id=${USER}`] },
    ]);
  });

  it('no row (missing, or another user\'s) is false', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await deliveryBelongsTo(client, DELIVERY, USER)).toBe(false);
  });

  it('a database error throws a message the route logs, never returns', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(deliveryBelongsTo(client, DELIVERY, USER)).rejects.toThrow('notification_deliveries lookup failed');
  });
});
