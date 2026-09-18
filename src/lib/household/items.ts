/**
 * Shared-list items and reactions (Growth G2, migration 093).
 *
 * Members read and write these tables directly under the membership RLS:
 *  - items: INSERT only on (watchlist_id, tmdb_id, media_type, title,
 *    poster_path, added_by) with added_by = the caller; no UPDATE grant, so a
 *    re-add is ON CONFLICT DO NOTHING. Title 1 to 300 characters, poster_path
 *    at most 200, both enforced by CHECKs: clipped here so a long title never
 *    fails the write. DELETE: the adder or the household owner.
 *  - reactions: one per member per item (up, down, tonight), a plain upsert on
 *    (item_id, user_id); tapping your current reaction again removes it.
 *
 * Pure apart from the calls on the client passed in (the *Scoped pattern).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';
import { HouseholdError, householdErrorCode } from './errors';

type Client = SupabaseClient<Database>;

export const REACTIONS = ['up', 'down', 'tonight'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const TITLE_MAX = 300;
export const POSTER_PATH_MAX = 200;

/** Clip by code point, as Postgres char_length counts, never splitting a surrogate pair. */
export function clipChars(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

const TMDB_IMG_PREFIX = /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+/;

/** A built TMDb image URL back to the raw path the lists store ("/abc.jpg"). */
export function tmdbPathFromImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (TMDB_IMG_PREFIX.test(url)) return url.replace(TMDB_IMG_PREFIX, '');
  return url.startsWith('/') ? url : null;
}

export interface SharedItemInput {
  watchlistId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null | undefined;
  addedBy: string;
}

export type SharedItemInsert = Database['public']['Tables']['watchlist_items']['Insert'];

/**
 * The exact insert row. A title that trims to nothing becomes 'Untitled' (the
 * CHECK needs at least one character). A poster path over the limit is
 * dropped rather than cut: a clipped path would point at no image.
 */
export function buildItemInsert(input: SharedItemInput): SharedItemInsert {
  const title = clipChars(input.title.trim(), TITLE_MAX) || 'Untitled';
  const poster = input.posterPath?.trim() || null;
  return {
    watchlist_id: input.watchlistId,
    tmdb_id: input.tmdbId,
    media_type: input.mediaType,
    title,
    poster_path: poster && Array.from(poster).length <= POSTER_PATH_MAX ? poster : null,
    added_by: input.addedBy,
  };
}

function check(error: unknown): void {
  if (error) throw new HouseholdError(householdErrorCode(error), error);
}

/** Adds a title; a title already on the list is left as it is. */
export async function addSharedItem(client: Client, input: SharedItemInput): Promise<void> {
  const { error } = await client
    .from('watchlist_items')
    .upsert(buildItemInsert(input), {
      onConflict: 'watchlist_id,tmdb_id,media_type',
      ignoreDuplicates: true,
    });
  check(error);
}

export async function removeSharedItem(client: Client, itemId: string): Promise<void> {
  const { error } = await client.from('watchlist_items').delete().eq('id', itemId);
  check(error);
}

/** The caller's reaction after tapping `tapped`: the same one again clears it. */
export function nextReaction(current: Reaction | null, tapped: Reaction): Reaction | null {
  return current === tapped ? null : tapped;
}

/** Writes the caller's reaction, or removes it when `reaction` is null. */
export async function setReaction(
  client: Client,
  itemId: string,
  userId: string,
  reaction: Reaction | null,
): Promise<void> {
  if (reaction === null) {
    const { error } = await client
      .from('watchlist_reactions')
      .delete()
      .eq('item_id', itemId)
      .eq('user_id', userId);
    check(error);
    return;
  }
  const { error } = await client
    .from('watchlist_reactions')
    .upsert({ item_id: itemId, user_id: userId, reaction }, { onConflict: 'item_id,user_id' });
  check(error);
}

// ── Reading the list ─────────────────────────────────────────────────────

export interface ReactionRow {
  user_id: string;
  reaction: string;
}

export interface SharedItemRow {
  id: string;
  watchlist_id: string;
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_path: string | null;
  added_by: string | null;
  added_at: string;
  watchlist_reactions: ReactionRow[] | null;
}

export interface ReactionSummary {
  counts: Record<Reaction, number>;
  mine: Reaction | null;
}

export interface SharedItem {
  id: string;
  watchlistId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  /** "movie-603" / "tv-1396", the app-wide content id. */
  contentId: string;
  title: string;
  posterPath: string | null;
  addedBy: string | null;
  addedAt: string;
  reactions: ReactionSummary;
}

function isReaction(value: string): value is Reaction {
  return (REACTIONS as readonly string[]).includes(value);
}

export function summariseReactions(rows: readonly ReactionRow[] | null, userId: string | null): ReactionSummary {
  const counts: Record<Reaction, number> = { up: 0, down: 0, tonight: 0 };
  let mine: Reaction | null = null;
  for (const row of rows ?? []) {
    if (!isReaction(row.reaction)) continue;
    counts[row.reaction] += 1;
    if (userId && row.user_id === userId) mine = row.reaction;
  }
  return { counts, mine };
}

export function toSharedItem(row: SharedItemRow, userId: string | null): SharedItem {
  const mediaType = row.media_type === 'tv' ? 'tv' : 'movie';
  return {
    id: row.id,
    watchlistId: row.watchlist_id,
    tmdbId: row.tmdb_id,
    mediaType,
    contentId: `${mediaType}-${row.tmdb_id}`,
    title: row.title,
    posterPath: row.poster_path,
    addedBy: row.added_by,
    addedAt: row.added_at,
    reactions: summariseReactions(row.watchlist_reactions, userId),
  };
}

export interface ArrangedList {
  /** Items anyone has marked "tonight", newest first. */
  tonight: SharedItem[];
  /** Everything else, newest first. */
  rest: SharedItem[];
}

/** Newest first, with "tonight" items pinned to their own strip. */
export function arrangeSharedList(items: readonly SharedItem[]): ArrangedList {
  const sorted = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  return {
    tonight: sorted.filter((i) => i.reactions.counts.tonight > 0),
    rest: sorted.filter((i) => i.reactions.counts.tonight === 0),
  };
}

/** Whether the caller may delete the item: they added it, or they own the household. */
export function canRemoveItem(item: Pick<SharedItem, 'addedBy'>, userId: string | null, isOwner: boolean): boolean {
  if (!userId) return false;
  return isOwner || item.addedBy === userId;
}

export async function fetchSharedList(client: Client, watchlistId: string, userId: string | null): Promise<SharedItem[]> {
  const { data, error } = await client
    .from('watchlist_items')
    .select('id, watchlist_id, tmdb_id, media_type, title, poster_path, added_by, added_at, watchlist_reactions(user_id, reaction)')
    .eq('watchlist_id', watchlistId)
    .order('added_at', { ascending: false });
  check(error);
  return ((data ?? []) as SharedItemRow[]).map((row) => toSharedItem(row, userId));
}
