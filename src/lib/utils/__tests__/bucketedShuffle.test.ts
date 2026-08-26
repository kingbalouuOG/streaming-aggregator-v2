import { describe, it, expect } from 'vitest';

import { bucketStamp, bucketedShuffleBands } from '../dailyShuffle';

const BUCKET_MIN = 20;
const at = (iso: string) => new Date(iso);
const seq = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('bucketStamp', () => {
  it('is stable within a bucket', () => {
    expect(bucketStamp(BUCKET_MIN, at('2026-08-26T12:00:00Z')))
      .toBe(bucketStamp(BUCKET_MIN, at('2026-08-26T12:19:59Z')));
  });

  it('advances at the bucket boundary', () => {
    expect(bucketStamp(BUCKET_MIN, at('2026-08-26T12:19:59Z')))
      .not.toBe(bucketStamp(BUCKET_MIN, at('2026-08-26T12:20:00Z')));
  });

  it('is computed from epoch minutes, so boundaries are timezone-independent', () => {
    // Same instant expressed two ways must land in the same bucket.
    expect(bucketStamp(BUCKET_MIN, at('2026-08-26T12:00:00Z')))
      .toBe(bucketStamp(BUCKET_MIN, at('2026-08-26T13:00:00+01:00')));
  });
});

describe('bucketedShuffleBands', () => {
  it('returns a new array and does not mutate the input', () => {
    const input = seq(12);
    const out = bucketedShuffleBands(input, 4, 'salt', BUCKET_MIN, at('2026-08-26T12:00:00Z'));
    expect(out).not.toBe(input);
    expect(input).toEqual(seq(12));
  });

  it('preserves every item exactly once', () => {
    const out = bucketedShuffleBands(seq(23), 4, 'salt', BUCKET_MIN, at('2026-08-26T12:00:00Z'));
    expect([...out].sort((a, b) => a - b)).toEqual(seq(23));
  });

  it('never moves an item outside its band — the whole point of banding', () => {
    const size = 4;
    const out = bucketedShuffleBands(seq(40), size, 'salt', BUCKET_MIN, at('2026-08-26T12:00:00Z'));
    out.forEach((value, index) => {
      // value is also its original rank, since the input was 0..n
      expect(Math.floor(value / size)).toBe(Math.floor(index / size));
    });
  });

  it('is deterministic within a bucket — no flicker between renders', () => {
    const a = bucketedShuffleBands(seq(20), 4, 'u1', BUCKET_MIN, at('2026-08-26T12:00:00Z'));
    const b = bucketedShuffleBands(seq(20), 4, 'u1', BUCKET_MIN, at('2026-08-26T12:18:00Z'));
    expect(a).toEqual(b);
  });

  it('produces a different order in the next bucket', () => {
    const a = bucketedShuffleBands(seq(20), 4, 'u1', BUCKET_MIN, at('2026-08-26T12:00:00Z'));
    const b = bucketedShuffleBands(seq(20), 4, 'u1', BUCKET_MIN, at('2026-08-26T12:40:00Z'));
    expect(a).not.toEqual(b);
  });

  it('gives different users different orders in the same bucket', () => {
    const now = at('2026-08-26T12:00:00Z');
    const a = bucketedShuffleBands(seq(20), 4, 'foryou:user-a', BUCKET_MIN, now);
    const b = bucketedShuffleBands(seq(20), 4, 'foryou:user-b', BUCKET_MIN, now);
    expect(a).not.toEqual(b);
  });

  it('shuffles a trailing partial band too', () => {
    // 10 items, band 4 -> bands of 4, 4, 2. Over several buckets the
    // trailing pair must swap at least once.
    const seen = new Set<string>();
    for (let h = 0; h < 12; h++) {
      const out = bucketedShuffleBands(
        seq(10), 4, 'salt', BUCKET_MIN, at(`2026-08-26T${String(h).padStart(2, '0')}:00:00Z`),
      );
      seen.add(out.slice(8).join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is a no-op for degenerate inputs', () => {
    const now = at('2026-08-26T12:00:00Z');
    expect(bucketedShuffleBands([], 4, 's', BUCKET_MIN, now)).toEqual([]);
    expect(bucketedShuffleBands([1], 4, 's', BUCKET_MIN, now)).toEqual([1]);
    expect(bucketedShuffleBands(seq(9), 1, 's', BUCKET_MIN, now)).toEqual(seq(9));
  });

  it('actually reorders across consecutive buckets — the feed visibly moves', () => {
    // The user-facing promise: consecutive opens differ. Check the top 4
    // change across a working day rather than trusting one comparison.
    const orders = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const t = new Date(Date.parse('2026-08-26T09:00:00Z') + i * 20 * 60_000);
      orders.add(bucketedShuffleBands(seq(20), 4, 'foryou:u1', BUCKET_MIN, t).slice(0, 4).join(','));
    }
    expect(orders.size).toBeGreaterThan(2);
  });
});
