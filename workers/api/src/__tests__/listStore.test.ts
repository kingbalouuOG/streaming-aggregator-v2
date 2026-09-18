import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { isPosterPath, loadListPreview } from '../listStore';

const LIST = '8c1e3f2b-4e6f-4a9d-8b7a-5a6b1c2d3e4f';
const HOUSEHOLD = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

type Result = { data?: unknown; count?: number | null; error?: { message: string } | null };

/**
 * A chainable stand-in for the Supabase query builder: records every table
 * and column list the loader asks for, and resolves each query with the
 * canned result for its table (and, for watchlist_items, head vs rows).
 */
function fakeClient(results: Record<string, Result>) {
  const calls: { table: string; columns: string; options?: unknown; filters: string[] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, columns: '', options: undefined as unknown, filters: [] as string[] };
      calls.push(call);
      const key = () => (table === 'watchlist_items' ? `${table}:${call.options ? 'count' : 'rows'}` : table);
      const builder = {
        select(columns: string, options?: unknown) {
          call.columns = columns;
          call.options = options;
          return builder;
        },
        eq(col: string, value: unknown) {
          call.filters.push(`${col}=${value}`);
          return builder;
        },
        not(col: string, op: string, value: unknown) {
          call.filters.push(`${col} not ${op} ${value}`);
          return builder;
        },
        order(col: string) {
          call.filters.push(`order ${col}`);
          return builder;
        },
        limit(n: number) {
          call.filters.push(`limit ${n}`);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ error: null, ...results[key()] });
        },
        then(resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve({ error: null, ...results[key()] }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const LIVE: Record<string, Result> = {
  watchlists: { data: { id: LIST, name: 'Shared', household_id: HOUSEHOLD } },
  households: { data: { name: 'The Sofa' } },
  'watchlist_items:count': { count: 9 },
  'watchlist_items:rows': {
    data: [
      { poster_path: '/newest.jpg' },
      { poster_path: 'javascript:x' },
      ...Array.from({ length: 8 }, (_, i) => ({ poster_path: `/p${i}.jpg` })),
    ],
  },
  household_members: { count: 2 },
};

describe('loadListPreview', () => {
  it('returns the preview shape, posters newest first and capped at six', async () => {
    const { client } = fakeClient(LIVE);
    expect(await loadListPreview(client, LIST)).toEqual({
      id: LIST,
      name: 'Shared',
      household_name: 'The Sofa',
      count: 9,
      posters: ['/newest.jpg', '/p0.jpg', '/p1.jpg', '/p2.jpg', '/p3.jpg', '/p4.jpg'],
      members: 2,
    });
  });

  it('never selects usernames, added_by, user ids or anything from household_invites', async () => {
    const { client, calls } = fakeClient(LIVE);
    await loadListPreview(client, LIST);
    expect(calls.map((c) => c.table).sort()).toEqual(
      ['household_members', 'households', 'watchlist_items', 'watchlist_items', 'watchlists'].sort(),
    );
    for (const { columns } of calls) {
      expect(columns).not.toMatch(/\*|username|added_by|user_id|owner_id|created_by|token|email|profiles|invite/);
    }
    // The member count is a head-only count: no rows come back at all.
    const members = calls.find((c) => c.table === 'household_members');
    expect(members?.options).toEqual({ count: 'exact', head: true });
    const rows = calls.find((c) => c.table === 'watchlist_items' && !c.options);
    expect(rows?.filters).toEqual([`watchlist_id=${LIST}`, 'poster_path not is null', 'order added_at', 'limit 12']);
  });

  it('returns null for an unknown list', async () => {
    const { client, calls } = fakeClient({ watchlists: { data: null } });
    expect(await loadListPreview(client, LIST)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('throws on a read error, so the route answers 500 and nothing is cached', async () => {
    const { client } = fakeClient({ ...LIVE, households: { error: { message: 'boom' } } });
    await expect(loadListPreview(client, LIST)).rejects.toThrow('households read failed: boom');
  });

  it('counts default to zero', async () => {
    const { client } = fakeClient({
      ...LIVE,
      'watchlist_items:count': { count: null },
      'watchlist_items:rows': { data: null },
      household_members: { count: null },
    });
    expect(await loadListPreview(client, LIST)).toMatchObject({ count: 0, posters: [], members: 0 });
  });
});

describe('isPosterPath', () => {
  it.each(['/qJ2tW6WMUDux911r6m7haRef0WH.jpg', '/a-b_c.png', '/x.webp'])('accepts %s', (p) => {
    expect(isPosterPath(p)).toBe(true);
  });
  it.each(['', 'x.jpg', '//evil.test/x.jpg', '/a/b.jpg', '/../x.jpg', '/x.jpg?y', '/x.svg', null, 3])(
    'refuses %j',
    (p) => {
      expect(isPosterPath(p)).toBe(false);
    },
  );
});
