// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  capBlock,
  capGroupFor,
  GLOBAL_FLOOR_MAX,
  hitGlobalFloor,
  hitGroupCap,
  isQuietHour,
  localHour,
  nudgeWindowStart,
  pushesInFloorWindow,
  type RecentDelivery,
} from '../pushPolicy';

const at = (iso: string) => new Date(iso);
const H = 3600 * 1000;
const NOW = at('2026-09-18T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const row = (notification_type: string, sentAgoMs: number, push_id: string | null = null): RecentDelivery => ({
  notification_type,
  sent_at: ago(sentAgoMs),
  push_id,
});

describe('capGroupFor', () => {
  it('puts the two title alerts in one group and the nudge in its own', () => {
    expect(capGroupFor('arrival')).toBe('titles');
    expect(capGroupFor('leaving_soon')).toBe('titles');
    expect(capGroupFor('household_nudge')).toBe('household');
  });
});

describe('group cap (one push per group per 20 hours)', () => {
  it('blocks just inside 20 hours and releases at 20 hours', () => {
    expect(hitGroupCap([row('arrival', 20 * H - 1)], 'titles', NOW)).toBe(true);
    expect(hitGroupCap([row('arrival', 20 * H)], 'titles', NOW)).toBe(false);
  });

  it('a leaving-soon push caps an arrival (same group)', () => {
    expect(capBlock([row('leaving_soon', 2 * H)], 'arrival', NOW)).toBe('group');
  });

  it('a nudge earlier today does not block an arrival', () => {
    expect(capBlock([row('household_nudge', 3 * H, 'p1')], 'arrival', NOW)).toBeNull();
  });

  it('an arrival earlier today does not block a nudge', () => {
    expect(capBlock([row('arrival', 3 * H, 'p1')], 'household_nudge', NOW)).toBeNull();
  });

  it('a nudge earlier today blocks a second nudge', () => {
    expect(capBlock([row('household_nudge', 30 * 60 * 1000, 'p1')], 'household_nudge', NOW)).toBe('group');
  });

  it('ignores types it does not know', () => {
    expect(hitGroupCap([row('digest', 1 * H)], 'titles', NOW)).toBe(false);
  });
});

describe('global floor (3 pushes per rolling 24 hours)', () => {
  const three = [row('arrival', 23 * H, 'a'), row('household_nudge', 22 * H, 'b'), row('arrival', 21 * H, 'c')];

  it('is 3', () => {
    expect(GLOBAL_FLOOR_MAX).toBe(3);
  });

  it('blocks at three pushes inside 24 hours, even when the group is clear', () => {
    expect(hitGroupCap(three, 'household', NOW)).toBe(false);
    expect(capBlock(three, 'household_nudge', NOW)).toBe('global');
  });

  it('releases once the oldest is 24 hours old', () => {
    const edge = [row('arrival', 24 * H, 'a'), three[1], three[2]];
    expect(hitGlobalFloor(edge, NOW)).toBe(false);
    const inside = [row('arrival', 24 * H - 1, 'a'), three[1], three[2]];
    expect(hitGlobalFloor(inside, NOW)).toBe(true);
  });

  it('counts a bundle once: rows sharing a push_id are one push', () => {
    const bundle = [row('arrival', 21 * H, 'x'), row('arrival', 21 * H, 'x'), row('leaving_soon', 21 * H, 'x')];
    expect(pushesInFloorWindow(bundle, NOW)).toBe(1);
  });

  it('counts a pre-095 bundle once: no push_id, one INSERT, one sent_at', () => {
    const legacy = [row('arrival', 21 * H), row('arrival', 21 * H)];
    expect(pushesInFloorWindow(legacy, NOW)).toBe(1);
  });
});

describe('isQuietHour (22:00 to 08:00 Europe/London)', () => {
  it('winter (GMT): 21:59 is not quiet, 22:00 is', () => {
    expect(isQuietHour(at('2026-01-15T21:59:59Z'))).toBe(false);
    expect(isQuietHour(at('2026-01-15T22:00:00Z'))).toBe(true);
  });

  it('winter (GMT): 07:59 is quiet, 08:00 is not', () => {
    expect(isQuietHour(at('2026-01-16T07:59:59Z'))).toBe(true);
    expect(isQuietHour(at('2026-01-16T08:00:00Z'))).toBe(false);
  });

  it('summer (BST): the same local boundaries sit an hour earlier in UTC', () => {
    expect(isQuietHour(at('2026-07-15T20:59:59Z'))).toBe(false); // 21:59 BST
    expect(isQuietHour(at('2026-07-15T21:00:00Z'))).toBe(true); // 22:00 BST
    expect(isQuietHour(at('2026-07-16T06:59:59Z'))).toBe(true); // 07:59 BST
    expect(isQuietHour(at('2026-07-16T07:00:00Z'))).toBe(false); // 08:00 BST
  });

  it('spring change (29 March 2026, clocks forward at 01:00 UTC)', () => {
    expect(localHour(at('2026-03-29T00:59:00Z'), 'Europe/London')).toBe(0);
    expect(localHour(at('2026-03-29T01:00:00Z'), 'Europe/London')).toBe(2);
    expect(isQuietHour(at('2026-03-29T06:59:59Z'))).toBe(true); // 07:59 BST
    expect(isQuietHour(at('2026-03-29T07:00:00Z'))).toBe(false); // 08:00 BST
  });

  it('autumn change (25 October 2026, clocks back at 01:00 UTC)', () => {
    expect(localHour(at('2026-10-25T00:59:00Z'), 'Europe/London')).toBe(1);
    expect(localHour(at('2026-10-25T01:00:00Z'), 'Europe/London')).toBe(1);
    expect(isQuietHour(at('2026-10-25T07:59:59Z'))).toBe(true); // 07:59 GMT
    expect(isQuietHour(at('2026-10-25T08:00:00Z'))).toBe(false); // 08:00 GMT
    expect(isQuietHour(at('2026-10-25T21:00:00Z'))).toBe(false); // 21:00 GMT, quiet a day earlier
    expect(isQuietHour(at('2026-10-24T21:00:00Z'))).toBe(true); // 22:00 BST
  });

  it('uses the zone it is given, not the machine zone', () => {
    expect(isQuietHour(at('2026-07-15T21:30:00Z'), 'UTC')).toBe(false);
    expect(isQuietHour(at('2026-07-15T21:30:00Z'), 'Europe/London')).toBe(true);
  });
});

describe('nudgeWindowStart (current hour, truncated in UTC)', () => {
  it('truncates either side of the hour', () => {
    expect(nudgeWindowStart(at('2026-09-18T10:59:59.999Z')).toISOString()).toBe('2026-09-18T10:00:00.000Z');
    expect(nudgeWindowStart(at('2026-09-18T11:00:00.000Z')).toISOString()).toBe('2026-09-18T11:00:00.000Z');
  });

  it('stays in UTC across the clock change', () => {
    expect(nudgeWindowStart(at('2026-10-25T00:30:00Z')).toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(nudgeWindowStart(at('2026-10-25T01:30:00Z')).toISOString()).toBe('2026-10-25T01:00:00.000Z');
  });
});
