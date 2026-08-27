import { describe, it, expect } from 'vitest';

import { promoteFreshestHero } from '../foryouRender';
import { HERO_CANDIDATE_BAND } from '../../recommendations-v2/weights';
import type { FatigueData } from '../../recommendations-v2/fatigue';
import type { ContentItem } from '../../recommendations-v2/types';

/** Only `id` is read by the helper; the rest of ContentItem is irrelevant. */
const item = (tmdbId: number): ContentItem =>
  ({ id: `movie-${tmdbId}` }) as unknown as ContentItem;

const fatigue = (views: Record<number, number>): FatigueData => ({
  fatigue: new Map(
    Object.entries(views).map(([id, v]) => [Number(id), { views: v, lastSeenMs: 0 }]),
  ),
  engaged: new Set<number>(),
});

const ids = (row: ContentItem[]) => row.map((i) => i.id);

describe('promoteFreshestHero', () => {
  it('promotes the least-seen title in the band to the hero slot', () => {
    const row = [item(1), item(2), item(3), item(4), item(5)];
    promoteFreshestHero(row, fatigue({ 1: 9, 2: 4, 3: 0, 4: 7, 5: 0 }));
    expect(ids(row)[0]).toBe('movie-3');
  });

  it('preserves every item exactly once', () => {
    const row = [item(1), item(2), item(3), item(4), item(5)];
    promoteFreshestHero(row, fatigue({ 1: 9, 2: 4, 3: 0, 4: 7 }));
    expect([...ids(row)].sort()).toEqual(
      ['movie-1', 'movie-2', 'movie-3', 'movie-4', 'movie-5'].sort(),
    );
  });

  it('keeps the rest of the row in order behind the promoted hero', () => {
    const row = [item(1), item(2), item(3), item(4), item(5)];
    promoteFreshestHero(row, fatigue({ 1: 9, 2: 4, 3: 0, 4: 7, 5: 0 }));
    expect(ids(row)).toEqual(['movie-3', 'movie-1', 'movie-2', 'movie-4', 'movie-5']);
  });

  it('breaks ties towards the better-ranked title', () => {
    // 2 and 3 are equally unseen; 2 ranks higher, so alignment wins.
    const row = [item(1), item(2), item(3), item(4)];
    promoteFreshestHero(row, fatigue({ 1: 5, 2: 0, 3: 0, 4: 0 }));
    expect(ids(row)[0]).toBe('movie-2');
  });

  it('leaves the row untouched when rank 1 is already the freshest', () => {
    const row = [item(1), item(2), item(3), item(4)];
    const before = ids(row);
    promoteFreshestHero(row, fatigue({ 1: 0, 2: 3, 3: 6, 4: 2 }));
    expect(ids(row)).toEqual(before);
  });

  it('never reaches beyond the band — a fresher title outside it is ignored', () => {
    // Item 9 is unseen but sits well below the band; promoting it would put
    // a materially worse match in the biggest slot on the page.
    const row = [item(1), item(2), item(3), item(4), item(9)];
    promoteFreshestHero(row, fatigue({ 1: 5, 2: 5, 3: 5, 4: 5, 9: 0 }));
    expect(ids(row)[0]).not.toBe('movie-9');
    expect(ids(row)[0]).toBe('movie-1');
  });

  it('treats a title absent from the fatigue map as unseen', () => {
    const row = [item(1), item(2), item(3)];
    promoteFreshestHero(row, fatigue({ 1: 4, 3: 1 })); // 2 has no entry
    expect(ids(row)[0]).toBe('movie-2');
  });

  it('scores on raw impressions, so an engaged title is still demotable', () => {
    // C1 exempts engaged titles from the fatigue PENALTY. The hero is the
    // card most likely to be tapped, so honouring that exemption here would
    // pin exactly the title that has been over-shown.
    const data = fatigue({ 1: 12, 2: 1 });
    data.engaged.add(1);
    const row = [item(1), item(2)];
    promoteFreshestHero(row, data);
    expect(ids(row)[0]).toBe('movie-2');
  });

  it('is a no-op on degenerate rows', () => {
    const empty: ContentItem[] = [];
    promoteFreshestHero(empty, fatigue({}));
    expect(empty).toEqual([]);

    const single = [item(1)];
    promoteFreshestHero(single, fatigue({ 1: 99 }));
    expect(ids(single)).toEqual(['movie-1']);
  });

  it('handles a row shorter than the band', () => {
    const row = [item(1), item(2)];
    promoteFreshestHero(row, fatigue({ 1: 3, 2: 0 }));
    expect(ids(row)).toEqual(['movie-2', 'movie-1']);
  });

  it('uses the configured band width', () => {
    // Guards the constant against being changed without the reasoning
    // behind it being revisited.
    expect(HERO_CANDIDATE_BAND).toBe(4);
  });
});
