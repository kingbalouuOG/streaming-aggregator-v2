import { describe, it, expect } from 'vitest';
import { contentMediaType, isDocumentary } from '../documentary';
import type { ContentItem } from '../../types/content';

/**
 * Review 2026-09-09-001 finding 9.
 *
 * The web surfaces still partitioned on `item.type === 'doc'`. Only the
 * TMDb adapters write that value, and they write it for genre 99 on BOTH
 * media types, so every one of these tests fails on the old predicate in
 * at least one direction:
 *
 *   - a documentary film from search is `type: 'doc'`, so Movies dropped it
 *   - a documentary series from search is also `type: 'doc'`, so it routed
 *     and logged as a film
 *   - the same documentary from the engine or the Postgres cache is
 *     `type: 'movie'`/`'tv'`, so Docs never found it
 *
 * These assert the predicate over the four shapes the web surfaces
 * actually receive. The surfaces themselves (useSearch's category
 * partition, App's taste meta, WatchlistPage's pills, SearchSuggestions'
 * label) are thin wrappers over exactly these two calls.
 */

function item(over: Partial<ContentItem> & Pick<ContentItem, 'id'>): ContentItem {
  return {
    title: 'T', image: '', type: 'movie', services: [], ...over,
  } as ContentItem;
}

/** TMDb search/discover: genre 99 on either media type becomes 'doc'. */
const tmdbDocFilm = item({ id: 'movie-1', type: 'doc', genreIds: [99] });
const tmdbDocSeries = item({ id: 'tv-2', type: 'doc', genreIds: [99, 18] });

/** Engine + Postgres cache: media type, never 'doc'. */
const enginedocFilm = item({ id: 'movie-3', type: 'movie', genreIds: [99] });
const engineDocSeries = item({ id: 'tv-4', type: 'tv', genreIds: [99] });

const plainFilm = item({ id: 'movie-5', type: 'movie', genreIds: [28] });
const plainSeries = item({ id: 'tv-6', type: 'tv', genreIds: [18] });

describe('web surfaces: Docs is a genre, Movies and TV are media types', () => {
  it('finds documentaries on every adapter path', () => {
    for (const d of [tmdbDocFilm, tmdbDocSeries, enginedocFilm, engineDocSeries]) {
      expect(isDocumentary(d)).toBe(true);
    }
    expect(isDocumentary(plainFilm)).toBe(false);
    expect(isDocumentary(plainSeries)).toBe(false);
  });

  it('keeps a documentary film in Movies', () => {
    expect(contentMediaType(tmdbDocFilm)).toBe('movie');
    expect(contentMediaType(enginedocFilm)).toBe('movie');
  });

  it('keeps a documentary series in TV, not in Movies', () => {
    expect(contentMediaType(tmdbDocSeries)).toBe('tv');
    expect(contentMediaType(engineDocSeries)).toBe('tv');
  });

  it('routes and logs a TMDb documentary series as tv (App buildTasteMeta)', () => {
    // The old expression was `type === 'doc' ? 'movie' : type`, which sent
    // every documentary series to the movie detail route and recorded a
    // movie interaction against a series id.
    expect(contentMediaType(tmdbDocSeries)).toBe('tv');
  });

  it('labels a cache-path documentary Doc, not Movie (SearchSuggestions)', () => {
    const label = (i: ContentItem) =>
      isDocumentary(i) ? 'Doc' : contentMediaType(i) === 'tv' ? 'TV' : 'Movie';
    expect(label(enginedocFilm)).toBe('Doc');
    expect(label(engineDocSeries)).toBe('Doc');
    expect(label(plainSeries)).toBe('TV');
    expect(label(plainFilm)).toBe('Movie');
  });

  it('counts a watchlist documentary film under both Movies and Docs', () => {
    const saved = [tmdbDocFilm, enginedocFilm, plainFilm, engineDocSeries];
    expect(saved.filter((i) => contentMediaType(i) === 'movie')).toHaveLength(3);
    expect(saved.filter((i) => isDocumentary(i))).toHaveLength(3);
    expect(saved.filter((i) => contentMediaType(i) === 'tv')).toHaveLength(1);
  });
});
