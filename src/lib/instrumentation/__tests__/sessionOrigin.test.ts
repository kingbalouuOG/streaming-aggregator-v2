import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resetCallbacks: Array<() => void> = [];
vi.mock('../sessionId', () => ({
  onSessionReset: (cb: () => void) => {
    resetCallbacks.push(cb);
    return () => {};
  },
}));

import {
  __resetSessionOriginForTests,
  dismissSessionBanner,
  getSessionOrigin,
  getSessionSrc,
  RESET_GRACE_MS,
  setSessionOrigin,
  subscribeSessionOrigin,
  type SessionOrigin,
} from '../sessionOrigin';

const push = (at: number): SessionOrigin => ({
  origin: 'push',
  object: { type: 'title', id: 'tv-95396' },
  type: 'arrival',
  serviceId: 'apple',
  at,
});

const fireReset = () => resetCallbacks.forEach((cb) => cb());

describe('sessionOrigin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T08:00:00Z'));
    resetCallbacks.length = 0;
    __resetSessionOriginForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is organic until a push tap sets it', () => {
    expect(getSessionOrigin()).toBeNull();
    expect(getSessionSrc()).toBe('organic');
    setSessionOrigin(push(Date.now()));
    expect(getSessionSrc()).toBe('push');
    expect(getSessionOrigin()?.object).toEqual({ type: 'title', id: 'tv-95396' });
  });

  it('subscribes to session reset once', () => {
    setSessionOrigin(push(Date.now()));
    setSessionOrigin(push(Date.now()));
    expect(resetCallbacks).toHaveLength(1);
  });

  it('clears on session reset', () => {
    setSessionOrigin(push(Date.now()));
    vi.advanceTimersByTime(6 * 60 * 1000);
    fireReset();
    expect(getSessionOrigin()).toBeNull();
    expect(getSessionSrc()).toBe('organic');
  });

  it('survives a reset that races the tap that woke the app', () => {
    setSessionOrigin(push(Date.now()));
    vi.advanceTimersByTime(RESET_GRACE_MS - 1);
    fireReset();
    expect(getSessionSrc()).toBe('push');
  });

  it('notifies subscribers on set, dismiss and reset', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSessionOrigin(listener);
    setSessionOrigin(push(Date.now()));
    dismissSessionBanner();
    expect(getSessionOrigin()?.bannerDismissed).toBe(true);
    expect(getSessionSrc()).toBe('push');
    dismissSessionBanner();
    vi.advanceTimersByTime(RESET_GRACE_MS);
    fireReset();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    setSessionOrigin(push(Date.now()));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('returns a new object when dismissed (useSyncExternalStore snapshots)', () => {
    setSessionOrigin(push(Date.now()));
    const before = getSessionOrigin();
    dismissSessionBanner();
    expect(getSessionOrigin()).not.toBe(before);
  });
});
