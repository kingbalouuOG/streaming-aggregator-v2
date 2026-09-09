import { describe, expect, it } from 'vitest';

import { DEFAULT_FILTERS, applyBrowseFilters, type BrowseFilters } from '../browseFilters';
import type { ContentItem } from '../../types/content';

const never = () => false;

function item(over: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'movie-1',
    title: 'A Film',
    image: '',
    services: [],
    type: 'movie',
    ...over,
  } as ContentItem;
}

const with_ = (over: Partial<BrowseFilters>): BrowseFilters => ({ ...DEFAULT_FILTERS, ...over });

describe('runtime, when the item does not have one', () => {
  // Both TMDb adapters leave `runtime` undefined — only the Supabase adapter
  // sets it — so the search grid is mostly runtime-less. This used to read
  // `it.runtime ?? 0`, which meant every TMDb hit failed `>= 60` and one tap
  // on "Under 2h" emptied the grid. Unknown is unknown, not zero minutes.
  it('keeps a TMDb search hit with no runtime', () => {
    const items = [item({ id: 'movie-1' }), item({ id: 'tv-2', type: 'tv' })];
    expect(applyBrowseFilters(items, with_({ runtime: '60_120' }), never)).toHaveLength(2);
    expect(applyBrowseFilters(items, with_({ runtime: 'under_60' }), never)).toHaveLength(2);
    expect(applyBrowseFilters(items, with_({ runtime: 'over_120' }), never)).toHaveLength(2);
  });

  it('is the same rule `services` already applies to unknowns', () => {
    // A service chip does not drop items whose services are unresolved.
    const items = [item({ services: [] })];
    expect(applyBrowseFilters(items, with_({ services: ['netflix'] }), never)).toHaveLength(1);
  });
});

describe('runtime, when the item does have one', () => {
  const short = item({ id: 'movie-1', runtime: 45 });
  const mid = item({ id: 'movie-2', runtime: 100 });
  const long = item({ id: 'movie-3', runtime: 165 });
  const all = [short, mid, long];

  it('still bites on the items that carry a runtime', () => {
    expect(applyBrowseFilters(all, with_({ runtime: '60_120' }), never).map((i) => i.id)).toEqual([
      'movie-2',
    ]);
    expect(applyBrowseFilters(all, with_({ runtime: 'under_60' }), never).map((i) => i.id)).toEqual([
      'movie-1',
    ]);
    expect(applyBrowseFilters(all, with_({ runtime: 'over_120' }), never).map((i) => i.id)).toEqual([
      'movie-3',
    ]);
  });

  it('mixes known and unknown without dropping the unknown', () => {
    const mixed = [mid, long, item({ id: 'movie-4' })];
    expect(
      applyBrowseFilters(mixed, with_({ runtime: '60_120' }), never).map((i) => i.id),
    ).toEqual(['movie-2', 'movie-4']);
  });

  it('treats a zero runtime as missing, not as a very short film', () => {
    expect(applyBrowseFilters([item({ runtime: 0 })], with_({ runtime: 'under_60' }), never)).toHaveLength(
      1,
    );
  });
});

describe('cost', () => {
  it('is ignored client-side, deliberately', () => {
    // Nothing on ContentItem carries a stream type. The axis is real on
    // /discover and on the semantic RPC; `orderedRefineChips` is what stops
    // the chip being offered on the one grid that post-filters.
    const items = [item(), item({ id: 'tv-2', type: 'tv' })];
    expect(applyBrowseFilters(items, with_({ cost: 'free' }), never)).toHaveLength(2);
  });
});
