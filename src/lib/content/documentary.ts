/**
 * What "Documentary" means, in one place.
 *
 * Before this module the concept was modelled three incompatible ways
 * (recommendation 2026-09-08-002 §0.2):
 *
 *   - `contentAdapter` (TMDb search/discover) sets `type: 'doc'` when
 *     `genre_ids` includes 99 — for movies AND series, which erases the
 *     media type in the process.
 *   - `titleAdapter` (Supabase `titles` → For You, spotlights, per-service
 *     charts, semantic search) sets `type: row.media_type` and NEVER
 *     `'doc'`, even with genre 99 present.
 *   - `useBrowseDiscover`'s "Docs" segment asked TMDb for genre-99 MOVIES
 *     only, so documentary series could not appear at all.
 *
 * So the same title was a `doc` arriving via search and a `movie` arriving
 * via the engine, and any filter written against `item.type === 'doc'`
 * silently dropped every engine-sourced documentary.
 *
 * §1.1 settles it: **a documentary is TMDb genre 99 on either media type**,
 * and Movies / TV mean media type alone (a documentary film is still a
 * film). Both predicates below hold on every adapter path, which is the
 * property `item.type` never had.
 *
 * Deliberately dependency-free — only a type import. `foryouRender` runs
 * inside the Worker bundle, where an incidental import from
 * `contentAdapter` once pulled a build-time `define` into the bundle and
 * broke a deploy (R-028). Nothing here imports a value from anywhere.
 */

import type { ContentItem } from '../types/content';

/** TMDb's genre id for Documentary. Same id on the movie and TV lists. */
export const DOCUMENTARY_GENRE_ID = 99;

type ContentLike = Pick<ContentItem, 'id' | 'type' | 'genreIds'>;

/**
 * The media type, recovered independently of `type`.
 *
 * `type` cannot be trusted for this: the TMDb path overwrites it with
 * `'doc'`, so a documentary SERIES and a documentary FILM are
 * indistinguishable by that field. The `id` — `"movie-123"` / `"tv-123"`,
 * the shape every adapter builds — still carries it, so the prefix is the
 * reliable source and `type` is only the fallback.
 */
export function contentMediaType(item: ContentLike): 'movie' | 'tv' {
  const dash = item.id.indexOf('-');
  const prefix = dash > 0 ? item.id.slice(0, dash) : '';
  if (prefix === 'tv') return 'tv';
  if (prefix === 'movie') return 'movie';
  // No recognisable prefix — fall back to `type`, which is right except
  // for the 'doc' case the prefix exists to resolve.
  return item.type === 'tv' ? 'tv' : 'movie';
}

/**
 * True for a documentary of either media type.
 *
 * `genreIds` is the primary test and works on every path. The `type`
 * check is a fallback for items whose `genreIds` did not survive
 * persistence — an old watchlist entry, say — where the legacy `'doc'`
 * marker is the only evidence left. It can only add documentaries that
 * were already identified as such; every writer of `type: 'doc'` derives
 * it from genre 99 in the first place.
 */
export function isDocumentary(item: ContentLike): boolean {
  if (item.genreIds?.includes(DOCUMENTARY_GENRE_ID)) return true;
  return item.type === 'doc';
}
