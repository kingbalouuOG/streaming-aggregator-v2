import { describe, it, expect, afterEach, vi } from 'vitest';

import { dailyPick } from '../dailyShuffle';

const seq = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Freeze the clock at a UTC day so the cycle is observable. */
const onDay = (iso: string) => vi.setSystemTime(new Date(`${iso}T09:00:00Z`));

afterEach(() => {
  vi.useRealTimers();
});

describe('dailyPick', () => {
  it('is stable within a day', () => {
    vi.useFakeTimers();
    onDay('2026-08-28');
    const a = dailyPick(seq(10), 5, 'home:hero:netflix');
    vi.setSystemTime(new Date('2026-08-28T23:59:00Z'));
    expect(dailyPick(seq(10), 5, 'home:hero:netflix')).toBe(a);
  });

  it('advances one slot per day', () => {
    vi.useFakeTimers();
    const items = seq(10);
    onDay('2026-08-28');
    const d1 = dailyPick(items, 5, 'salt') as number;
    onDay('2026-08-29');
    const d2 = dailyPick(items, 5, 'salt') as number;
    expect(d2).toBe((d1 + 1) % 5);
  });

  it('never repeats within the window on consecutive days — the regression', () => {
    // The old implementation drew a day-seeded RANDOM index, so consecutive
    // days collided roughly 1-in-topN. Over a 5-day window every slot must
    // now be visited exactly once.
    vi.useFakeTimers();
    const items = seq(10);
    const picks: number[] = [];
    for (const d of ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01']) {
      onDay(d);
      picks.push(dailyPick(items, 5, 'home:hero:netflix') as number);
    }
    expect(new Set(picks).size).toBe(5);
  });

  it('stays inside the topN window', () => {
    vi.useFakeTimers();
    for (const d of ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']) {
      onDay(d);
      const pick = dailyPick(seq(50), 5, 's') as number;
      expect(pick).toBeGreaterThanOrEqual(0);
      expect(pick).toBeLessThan(5);
    }
  });

  it('gives different salts different starting offsets', () => {
    vi.useFakeTimers();
    onDay('2026-08-28');
    const a = dailyPick(seq(10), 5, 'home:hero:netflix');
    const b = dailyPick(seq(10), 5, 'home:hero:prime');
    // Not a guarantee for every pair, but these two must not collide or the
    // per-service salt is doing nothing.
    expect(a).not.toBe(b);
  });

  it('handles a window larger than the list', () => {
    vi.useFakeTimers();
    onDay('2026-08-28');
    const pick = dailyPick([7, 8], 5, 's');
    expect([7, 8]).toContain(pick);
  });

  it('returns undefined for an empty list', () => {
    expect(dailyPick([], 5, 's')).toBeUndefined();
  });

  it('is a no-op for a single item', () => {
    vi.useFakeTimers();
    onDay('2026-08-28');
    expect(dailyPick([42], 5, 's')).toBe(42);
    onDay('2026-08-29');
    expect(dailyPick([42], 5, 's')).toBe(42);
  });
});
