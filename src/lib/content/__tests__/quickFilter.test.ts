import { describe, it, expect } from 'vitest';

import { titleRowToContentItem } from '../../recommendations-v2/titleAdapter';
import type { TitleRow } from '../../recommendations-v2/types';
import type { ContentItem } from '../../types/content';
import {
  applyQuickFilter,
  CHIP_MIN_MATCHES,
  categoryToContentType,
  isThinRail,
  matchesCategory,
  THIN_RAIL_MIN,
  visibleCategories,
} from '../quickFilter';

const DOC = 99;
const DRAMA = 18;

function row(over: Partial<TitleRow> = {}): TitleRow {
  return {
    tmdb_id: 1,
    media_type: 'movie',
    title: 'T',
    poster_path: '/p.jpg',
    backdrop_path: null,
    overview: null,
    release_date: null,
    release_year: 2024,
    genre_ids: [DRAMA],
    vote_average: 7,
    vote_count: 10,
    popularity: 1,
    original_language: 'en',
    runtime: 100,
    ...over,
  };
}

/** Engine-path items — the shape For You is actually made of. */
function items(n: number, over: Partial<TitleRow> = {}): ContentItem[] {
  return Array.from({ length: n }, (_, i) =>
    titleRowToContentItem(row({ tmdb_id: i + 1, ...over })),
  );
}

const film = (n: number) => items(n);
const series = (n: number) => items(n, { media_type: 'tv' });
const docFilm = (n: number) => items(n, { genre_ids: [DOC] });
const docSeries = (n: number) => items(n, { media_type: 'tv', genre_ids: [DOC] });

describe('matchesCategory', () => {
  it('"All" matches everything', () => {
    for (const item of [...film(1), ...series(1), ...docSeries(1)]) {
      expect(matchesCategory(item, 'All')).toBe(true);
    }
  });

  it('Movies and TV split on media type, INCLUDING documentaries (§1.1)', () => {
    // The rule that is easy to get wrong: a documentary film is still a
    // film, so it must survive the Movies chip as well as Documentaries.
    const [documentaryFilm] = docFilm(1);
    expect(matchesCategory(documentaryFilm, 'Movies')).toBe(true);
    expect(matchesCategory(documentaryFilm, 'TV')).toBe(false);
    expect(matchesCategory(documentaryFilm, 'Documentaries')).toBe(true);

    const [documentarySeries] = docSeries(1);
    expect(matchesCategory(documentarySeries, 'Movies')).toBe(false);
    expect(matchesCategory(documentarySeries, 'TV')).toBe(true);
    expect(matchesCategory(documentarySeries, 'Documentaries')).toBe(true);
  });

  it('Documentaries spans both media types', () => {
    expect(applyQuickFilter([...docFilm(2), ...docSeries(3)], 'Documentaries')).toHaveLength(5);
  });
});

describe('applyQuickFilter', () => {
  it('is identity for "All" but returns a copy, not the input array', () => {
    const input = film(3);
    const out = applyQuickFilter(input, 'All');
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('preserves order', () => {
    const mixed = [...film(1), ...series(1), ...film(1)];
    expect(applyQuickFilter(mixed, 'Movies').map((i) => i.id)).toEqual([
      mixed[0].id,
      mixed[2].id,
    ]);
  });
});

describe('isThinRail', () => {
  it(`hides a rail below ${THIN_RAIL_MIN} and keeps it at exactly ${THIN_RAIL_MIN}`, () => {
    expect(isThinRail(film(THIN_RAIL_MIN - 1))).toBe(true);
    expect(isThinRail(film(THIN_RAIL_MIN))).toBe(false);
  });

  it('treats an empty rail as thin', () => {
    expect(isThinRail([])).toBe(true);
  });
});

describe('visibleCategories', () => {
  it('always offers "All", even with nothing to show', () => {
    expect(visibleCategories([])).toEqual(['All']);
  });

  it(`needs ${CHIP_MIN_MATCHES} matches — one short is not enough`, () => {
    expect(visibleCategories(film(CHIP_MIN_MATCHES - 1))).toEqual(['All']);
    expect(visibleCategories(film(CHIP_MIN_MATCHES))).toEqual(['All', 'Movies']);
  });

  it('offers only the categories the payload can honour', () => {
    // A For You payload with plenty of films and series but few documentaries
    // — the case §1.5 exists for. No Documentaries chip should appear.
    const payload = [...film(20), ...series(20), ...docFilm(3)];
    expect(visibleCategories(payload)).toEqual(['All', 'Movies', 'TV']);
  });

  it('counts a documentary toward BOTH its media type and Documentaries', () => {
    // 8 documentary series: enough for TV and for Documentaries, and there
    // are no films at all, so Movies must stay hidden.
    expect(visibleCategories(docSeries(CHIP_MIN_MATCHES))).toEqual([
      'All',
      'TV',
      'Documentaries',
    ]);
  });

  it('returns categories in strip order regardless of payload order', () => {
    const shuffled = [...docSeries(CHIP_MIN_MATCHES), ...film(CHIP_MIN_MATCHES)];
    expect(visibleCategories(shuffled)).toEqual(['All', 'Movies', 'TV', 'Documentaries']);
  });
});

describe('categoryToContentType', () => {
  it('maps onto the unchanged BrowseFilters vocabulary', () => {
    expect(categoryToContentType('All')).toBe('all');
    expect(categoryToContentType('Movies')).toBe('movie');
    expect(categoryToContentType('TV')).toBe('tv');
    expect(categoryToContentType('Documentaries')).toBe('doc');
  });
});
