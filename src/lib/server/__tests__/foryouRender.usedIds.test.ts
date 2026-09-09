import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtendedTitleRow, ScoredCandidate } from '../../recommendations-v2/types';
import { DEFAULT_SLIDERS } from '../../taste-v2/types';
import type { UserScope } from '../userScope';

/**
 * Review 2026-09-09-001 finding 6.
 *
 * The 36-item render exists so a quick filter has a reserve to draw on.
 * That reserve is NOT on the screen, so it must not count as "already
 * used" for the rows built afterwards — otherwise raising the render
 * length silently thinned Outside Your Usual and New to rent or buy,
 * which is a change to the UNFILTERED feed.
 *
 * The fixture puts the low-taste titles (the band Outside Your Usual
 * draws from) in the reserve tail of Recommended For You. Before the
 * fix, `usedIds` carried all 36 and Outside Your Usual came back empty.
 */

const POOL_SIZE = 70;
const VISIBLE_REC = 20;
const VISIBLE_GEMS = 15;

/** Where the deliberately low-taste candidates sit in final-score order. */
const TAIL_START = 20;
const TAIL_END = 36;

function meta(i: number): ExtendedTitleRow {
  return {
    tmdb_id: 1000 + i,
    media_type: 'movie',
    title: `Title ${i}`,
    poster_path: `/p${i}.jpg`,
    backdrop_path: null,
    overview: null,
    release_date: '2020-01-01',
    release_year: 2020,
    // Deliberately empty: applyGenreSpread skips every genre and cluster
    // check for a candidate with no primary genre, so the row comes back
    // in final-score order and the fixture stays readable.
    genre_ids: [],
    vote_average: 7.5,
    vote_count: 500,
    popularity: 40,
    original_language: 'en',
    runtime: 100,
    cast_top_5: null,
    director: null,
    rt_score: null,
    imdb_rating: 8.0,
  };
}

/**
 * Taste score by final-score rank. Outside Your Usual takes the bottom of
 * the taste distribution, so the tail band is the only place it can draw
 * from — which is exactly the band the bug excluded.
 */
function tasteFor(i: number): number {
  if (i < TAIL_START) return 0.90;
  if (i < TAIL_END) return 0.05;
  return 0.60;
}

function candidates(): ScoredCandidate[] {
  return Array.from({ length: POOL_SIZE }, (_, i) => ({
    tmdbId: 1000 + i,
    mediaType: 'movie' as const,
    contentKey: `movie-${1000 + i}`,
    scores: { taste: tasteFor(i), recency: 0.5, contextual: 0.5 },
    // Strictly descending, so row order is index order.
    finalScore: 1 - i / POOL_SIZE,
    meta: meta(i),
  }));
}

vi.mock('../../recommendations-v2/ranker', async () => {
  // buildRowFromPool is the mechanism under test — it must be real.
  const actual = await vi.importActual<
    typeof import('../../recommendations-v2/ranker')
  >('../../recommendations-v2/ranker');
  return {
    ...actual,
    fetchCandidatePoolScoped: vi.fn(async () => ({
      matched: [],
      metadata: new Map<string, ExtendedTitleRow>(),
      fetchedAt: 0,
    })),
    scoreCandidates: vi.fn(() => candidates()),
  };
});

// No embeddings, so buildRowFromPool takes the applyGenreSpread path,
// which is order-preserving for genre-less candidates. MMR's selection
// order is not what this test is about.
vi.mock('../titleEmbeddingCache', () => ({
  fetchEmbeddingsForCandidates: vi.fn(async () => new Map()),
}));

// Identity shuffle: the C3 band rotation would scramble the fixture's
// positions, and these assertions are positional.
vi.mock('../../utils/dailyShuffle', () => ({
  bucketedShuffleBands: (items: unknown[]) => items,
}));

vi.mock('../../recommendations-v2/exploration', async () => {
  const actual = await vi.importActual<
    typeof import('../../recommendations-v2/exploration')
  >('../../recommendations-v2/exploration');
  return {
    ...actual,
    fetchSeenContentIdsScoped: vi.fn(async () => new Set<string>()),
    // Off: exploration splices picks into the visible head, which would
    // push fixture titles across the 20-item boundary.
    selectExplorationCandidates: vi.fn(() => []),
  };
});

vi.mock('../../taste-v2/tasteProfileV2', () => ({
  getV2TasteProfileScoped: vi.fn(async () => null),
  getInterestCentroidsScoped: vi.fn(async () => []),
}));

vi.mock('../../recommendations-v2/hardFilters', () => ({
  buildFilterSetsScoped: vi.fn(async () => ({
    availableTmdbIds: new Set<number>(),
    dismissedKeys: new Set<string>(),
    thumbsDownKeys: new Set<string>(),
    watchlistKeys: new Set<string>(),
  })),
}));

