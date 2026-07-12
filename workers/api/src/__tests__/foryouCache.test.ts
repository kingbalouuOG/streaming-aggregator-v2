import { describe, it, expect } from 'vitest';
import { buildFeedCacheKey, sliderHashOf, coalesce } from '../foryouCache';

const SLIDERS = { catalogueAge: 0.5, comfortZone: 0.25, contentMix: 0.5, variety: 0.5 };

describe('sliderHashOf', () => {
  it('joins the four sliders in a stable order', () => {
    expect(sliderHashOf(SLIDERS)).toBe('0.5.0.25.0.5.0.5');
  });
  it('returns "none" when there are no sliders', () => {
    expect(sliderHashOf(null)).toBe('none');
    expect(sliderHashOf(undefined)).toBe('none');
  });
});

describe('buildFeedCacheKey', () => {
  it('is order-independent in the service list', () => {
    const a = buildFeedCacheKey('u1', 't', SLIDERS, ['prime', 'netflix']);
    const b = buildFeedCacheKey('u1', 't', SLIDERS, ['netflix', 'prime']);
    expect(a).toBe(b);
  });

  it('changes when the taste timestamp changes', () => {
    const a = buildFeedCacheKey('u1', 't1', SLIDERS, ['netflix']);
    const b = buildFeedCacheKey('u1', 't2', SLIDERS, ['netflix']);
    expect(a).not.toBe(b);
  });

  it('changes when a slider changes', () => {
    const a = buildFeedCacheKey('u1', 't', SLIDERS, ['netflix']);
    const b = buildFeedCacheKey('u1', 't', { ...SLIDERS, variety: 0.9 }, ['netflix']);
    expect(a).not.toBe(b);
  });

  it('collapses a null timestamp to 0', () => {
    expect(buildFeedCacheKey('u1', null, SLIDERS, ['netflix'])).toContain(':0:');
  });
});

describe('coalesce (finding 3 single-flight)', () => {
  it('runs the factory once for concurrent callers on the same key', async () => {
    const inflight = new Map<string, Promise<string>>();
    let calls = 0;
    let resolve!: (v: string) => void;
    const factory = () => {
      calls += 1;
      return new Promise<string>((r) => { resolve = r; });
    };

    const first = coalesce(inflight, 'k', factory);
    const second = coalesce(inflight, 'k', factory);
    expect(first.leader).toBe(true);
    expect(second.leader).toBe(false);
    expect(calls).toBe(1);

    resolve('body');
    expect(await first.promise).toBe('body');
    expect(await second.promise).toBe('body');
  });

  it('removes the entry after settle so a later miss re-leads', async () => {
    const inflight = new Map<string, Promise<string>>();
    const one = coalesce(inflight, 'k', () => Promise.resolve('a'));
    expect(one.leader).toBe(true);
    await one.promise;
    // Allow the .finally cleanup microtask to run.
    await Promise.resolve();
    const two = coalesce(inflight, 'k', () => Promise.resolve('b'));
    expect(two.leader).toBe(true);
    expect(await two.promise).toBe('b');
  });

  it('propagates rejection to followers and clears the entry', async () => {
    const inflight = new Map<string, Promise<string>>();
    const boom = () => Promise.reject(new Error('render failed'));
    const leader = coalesce(inflight, 'k', boom);
    const follower = coalesce(inflight, 'k', boom);
    expect(follower.leader).toBe(false);
    await expect(leader.promise).rejects.toThrow('render failed');
    await expect(follower.promise).rejects.toThrow('render failed');
    await Promise.resolve();
    expect(inflight.has('k')).toBe(false);
  });
});
