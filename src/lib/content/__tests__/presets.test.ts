import { describe, expect, it } from 'vitest';

import { TASTE_CLUSTERS } from '../../taste-v2/tasteClusters';
import {
  PRESET_POOL,
  PRESET_SENTENCES,
  presetByKey,
  selectPresets,
  weekBucketFor,
  type SelectedPreset,
} from '../presets';

// Slot rules and pool invariants for the preset grid (recommendation
// 2026-09-08-002 §2.3–2.4). The selection is deterministic in (hour, dow,
// clusters, weekBucket), which is the whole reason it can be tested at all —
// nothing here reads a clock or a database.

const NO_CLUSTERS: string[] = [];

/** Monday 10:00 — neutral time bucket, weekday. */
const WEEKDAY_MID = { hour: 10, dow: 1 };
/** Monday 07:00 — the weekday-morning bucket. */
const WEEKDAY_MORNING = { hour: 7, dow: 1 };
/** Tuesday 23:00 — the late-night bucket. */
const LATE_NIGHT = { hour: 23, dow: 2 };
/** Saturday 19:00 — weekend evening. */
const WEEKEND_EVENING = { hour: 19, dow: 6 };

function keysOf(presets: SelectedPreset[]): string[] {
  return presets.map((p) => p.key);
}

function select(over: Partial<Parameters<typeof selectPresets>[0]> = {}): SelectedPreset[] {
  return selectPresets({
    hour: WEEKDAY_MID.hour,
    dow: WEEKDAY_MID.dow,
    selectedClusters: NO_CLUSTERS,
    weekBucket: 100,
    ...over,
  });
}

describe('PRESET_POOL', () => {
  it('holds eight cards, four vibe and four constraint', () => {
    expect(PRESET_POOL).toHaveLength(8);
    expect(PRESET_POOL.filter((p) => p.kind === 'vibe')).toHaveLength(4);
    expect(PRESET_POOL.filter((p) => p.kind === 'constraint')).toHaveLength(4);
  });

  it('gives every card a unique key and a sentence a person would say', () => {
    const keys = PRESET_POOL.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const preset of PRESET_POOL) {
      expect(preset.sentence.trim().length).toBeGreaterThan(10);
      // The test from the brief: an intent is a sentence, not a label.
      expect(preset.sentence.split(' ').length).toBeGreaterThanOrEqual(4);
    }
  });

  it('exposes one placeholder sentence per card', () => {
    expect(PRESET_SENTENCES).toHaveLength(8);
    expect(new Set(PRESET_SENTENCES).size).toBe(8);
  });

  it('names only real taste clusters, and only on vibe cards', () => {
    const known = new Set(TASTE_CLUSTERS.map((c) => c.id));
    for (const preset of PRESET_POOL) {
      if (preset.kind === 'constraint') {
        expect(preset.clusters).toEqual([]);
        continue;
      }
      expect(preset.clusters.length).toBeGreaterThan(0);
      for (const id of preset.clusters) expect(known).toContain(id);
    }
  });

  // Cards whose whole content is metadata predicates carry no phrase: there
  // is nothing for an embedding to find, and asking anyway retrieves titles
  // that merely TALK about the property.
  //
  // `free` was phrase-less from the start — cost is a fact about availability.
  // `new-good` joined it on 2026-09-09 after measurement: its phrase, "a
  // recent, well-reviewed film or series … that both critics and audiences
  // rated highly", is a statement ABOUT a title rather than a description OF
  // one, and its top five were *Voir* (a series in which film lovers examine
  // cinematic moments), *The Favourite*, *The Great*, *Blockbuster* and
  // *Nightcrawler*. On a device the card returned 2 titles out of 363 in the
  // catalogue meeting its own criteria; filter-only via /discover returns 205.
  const FACT_CARDS = new Set(['free', 'new-good']);

  it('leaves the fact cards phrase-less — a fact is not a feeling', () => {
    for (const key of FACT_CARDS) expect(presetByKey(key)?.phrase).toBeNull();
  });

  it('gives every other card a phrase, or the semantic path has nothing to send', () => {
    for (const preset of PRESET_POOL) {
      if (!FACT_CARDS.has(preset.key)) expect(preset.phrase).toBeTruthy();
    }
  });

  it('gives every fact card filters that fully express it', () => {
    // A phrase-less card contributes ONLY filters, so an empty patch would
    // make it a no-op button.
    for (const key of FACT_CARDS) {
      expect(Object.keys(presetByKey(key)?.filters ?? {}).length).toBeGreaterThan(0);
    }
  });
});

describe('selectPresets — shape', () => {
  it('returns four cards in slot order, two vibe then two constraint', () => {
    const picked = select();
    expect(picked.map((p) => p.slot)).toEqual(['A', 'B', 'C', 'D']);
    expect(picked.map((p) => p.kind)).toEqual(['vibe', 'vibe', 'constraint', 'constraint']);
  });

  it('never repeats a card', () => {
    const cases = [WEEKDAY_MID, WEEKDAY_MORNING, LATE_NIGHT, WEEKEND_EVENING];
    for (const time of cases) {
      for (let week = 0; week < 8; week++) {
        const keys = keysOf(select({ ...time, weekBucket: week }));
        expect(new Set(keys).size, `${JSON.stringify(time)} week ${week}`).toBe(4);
      }
    }
  });

  it('stamps a selection reason on every slot', () => {
    const picked = select();
    expect(picked[0].selectionReason).toBe('time');
    expect(picked[2].selectionReason).toBe('fixed');
    expect(picked[3].selectionReason).toBe('time');
    expect(['taste', 'rotation']).toContain(picked[1].selectionReason);
  });
});

