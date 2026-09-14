import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MIN_REFRESH_MS,
  holdAtLeast,
  itemSignature,
  refreshOutcome,
} from '../pullToRefresh';

describe('holdAtLeast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a fast result until the minimum has passed', async () => {
    vi.useFakeTimers();
    let settled = false;
    const held = holdAtLeast(Promise.resolve('feed'), MIN_REFRESH_MS).then((v) => {
      settled = true;
      return v;
    });

    await vi.advanceTimersByTimeAsync(MIN_REFRESH_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(held).resolves.toBe('feed');
  });

  it('does not add the minimum on top of slow work', async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('feed'), 2000));
    let settled = false;
    const held = holdAtLeast(slow, MIN_REFRESH_MS).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(2000);
    await held;
    expect(settled).toBe(true);
  });

  it('holds a fast failure too, then rejects with it', async () => {
    const waits: number[] = [];
    let release!: () => void;
    const wait = (ms: number) => {
      waits.push(ms);
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };

    let rejected = false;
    const held = holdAtLeast(Promise.reject(new Error('offline')), 500, wait).catch((e: Error) => {
      rejected = true;
      return e.message;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(rejected).toBe(false);

    release();
    await expect(held).resolves.toBe('offline');
    expect(waits).toEqual([500]);
  });
});

describe('refreshOutcome', () => {
  it('reports a failure regardless of content', () => {
    expect(refreshOutcome({ failed: true, before: 'a', after: 'b' })).toBe('failed');
  });

  it('reports up to date when the rendered titles are unchanged', () => {
    expect(refreshOutcome({ failed: false, before: 'a,b|c', after: 'a,b|c' })).toBe('current');
  });

  it('reports updated when the titles moved', () => {
    expect(refreshOutcome({ failed: false, before: 'a,b|c', after: 'b,a|c' })).toBe('updated');
  });
});

describe('itemSignature', () => {
  it('is order-sensitive within and across groups', () => {
    const a = { id: 'movie-1' };
    const b = { id: 'tv-2' };
    expect(itemSignature([[a, b]])).not.toBe(itemSignature([[b, a]]));
    expect(itemSignature([[a], [b]])).not.toBe(itemSignature([[a, b]]));
  });

  it('treats a missing group as empty', () => {
    expect(itemSignature([null, [{ id: 'movie-1' }], undefined])).toBe('|movie-1|');
  });
});
