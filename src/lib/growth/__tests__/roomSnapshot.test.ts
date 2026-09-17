import { describe, expect, it } from 'vitest';

import { formatPickedDate, sharedRoomUrl, neutraliseRoomLabel } from '../roomSnapshot';

describe('sharedRoomUrl', () => {
  it('is the canonical https room URL', () => {
    expect(sharedRoomUrl('3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b')).toBe(
      'https://videxstreaming.com/room/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
    );
  });
});

describe('formatPickedDate', () => {
  it('formats a UTC day month year', () => {
    expect(formatPickedDate('2026-09-14T09:30:00Z')).toBe('14 September 2026');
    expect(formatPickedDate('2026-01-01T00:00:00.000+00:00')).toBe('1 January 2026');
  });
  it('returns empty for an unparseable date', () => {
    expect(formatPickedDate('not a date')).toBe('');
  });
});

describe('neutraliseRoomLabel', () => {
  it.each([
    ['Because you liked Heat', 'More like Heat'],
    ['Because you loved Heat', 'More like Heat'],
    ['Because you watched Heat', 'More like Heat'],
    ['If you love Heat', 'More like Heat'],
    ['If you liked Heat', 'More like Heat'],
  ])('strips personal framing: %s', (input, expected) => {
    expect(neutraliseRoomLabel(input)).toBe(expected);
  });

  it('leaves a neutral label alone and collapses whitespace', () => {
    expect(neutraliseRoomLabel("Gotham's   Gritty Legacy")).toBe("Gotham's Gritty Legacy");
  });
});
