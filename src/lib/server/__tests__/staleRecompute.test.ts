import { describe, it, expect } from 'vitest';
import { hasNewSignalSinceRecompute } from '../staleRecompute';
import type { UserScope, ScopedResult } from '../userScope';

/**
 * Minimal chainable scope stub: select(...).in(...).gt(...).limit(...)
 * resolves to a canned ScopedResult. Records the gt() bound so tests can
 * assert the probe filters on the recompute marker.
 */
function stubScope(result: ScopedResult, sink?: { gtValue?: unknown }): UserScope {
  const chain = {
    in: () => chain,
    gt: (_col: string, value: unknown) => {
      if (sink) sink.gtValue = value;
      return chain;
    },
    limit: () => chain,
    then: (onFulfilled: (r: ScopedResult) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  return {
    userId: 'u1',
    select: () => chain as unknown as ReturnType<UserScope['select']>,
  } as unknown as UserScope;
}

describe('hasNewSignalSinceRecompute (finding 2 activity gate)', () => {
  it('recomputes when never recomputed (null marker)', async () => {
    // No DB probe should be needed — but even if reached, empty data.
    const scope = stubScope({ data: [], error: null, count: null });
    expect(await hasNewSignalSinceRecompute(scope, null)).toBe(true);
  });

  it('recomputes when an interaction is newer than the last recompute', async () => {
    const scope = stubScope({ data: [{ created_at: '2026-07-11T00:00:00Z' }], error: null, count: null });
    expect(await hasNewSignalSinceRecompute(scope, '2026-07-10T00:00:00Z')).toBe(true);
  });

  it('skips when no interaction is newer than the last recompute', async () => {
    const scope = stubScope({ data: [], error: null, count: null });
    expect(await hasNewSignalSinceRecompute(scope, '2026-07-10T00:00:00Z')).toBe(false);
  });

  it('fails open (recomputes) on a probe error', async () => {
    const scope = stubScope({ data: null, error: { message: 'boom' }, count: null });
    expect(await hasNewSignalSinceRecompute(scope, '2026-07-10T00:00:00Z')).toBe(true);
  });

  it('probes strictly after the last recompute timestamp', async () => {
    const sink: { gtValue?: unknown } = {};
    const scope = stubScope({ data: [], error: null, count: null }, sink);
    await hasNewSignalSinceRecompute(scope, '2026-07-10T00:00:00Z');
    expect(sink.gtValue).toBe('2026-07-10T00:00:00Z');
  });
});
