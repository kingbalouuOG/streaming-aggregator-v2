/**
 * POST /v1/growth/events validation and the page handlers' preview rows
 * (Growth S2, migration 090). Pure module, root vitest rig.
 */

import { describe, expect, it } from 'vitest';

import { buildGrowthEventBody } from '../../../../src/lib/growth/growthEvents';
import {
  checkPushOpen,
  GROWTH_EVENT_BODY_MAX_BYTES,
  previewEventRow,
  rateLimitKey,
  validateGrowthEventBody,
} from '../growthEvents';

const INSTALL = '0b7e6b0a-5f3c-4e2a-9d1b-6c8f7a2e4d10';
const ROOM = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

const valid = buildGrowthEventBody(
  { name: 'link_opened', via: 'share', src: 'push', object: { type: 'title', id: 'movie-603' } },
  { installId: INSTALL, platform: 'ios' },
);

describe('validateGrowthEventBody', () => {
  it('accepts what the app emitter builds', () => {
    expect(validateGrowthEventBody(valid)).toEqual({
      ok: true,
      value: {
        event_name: 'link_opened',
        install_id: INSTALL,
        via: 'share',
        src: 'push',
        object_type: 'title',
        object_id: 'movie-603',
        platform: 'ios',
        ua_class: null,
        delivery_id: null,
        metadata: {},
      },
    });
  });

  it('accepts a minimal first_open (optional keys absent) and lower-cases ids', () => {
    const result = validateGrowthEventBody({
      event_name: 'first_open',
      install_id: INSTALL.toUpperCase(),
      platform: 'android',
    });
    expect(result).toMatchObject({ ok: true, value: { install_id: INSTALL, object_type: null, metadata: {} } });
  });

  it('lower-cases a room id and a delivery id', () => {
    const result = validateGrowthEventBody({
      ...valid,
      event_name: 'notification_opened',
      object_type: 'room',
      object_id: ROOM.toUpperCase(),
      delivery_id: ROOM.toUpperCase(),
    });
    expect(result).toMatchObject({ ok: true, value: { object_id: ROOM, delivery_id: ROOM } });
  });

  it('accepts household_joined with a list object and refuses it without one (G2, 093)', () => {
    const joined = { ...valid, event_name: 'household_joined', via: 'household', object_type: 'list', object_id: ROOM };
    expect(validateGrowthEventBody({ ...joined, metadata: { household_id: INSTALL } })).toMatchObject({
      ok: true,
      value: { event_name: 'household_joined', via: 'household', object_type: 'list', object_id: ROOM },
    });
    expect(validateGrowthEventBody({ ...joined, object_type: null, object_id: null }).ok).toBe(false);
  });

  it('drops via / src strings outside the contract rather than storing them', () => {
    expect(validateGrowthEventBody({ ...valid, via: 'spam', src: 'ads' })).toMatchObject({
      ok: true,
      value: { via: null, src: null },
    });
  });

  it.each<[string, unknown]>([
    ['a non-object', 'link_opened'],
    ['an array', [valid]],
    ['an unknown key', { ...valid, user_id: INSTALL }],
    ['a page event', { ...valid, event_name: 'preview_opened' }],
    ['an unknown event', { ...valid, event_name: 'install' }],
    ['a missing install id', { ...valid, install_id: undefined }],
    ['a non-uuid install id', { ...valid, install_id: 'abc' }],
    ['a web platform', { ...valid, platform: 'web' }],
    ['a non-string via', { ...valid, via: 1 }],
    ['a type without an id', { ...valid, object_id: null }],
    ['an id without a type', { ...valid, object_type: null }],
    ['a malformed title id', { ...valid, object_id: 'movie-603; drop' }],
    ['link_opened without an object', { ...valid, object_type: null, object_id: null }],
    ['share_initiated without an object', { ...valid, event_name: 'share_initiated', object_type: null, object_id: null }],
    ['a non-uuid delivery id', { ...valid, delivery_id: 'x' }],
    ['array metadata', { ...valid, metadata: [] }],
    ['metadata over 2 KB', { ...valid, metadata: { blob: 'é'.repeat(1100) } }],
  ])('rejects %s', (_label, body) => {
    expect(validateGrowthEventBody(body).ok).toBe(false);
  });

  it('allows metadata up to the limit', () => {
    const blob = 'x'.repeat(2048 - JSON.stringify({ blob: '' }).length);
    expect(validateGrowthEventBody({ ...valid, metadata: { blob } }).ok).toBe(true);
  });

  it('keeps the body cap above the metadata cap', () => {
    expect(GROWTH_EVENT_BODY_MAX_BYTES).toBeGreaterThan(2048 + 512);
  });
});

