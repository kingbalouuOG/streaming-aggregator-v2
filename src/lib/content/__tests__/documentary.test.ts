import { describe, it, expect } from 'vitest';

import { tmdbMovieToContentItem, tmdbTVToContentItem } from '../../adapters/contentAdapter';
import { titleRowToContentItem } from '../../recommendations-v2/titleAdapter';
import type { TitleRow } from '../../recommendations-v2/types';
import { contentMediaType, isDocumentary } from '../documentary';

// The point of these tests is the §0.2 bug: the two adapters disagree about
// what a documentary looks like, and the ONLY reason a quick-filter chip can
// work across both surfaces is that `isDocumentary` reads a field they both
// populate. So every case below runs through a real adapter rather than a
// hand-built ContentItem — a literal would test the helper against an
// assumption instead of against the code that actually feeds it.

const DOC = 99;
const DRAMA = 18;

function tmdbResult(over: Record<string, unknown> = {}) {
  return {
    id: 1234,
    title: 'A Film',
    name: 'A Series',
    poster_path: '/p.jpg',
    genre_ids: [DRAMA],
    ...over,
  } as never;
}

function titleRow(over: Partial<TitleRow> = {}): TitleRow {
  return {
    tmdb_id: 1234,
    media_type: 'movie',
    title: 'A Title',
    poster_path: '/p.jpg',
    backdrop_path: null,
    overview: null,
    release_date: null,
    release_year: 2024,
    genre_ids: [DRAMA],
    vote_average: 7,
    vote_count: 100,
    popularity: 10,
    original_language: 'en',
    runtime: 100,
    ...over,
  };
}

describe('isDocumentary', () => {
  describe('the TMDb path (contentAdapter — sets type: "doc")', () => {
    it('is true for a documentary film', () => {
      expect(isDocumentary(tmdbMovieToContentItem(tmdbResult({ genre_ids: [DOC] })))).toBe(true);
    });

    it('is true for a documentary series', () => {
      expect(isDocumentary(tmdbTVToContentItem(tmdbResult({ genre_ids: [DOC] })))).toBe(true);
    });

    it('is false for a non-documentary', () => {
      expect(isDocumentary(tmdbMovieToContentItem(tmdbResult()))).toBe(false);
      expect(isDocumentary(tmdbTVToContentItem(tmdbResult()))).toBe(false);
    });
  });

  describe('the engine path (titleAdapter — never sets type: "doc")', () => {
    // This block is the regression guard. Every item here has
    // `type === media_type`, so a chip written against `item.type === 'doc'`
    // scored zero on all of it — which is exactly what For You is made of.

    it('is true for a documentary film from the titles table', () => {
      const item = titleRowToContentItem(titleRow({ genre_ids: [DOC] }));
      expect(item.type).toBe('movie'); // the bug, asserted so it stays visible
      expect(isDocumentary(item)).toBe(true);
    });

    it('is true for a documentary SERIES from the titles table', () => {
      const item = titleRowToContentItem(titleRow({ media_type: 'tv', genre_ids: [DOC] }));
      expect(item.type).toBe('tv');
      expect(isDocumentary(item)).toBe(true);
    });

    it('is false for a non-documentary', () => {
      expect(isDocumentary(titleRowToContentItem(titleRow()))).toBe(false);
    });

    it('is false when the row carries no genres at all', () => {
      expect(isDocumentary(titleRowToContentItem(titleRow({ genre_ids: null })))).toBe(false);
    });
  });

  it('agrees across the two adapters for the same title', () => {
    // The same documentary series, arriving each way. Before this helper
    // these two disagreed: 'doc' via search, 'tv' via the engine.
    const viaSearch = tmdbTVToContentItem(tmdbResult({ genre_ids: [DOC, DRAMA] }));
    const viaEngine = titleRowToContentItem(titleRow({ media_type: 'tv', genre_ids: [DOC, DRAMA] }));
    expect(isDocumentary(viaSearch)).toBe(isDocumentary(viaEngine));
    expect(isDocumentary(viaSearch)).toBe(true);
  });

  it('falls back to the legacy type marker when genreIds is missing', () => {
    // A watchlist entry persisted before genreIds was carried. Nothing
    // writes 'doc' without genre 99, so this can only recover documentaries.
    expect(isDocumentary({ id: 'movie-1', type: 'doc', genreIds: undefined })).toBe(true);
    expect(isDocumentary({ id: 'movie-1', type: 'movie', genreIds: undefined })).toBe(false);
  });
});

describe('contentMediaType', () => {
  // §1.1: Movies and TV mean media type alone and INCLUDE documentaries.
  // `type` cannot answer this on the TMDb path, because 'doc' has
  // overwritten the media type there.

  it('reads through a "doc" type on the TMDb path', () => {
    expect(contentMediaType(tmdbMovieToContentItem(tmdbResult({ genre_ids: [DOC] })))).toBe('movie');
    expect(contentMediaType(tmdbTVToContentItem(tmdbResult({ genre_ids: [DOC] })))).toBe('tv');
  });

  it('agrees with media_type on the engine path', () => {
    expect(contentMediaType(titleRowToContentItem(titleRow()))).toBe('movie');
    expect(contentMediaType(titleRowToContentItem(titleRow({ media_type: 'tv' })))).toBe('tv');
  });

  it('falls back to type when the id carries no prefix', () => {
    expect(contentMediaType({ id: '12345', type: 'tv' })).toBe('tv');
    expect(contentMediaType({ id: '12345', type: undefined })).toBe('movie');
  });
});