vi.mock('../../recommendations-v2/avoidSet', async () => {
  const actual = await vi.importActual<
    typeof import('../../recommendations-v2/avoidSet')
  >('../../recommendations-v2/avoidSet');
  return { ...actual, fetchAvoidSetScoped: vi.fn(async () => []) };
});

vi.mock('../../recommendations-v2/fatigue', async () => {
  const actual = await vi.importActual<
    typeof import('../../recommendations-v2/fatigue')
  >('../../recommendations-v2/fatigue');
  return {
    ...actual,
    fetchFatigueScoped: vi.fn(async () => ({ fatigue: new Map(), engaged: new Set() })),
    fetchHeroViewsScoped: vi.fn(async () => new Map()),
  };
});

vi.mock('../../recommendations-v2/anchoredRoom', () => ({
  buildAnchoredRoomScoped: vi.fn(async () => null),
}));

vi.mock('../../recommendations-v2/anchorSelection', () => ({
  selectAnchors: vi.fn(async () => []),
}));

/** Records the exclude set New-to-rent-or-buy is given. */
const paidExcludes: Set<string>[] = [];
vi.mock('../../recommendations-v2/rows/home/paidRow', () => ({
  fetchPaidTitlesScoped: vi.fn(
    async (_c: unknown, _s: unknown, _n: number, exclude: Set<string>) => {
      paidExcludes.push(new Set(exclude));
      return [];
    },
  ),
}));

/** Every Supabase read left in the render resolves empty. */
function stubClient(): SupabaseClient {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'in', 'gt', 'gte', 'lte', 'not', 'order', 'limit', 'filter']) {
    chain[m] = self;
  }
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.then = (onFulfilled: (r: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return {
    from: () => chain,
    rpc: async () => ({ data: [], error: null }),
  } as unknown as SupabaseClient;
}

function stubScope(): UserScope {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['eq', 'in', 'gt', 'gte', 'lte', 'not', 'order', 'limit']) chain[m] = self;
  chain.then = (onFulfilled: (r: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: null }).then(onFulfilled);
  return { userId: 'u1', select: () => chain } as unknown as UserScope;
}

async function render() {
  const { renderForYou } = await import('../foryouRender');
  return renderForYou(stubClient(), stubScope(), {
    services: ['netflix'],
    profile: {
      tasteVector: new Array(1536).fill(0.01),
      sliders: DEFAULT_SLIDERS,
      selectedClusters: [],
      interactionCount: 0,
    } as never,
  });
}

describe('renderForYou: the filter reserve is not "used" (finding 6)', () => {
  beforeEach(() => {
    paidExcludes.length = 0;
  });

  it('renders Recommended For You to the full reserve length', async () => {
    const payload = await render();
    expect(payload.recommendedForYou).toHaveLength(36);
  });

  it('leaves a reserve-tail title eligible for Outside Your Usual', async () => {
    const payload = await render();

    const tailIds = new Set(payload.recommendedForYou.slice(VISIBLE_REC).map((i) => i.id));
    const outsideIds = payload.outsideYourUsual.map((i) => i.id);

    expect(outsideIds.length).toBeGreaterThan(0);
    // The whole point: the row is built from titles the user cannot see.
    expect(outsideIds.some((id) => tailIds.has(id))).toBe(true);
  });

  it('still excludes the visible head from Outside Your Usual', async () => {
    const payload = await render();

    const visibleIds = new Set(payload.recommendedForYou.slice(0, VISIBLE_REC).map((i) => i.id));
    for (const item of payload.outsideYourUsual) {
      expect(visibleIds.has(item.id)).toBe(false);
    }
  });

  it('passes New-to-rent-or-buy only the visible slice, not all 36', async () => {
    const payload = await render();

    expect(paidExcludes).toHaveLength(1);
    const exclude = paidExcludes[0];

    for (const item of payload.recommendedForYou.slice(0, VISIBLE_REC)) {
      expect(exclude.has(item.id)).toBe(true);
    }
    for (const item of payload.recommendedForYou.slice(VISIBLE_REC)) {
      expect(exclude.has(item.id)).toBe(false);
    }

    expect(exclude.size).toBeLessThanOrEqual(VISIBLE_REC + VISIBLE_GEMS);
  });

  it('keeps the two long rows disjoint across their full reserves', async () => {
    const payload = await render();

    const recIds = new Set(payload.recommendedForYou.map((i) => i.id));
    for (const gem of payload.hiddenGems) {
      expect(recIds.has(gem.id)).toBe(false);
    }
  });
});