describe('selectPresets — slot A follows the clock', () => {
  it('picks Late-night late at night', () => {
    expect(select({ ...LATE_NIGHT }).at(0)?.key).toBe('late');
  });

  it('picks Comfort on a weekday morning', () => {
    expect(select({ ...WEEKDAY_MORNING }).at(0)?.key).toBe('comfort');
  });

  it('picks High-energy on a weekend evening', () => {
    expect(select({ ...WEEKEND_EVENING }).at(0)?.key).toBe('quick');
  });

  it('falls back to Slow burn the rest of the time', () => {
    expect(select({ ...WEEKDAY_MID }).at(0)?.key).toBe('slow');
  });
});

describe('selectPresets — slot B follows taste', () => {
  it('prefers a vibe whose clusters the user actually picked', () => {
    const picked = select({ selectedClusters: ['horror-supernatural', 'dark-thrillers'] });
    expect(picked[1].key).toBe('late');
    expect(picked[1].selectionReason).toBe('taste');
  });

  it('ranks by how many of the user’s clusters a vibe serves', () => {
    // Two hits for Comfort (feel-good + rom-coms), one for High-energy.
    const picked = select({
      selectedClusters: ['feel-good-funny', 'rom-coms-love-stories', 'action-adrenaline'],
    });
    expect(picked[1].key).toBe('comfort');
  });

  it('never duplicates slot A, even when A is the user’s strongest affinity', () => {
    // Slot A is Late-night at 23:00, and the clusters point at Late-night too.
    const picked = select({ ...LATE_NIGHT, selectedClusters: ['horror-supernatural'] });
    expect(picked[0].key).toBe('late');
    expect(picked[1].key).not.toBe('late');
  });

  it('falls back to pool order for a cold user, and says so', () => {
    const picked = select({ selectedClusters: [] });
    expect(picked[1].selectionReason).toBe('rotation');
    expect(picked[1].kind).toBe('vibe');
  });
});

describe('selectPresets — slot B does not repeat last week', () => {
  // The property comes from the rotation itself: `pickTasteVibe` indexes its
  // band by `weekBucket % length`, so consecutive buckets differ whenever the
  // band holds more than one card. A guard that re-asked the question of the
  // previous week and fell back to the next one sat in `selectPresets` until
  // 2026-09-09; it could not fire, and these tests passed without it. It is
  // gone, and the property is asserted here directly instead.
  it('changes for a cold user week to week', () => {
    const a = select({ weekBucket: 41 })[1].key;
    const b = select({ weekBucket: 42 })[1].key;
    expect(a).not.toBe(b);
  });

  it('changes on every consecutive pair across a full rotation', () => {
    // One pair could pass by luck. A whole cycle cannot.
    const keys = Array.from({ length: 12 }, (_, i) => select({ weekBucket: i })[1].key);
    for (let i = 1; i < keys.length; i += 1) {
      expect(keys[i]).not.toBe(keys[i - 1]);
    }
    // And it really is a rotation, not a random walk: more than one card is
    // reached, so the pairwise check above is testing something.
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it('changes for a user with two competing affinities', () => {
    const clusters = ['horror-supernatural', 'action-adrenaline'];
    const a = select({ selectedClusters: clusters, weekBucket: 7 })[1].key;
    const b = select({ selectedClusters: clusters, weekBucket: 8 })[1].key;
    expect(a).not.toBe(b);
  });

  it('holds a single clear affinity rather than rotating off it', () => {
    // One eligible taste candidate means there is nothing to rotate to, and
    // giving the user a vibe they did not pick would be worse than repeating.
    const clusters = ['action-adrenaline', 'epic-scifi-fantasy'];
    const a = select({ selectedClusters: clusters, weekBucket: 3 })[1].key;
    const b = select({ selectedClusters: clusters, weekBucket: 4 })[1].key;
    expect(a).toBe('quick');
    expect(b).toBe('quick');
  });
});

describe('selectPresets — slot C is fixed and slot D follows the clock', () => {
  it('always shows New & actually good in slot C', () => {
    for (const time of [WEEKDAY_MID, WEEKDAY_MORNING, LATE_NIGHT, WEEKEND_EVENING]) {
      expect(select({ ...time, weekBucket: 5 })[2].key).toBe('new-good');
    }
  });

  it('shows Free to watch during the week', () => {
    expect(select({ hour: 13, dow: 2 })[3].key).toBe('free');
  });

  it('shows Whole family from Friday to Sunday, daytime', () => {
    expect(select({ hour: 14, dow: 5 })[3].key).toBe('family');
    expect(select({ hour: 11, dow: 6 })[3].key).toBe('family');
    expect(select({ hour: 16, dow: 0 })[3].key).toBe('family');
  });

  it('shows Finish it tonight late on a weeknight, Friday included', () => {
    expect(select({ hour: 21, dow: 3 })[3].key).toBe('finish-tonight');
    expect(select({ hour: 22, dow: 5 })[3].key).toBe('finish-tonight');
  });
});

describe('weekBucketFor', () => {
  it('is stable within a week and moves on to the next', () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const t = 900 * week;
    expect(weekBucketFor(t)).toBe(weekBucketFor(t + week - 1));
    expect(weekBucketFor(t + week)).toBe(weekBucketFor(t) + 1);
  });
});
