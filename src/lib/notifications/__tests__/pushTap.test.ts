// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { pushOpen, pushOriginType, pushRoute } from '../pushTap';

const LIST = '8c1e3f2b-4e6f-4a9d-8b7a-5a6b1c2d3e4f';
const DELIVERY = '00000000-0000-4000-8000-000000000001';
const PUSH = '00000000-0000-4000-8000-0000000000aa';

describe('pushOriginType', () => {
  it('recognises the three push types', () => {
    expect(pushOriginType('arrival')).toBe('arrival');
    expect(pushOriginType('leaving_soon')).toBe('leaving_soon');
    expect(pushOriginType('household_nudge')).toBe('household_nudge');
  });
  it('anything else is still a bundle', () => {
    expect(pushOriginType('bundle')).toBe('bundle');
    expect(pushOriginType('digest')).toBe('bundle');
    expect(pushOriginType(null)).toBe('bundle');
  });
});

describe('pushRoute', () => {
  it('a list url lands on the list route (lower-cased, no invite)', () => {
    expect(pushRoute(`videx://list/${LIST.toUpperCase()}`)).toBe(`/list/${LIST}`);
  });
  it('title urls route as before', () => {
    expect(pushRoute('videx://detail/tv-95396')).toBe('/detail/tv-95396');
  });
  it('non-object app paths keep the old string strip', () => {
    expect(pushRoute('videx://watchlist')).toBe('/watchlist');
    expect(pushRoute('videx://profile/notifications')).toBe('/profile/notifications');
  });
  it('a malformed list id falls back to the strip, as any unknown path did', () => {
    expect(pushRoute('videx://list/not-a-uuid')).toBe('/list/not-a-uuid');
  });
  it('nothing routable is null', () => {
    expect(pushRoute('https://example.com/x')).toBeNull();
  });
});

describe('pushOpen', () => {
  it('a nudge carries the list object, delivery id and kind with push_id', () => {
    const open = pushOpen(
      { url: `videx://list/${LIST}`, type: 'household_nudge', delivery_id: DELIVERY, push_id: PUSH, via: 'push' } as never,
      `videx://list/${LIST}`,
    );
    expect(open).toEqual({
      object: { type: 'list', id: LIST },
      deliveryId: DELIVERY,
      metadata: { type: 'household_nudge', kind: 'household_nudge', push_id: PUSH },
    });
  });

  it('a bundle open carries its push_id so it counts once (IN-GR-026)', () => {
    const open = pushOpen({ url: 'videx://watchlist', type: 'bundle', delivery_id: null, push_id: PUSH }, 'videx://watchlist');
    expect(open).toEqual({ object: null, deliveryId: null, metadata: { type: 'bundle', push_id: PUSH } });
  });

  it('a push from before 095 has no push_id and no kind', () => {
    const open = pushOpen(
      { url: 'videx://detail/tv-95396', type: 'arrival', delivery_id: DELIVERY },
      'videx://detail/tv-95396',
    );
    expect(open.metadata).toEqual({ type: 'arrival' });
    expect(open.object).toEqual({ type: 'title', id: 'tv-95396' });
  });
});
