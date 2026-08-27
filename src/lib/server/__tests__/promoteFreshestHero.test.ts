import { describe, it, expect } from 'vitest';

import { promoteFreshestHero } from '../foryouRender';
import { HERO_CANDIDATE_BAND } from '../../recommendations-v2/weights';
import type { ContentItem } from '../../recommendations-v2/types';

/** Only `id` is read by the helper; the rest of ContentItem is irrelevant. */
const item = (tmdbId: number): ContentItem =>
  ({ id: `movie-${tmdbId}` }) as unknown as ContentItem;

/** Hero-slot appearance counts, keyed by tmdb id. */
const heroViews = (counts: Record<number, number>): Map<number, number> =>
  new Map(Object.entries(counts).map(([id, n]) => [Number(id), n]));

const ids = (row: ContentItem[]) => row.map((i) => i.id);

describe('promoteFreshestHero', () => {
  it('promotes the least-seen title in the band to the hero slot', () => {
    const row = [item(1), item(2), item(3), item(4), item(5)];
    promoteFreshestHero(row, heroViews({ 1: 9, 2: 4, 3: 0, 4: 7, 5: 0 }));
    expect(ids(row)[0]).toBe('movie-3');
  });

  it('preserves every item exactly once', () => {
    const row = [item(1), item(2), item(3), item(4), item(5)];
    promoteFreshestHero(row, heroViews({ 1: 9, 2: 4, 3: 0, 4: 7 }));
    expect([...ids(row)].sort()).toEqual(
      ['movie-1', 'movie-2', 'movie-3', 'movie-4', 'movie-5'].sort(),
    );
  });

  it('keeps the rest of the row in order behind the promoted hero', () => {
    const row = [item(1), item(2), item(3), item(4), item(5)];
    promoteFreshestHero(row, heroViews({ 1: 9, 2: 4, 3: 0, 4: 7, 5: 0 }));
    expect(ids(row)).toEqual(['movie-3', 'movie-1', 'movie-2', 'movie-4', 'movie-5']);
  });

  it('breaks ties towards the better-ranked title', () => {
    // 2 and 3 are equally unseen; 2 ranks higher, so alignment wins.
    const row = [item(1), item(2), item(3), item(4)];
    promoteFreshestHero(row, heroViews({ 1: 5, 2: 0, 3: 0, 4: 0 }));
    expect(ids(row)[0]).toBe('movie-2');
  });

  it('leaves the row untouched when rank 1 is already the freshest', () => {
    const row = [item(1), item(2), item(3), item(4)];
    const before = ids(row);
    promoteFreshestHero(row, heroViews({ 1: 0, 2: 3, 3: 6, 4: 2 }));
    expect(ids(row)).toEqual(before);
  });

  it('never reaches beyond the band — a fresher title outside it is ignored', () => {
    // Item 9 is unseen but sits well below the band; promoting it would put
    // a materially worse match in the biggest slot on the page.
    const row = [item(1), item(2), item(3), item(4), item(9)];
    promoteFreshestHero(row, heroViews({ 1: 5, 2: 5, 3: 5, 4: 5, 9: 0 }));
    expect(ids(row)[0]).not.toBe('movie-9');
    expect(ids(row)[0]).toBe('movie-1');
  });

  it('treats a title absent from the fatigue map as unseen', () => {
    const row = [item(1), item(2), item(3)];
    promoteFreshestHero(row, heroViews({ 1: 4, 3: 1 })); // 2 has no entry
    expect(ids(row)[0]).toBe('movie-2');
  });

  it('ranks on hero-slot history, not total impressions', () => {
    // The regression this guards. The hero is shift()ed off the row, so the
    // incumbent logs one hero impression per open while ranks 2-4 each log a
    // row impression. Ranked by TOTAL impressions the incumbent always looks
    // freshest and never moves — the opposite of the intent. Here title 1 has
    // held the slot 6 times and must yield.
    const row = [item(1), item(2)];
    promoteFreshestHero(row, heroViews({ 1: 6, 2: 0 }));
    expect(ids(row)[0]).toBe('movie-2');
  });

  it('is a no-op on degenerate rows', () => {
    const empty: ContentItem[] = [];
    promoteFreshestHero(empty, heroViews({}));
    expect(empty).toEqual([]);

    const single = [item(1)];
    promoteFreshestHero(single, heroViews({ 1: 99 }));
    expect(ids(single)).toEqual(['movie-1']);
  });

  it('handles a row shorter than the band', () => {
    const row = [item(1), item(2)];
    promoteFreshestHero(row, heroViews({ 1: 3, 2: 0 }));
    expect(ids(row)).toEqual(['movie-2', 'movie-1']);
  });

  it('uses the configured band width', () => {
    // Guards the constant against being changed without the reasoning
    // behind it being revisited.
    expect(HERO_CANDIDATE_BAND).toBe(4);
  });
});
