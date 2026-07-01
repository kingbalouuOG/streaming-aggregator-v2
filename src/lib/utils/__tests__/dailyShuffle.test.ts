/**
 * Unit tests for the day-seeded rotation helpers used by the Home rails.
 * Determinism-within-day and change-across-day are the load-bearing
 * properties — they're what make the feed look fresh without new data
 * while staying flicker-free on re-render.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { dailyShuffleTopN, dailyPick, utcDayStamp } from '../dailyShuffle';

const seq = (n: number) => Array.from({ length: n }, (_, i) => i);

afterEach(() => {
  vi.useRealTimers();
});

describe('utcDayStamp', () => {
  it('is the UTC calendar day, stable across a day and rolling at 00:00 UTC', () => {
    expect(utcDayStamp(new Date('2026-07-01T00:00:00Z'))).toBe('2026-07-01');
    expect(utcDayStamp(new Date('2026-07-01T23:59:59Z'))).toBe('2026-07-01');
    expect(utcDayStamp(new Date('2026-07-02T00:00:01Z'))).toBe('2026-07-02');
  });
});

describe('dailyShuffleTopN', () => {
  it('is a permutation — preserves length and membership', () => {
    const out = dailyShuffleTopN(seq(30), 20, 'popular');
    expect(out).toHaveLength(30);
    expect([...out].sort((a, b) => a - b)).toEqual(seq(30));
  });

  it('only reorders the head — the tail past topN stays in place', () => {
    const out = dailyShuffleTopN(seq(30), 20, 'popular');
    expect(out.slice(20)).toEqual(seq(30).slice(20));
  });

  it('is deterministic within a day (no flicker on re-render)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    const a = dailyShuffleTopN(seq(20), 20, 'popular');
    const b = dailyShuffleTopN(seq(20), 20, 'popular');
    expect(a).toEqual(b);
  });

  it('changes from one UTC day to the next', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    const day1 = dailyShuffleTopN(seq(20), 20, 'popular');
    vi.setSystemTime(new Date('2026-07-02T12:00:00Z'));
    const day2 = dailyShuffleTopN(seq(20), 20, 'popular');
    expect(day2).not.toEqual(day1);
  });

  it('handles empty and single-element lists without shuffling', () => {
    expect(dailyShuffleTopN([], 20, 'x')).toEqual([]);
    expect(dailyShuffleTopN([7], 20, 'x')).toEqual([7]);
  });
});

describe('dailyPick', () => {
  it('picks only from the first topN and is deterministic within a day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    const a = dailyPick(seq(50), 5, 'hero');
    const b = dailyPick(seq(50), 5, 'hero');
    expect(a).toBe(b);
    expect(a).toBeLessThan(5);
  });

  it('returns undefined for an empty list', () => {
    expect(dailyPick([], 5, 'hero')).toBeUndefined();
  });

  it('varies across days (rotates the hero)', () => {
    vi.useFakeTimers();
    // Sample a week of picks from a 5-wide window; a fixed seed should not
    // collapse to a single value every day.
    const picks = new Set<number | undefined>();
    for (let d = 1; d <= 7; d++) {
      vi.setSystemTime(new Date(`2026-07-0${d}T12:00:00Z`));
      picks.add(dailyPick(seq(5), 5, 'hero'));
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});