describe('rateLimitKey', () => {
  it('keys on the install id when the body carries a valid one', () => {
    expect(rateLimitKey({ install_id: INSTALL.toUpperCase() }, '1.2.3.4')).toBe(`install:${INSTALL}`);
  });

  it('falls back to the client IP', () => {
    expect(rateLimitKey({ install_id: 'nope' }, '1.2.3.4')).toBe('ip:1.2.3.4');
    expect(rateLimitKey(undefined, '2001:db8::1')).toBe('ip:2001:db8::1');
    expect(rateLimitKey(null, undefined)).toBe('ip:unknown');
  });
});

describe('previewEventRow', () => {
  it('a crawler fetch is preview_fetched with the agent and no identity', () => {
    expect(
      previewEventRow({
        uaClass: 'crawler',
        agent: 'whatsapp',
        platform: 'other',
        via: 'share',
        src: 'organic',
        object: { type: 'title', id: 'movie-550' },
      }),
    ).toEqual({
      event_name: 'preview_fetched',
      install_id: null,
      user_id: null,
      via: 'share',
      src: 'organic',
      object_type: 'title',
      object_id: 'movie-550',
      platform: 'other',
      ua_class: 'crawler',
      delivery_id: null,
      metadata: { agent: 'whatsapp' },
    });
  });

  it('a person opening it is preview_opened; junk attribution is dropped', () => {
    expect(
      previewEventRow({
        uaClass: 'human',
        agent: null,
        platform: 'ios',
        via: '<x>',
        src: undefined,
        object: { type: 'room', id: ROOM },
      }),
    ).toMatchObject({ event_name: 'preview_opened', ua_class: 'human', via: null, src: null, metadata: {} });
  });
});

describe('validateGrowthEventBody — metadata shape (sweep)', () => {
  const base = {
    event_name: 'first_open',
    install_id: '0f5a2c1e-9b3d-4c7a-8e21-6d4f0a9b2c11',
    platform: 'ios',
  };
  it('rejects nested values', () => {
    expect(validateGrowthEventBody({ ...base, metadata: { touch: { via: 'share' } } }).ok).toBe(false);
    expect(validateGrowthEventBody({ ...base, metadata: { list: [1, 2] } }).ok).toBe(false);
  });
  it('rejects more than sixteen keys', () => {
    const metadata = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i]));
    expect(validateGrowthEventBody({ ...base, metadata }).ok).toBe(false);
  });
  it('accepts flat primitives', () => {
    expect(validateGrowthEventBody({ ...base, metadata: { prior_install: false, touch: null, n: 1 } }).ok).toBe(true);
  });
});

describe('checkPushOpen (IN-GR-041)', () => {
  const USER = '6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
  const DELIVERY = '00000000-0000-4000-8000-000000000001';
  const opened = { event_name: 'notification_opened' as const, delivery_id: DELIVERY };
  const lookups: string[] = [];
  const owns = (answer: boolean) => async (id: string, uid: string) => {
    lookups.push(`${id}:${uid}`);
    return answer;
  };

  it('refuses notification_opened without a verified user (401), before any lookup', async () => {
    lookups.length = 0;
    expect(await checkPushOpen(opened, null, owns(true))).toEqual({
      ok: false,
      status: 401,
      error: 'notification_opened needs a signed-in user',
    });
    expect(lookups).toEqual([]);
  });

  it("refuses someone else's delivery, or a missing one (403)", async () => {
    expect(await checkPushOpen(opened, USER, owns(false))).toEqual({
      ok: false,
      status: 403,
      error: 'delivery does not belong to this user',
    });
  });

  it('accepts the owner, looking the delivery up by id and user', async () => {
    lookups.length = 0;
    expect(await checkPushOpen(opened, USER, owns(true))).toEqual({ ok: true });
    expect(lookups).toEqual([`${DELIVERY}:${USER}`]);
  });

  it('accepts a signed-in open with no delivery id (a bundle) without a lookup', async () => {
    lookups.length = 0;
    expect(await checkPushOpen({ ...opened, delivery_id: null }, USER, owns(false))).toEqual({ ok: true });
    expect(lookups).toEqual([]);
  });

  it('leaves every other event alone, anonymous or not', async () => {
    lookups.length = 0;
    for (const event_name of ['link_opened', 'first_open', 'share_initiated'] as const) {
      expect(await checkPushOpen({ event_name, delivery_id: null }, null, owns(false))).toEqual({ ok: true });
    }
    expect(lookups).toEqual([]);
  });
});
