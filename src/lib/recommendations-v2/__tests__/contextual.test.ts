// Phase 5.5 C6b / IN-PX-25 — regression tests for the contextual scorer.
//
// computeContextualScore is a pure function. Each test pins a specific
// (candidate, ctx) shape against the expected behaviour described in
// the Phase 5 contextual brief. Same input → same score.

import { describe, expect, it } from 'vitest';
import { computeContextualScore } from '../contextual';
import type { ExtendedTitleRow, PipelineContext, ScoredCandidate } from '../types';

function buildMeta(overrides: Partial<ExtendedTitleRow>): ExtendedTitleRow {
  return {
    tmdb_id: 1,
    media_type: 'movie',
    title: 'Test',
    poster_path: null,
    backdrop_path: null,
    overview: null,
    release_date: null,
    release_year: null,
    genre_ids: null,
    vote_average: null,
    vote_count: null,
    popularity: null,
    original_language: null,
    runtime: null,
    cast_top_5: null,
    director: null,
    rt_score: null,
    imdb_rating: null,
    ...overrides,
  };
}

function buildCandidate(overrides: Partial<ExtendedTitleRow>): Pick<ScoredCandidate, 'meta'> {
  return { meta: buildMeta(overrides) };
}

describe('computeContextualScore', () => {
  it('Test 1: late-night comedy outscores late-night documentary', () => {
    // Late-night bucket: hourOfDay >= 22 || hourOfDay < 2.
    // Comedy (35) is in the late_night boost table; Documentary (99) is not.
    const ctx: PipelineContext = { hourOfDay: 23, dayOfWeek: 5 };
    const comedy = buildCandidate({ genre_ids: [35], media_type: 'tv' });
    const documentary = buildCandidate({ genre_ids: [99], media_type: 'tv' });

    expect(computeContextualScore(comedy, ctx)).toBeGreaterThan(
      computeContextualScore(documentary, ctx),
    );
  });

  it('Test 2: with_family + horror scores below 0.5', () => {
    // with_family table suppresses horror (27) by -0.70. Viewing sub-score
    // clamps to [0, 1]; combined output stays below the 0.5 neutral floor.
    const ctx: PipelineContext = { viewingContext: 'with_family' };
    const horror = buildCandidate({ genre_ids: [27] });

    expect(computeContextualScore(horror, ctx)).toBeLessThan(0.5);
  });

  it('Test 3: empty ctx returns 0.5 (Phase 4 placeholder behaviour preserved)', () => {
    const candidate = buildCandidate({ genre_ids: [35] });

    expect(computeContextualScore(candidate, {})).toBeCloseTo(0.5, 6);
  });

  it('Test 4: mobile + long-runtime movie scores below 0.5', () => {
    // android + movie + runtime > 120 → device sub-score = 0.5 - 0.12 = 0.38.
    // Total = 0.5*0.4 + 0.5*0.4 + 0.38*0.2 = 0.476.
    const ctx: PipelineContext = { devicePlatform: 'android' };
    const longMovie = buildCandidate({ media_type: 'movie', runtime: 140 });

    expect(computeContextualScore(longMovie, ctx)).toBeLessThan(0.5);
  });

  it('Test 5: weekday_morning documentary outscores neutral-time documentary', () => {
    // weekday_morning bucket: hourOfDay 6-8 + dayOfWeek 1-5. Documentary (99)
    // gets +0.40 in weekday_morning; with_friends + neutral time doesn't
    // boost documentary at all, so the time sub-score dominates.
    const morningCtx: PipelineContext = { hourOfDay: 7, dayOfWeek: 2 };
    const eveningCtx: PipelineContext = {
      hourOfDay: 20,
      dayOfWeek: 5,
      viewingContext: 'with_friends',
    };
    const doc = buildCandidate({ genre_ids: [99], media_type: 'tv' });

    expect(computeContextualScore(doc, morningCtx)).toBeGreaterThan(
      computeContextualScore(doc, eveningCtx),
    );
  });
});
