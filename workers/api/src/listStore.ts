/**
 * Shared-list reads for the videx-api Worker (Growth G2 H3, migration 093).
 *
 * loadListPreview is the ONE read path for the public face of a shared list:
 * the page (GET /list/:id) and the signed-out app preview
 * (GET /v1/list/:id/preview) both render from it. Members read the full list
 * in the app under RLS; nothing here is per-user.
 *
 * Service role (the tables' RLS admits members only), so what it selects IS
 * the privacy boundary: the list and household names, an item count, poster
 * paths and a member count. It never selects usernames, added_by, user ids or
 * anything from household_invites; listStore.test.ts pins the column lists.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Posters on the page and in the preview JSON. */
export const LIST_POSTER_LIMIT = 6;

/** GET /v1/list/:id/preview (H2's signed-out list screen reads this shape). */
export interface ListPreview {
  id: string;
  /** watchlists.name ('Shared' for every v1 list). */
  name: string;
  household_name: string;
  /** Titles on the list. */
  count: number;
  /** TMDb poster paths ("/abc.jpg"), newest items first, at most LIST_POSTER_LIMIT. */
  posters: string[];
  /** People in the household. */
  members: number;
}

// Members write poster_path (≤ 200 chars, 093). Only a plain TMDb path is
// turned into an image URL; anything else is skipped, not escaped into one.
const POSTER_PATH_RE = /^\/[A-Za-z0-9_-]{1,190}\.(jpg|jpeg|png|webp)$/i;

export function isPosterPath(p: unknown): p is string {
  return typeof p === 'string' && POSTER_PATH_RE.test(p);
}

export async function loadListPreview(client: SupabaseClient, id: string): Promise<ListPreview | null> {
  const { data: list, error } = await client
    .from('watchlists')
    .select('id, name, household_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`watchlists read failed: ${error.message}`);
  if (!list) return null;
  const row = list as { id: string; name: string; household_id: string };

  const [household, items, posters, members] = await Promise.all([
    client.from('households').select('name').eq('id', row.household_id).maybeSingle(),
    client.from('watchlist_items').select('id', { count: 'exact', head: true }).eq('watchlist_id', row.id),
    client
      .from('watchlist_items')
      .select('poster_path')
      .eq('watchlist_id', row.id)
      .not('poster_path', 'is', null)
      .order('added_at', { ascending: false })
      // Headroom for rows whose path fails isPosterPath.
      .limit(LIST_POSTER_LIMIT * 2),
    client
      .from('household_members')
      .select('household_id', { count: 'exact', head: true })
      .eq('household_id', row.household_id),
  ]);
  if (household.error) throw new Error(`households read failed: ${household.error.message}`);
  if (items.error) throw new Error(`watchlist_items count failed: ${items.error.message}`);
  if (posters.error) throw new Error(`watchlist_items read failed: ${posters.error.message}`);
  if (members.error) throw new Error(`household_members count failed: ${members.error.message}`);
  // ON DELETE CASCADE makes an orphan list impossible; treat one as unknown.
  if (!household.data) return null;

  return {
    id: row.id,
    name: row.name,
    household_name: (household.data as { name: string }).name,
    count: items.count ?? 0,
    posters: ((posters.data ?? []) as { poster_path: unknown }[])
      .map((r) => r.poster_path)
      .filter(isPosterPath)
      .slice(0, LIST_POSTER_LIMIT),
    members: members.count ?? 0,
  };
}
