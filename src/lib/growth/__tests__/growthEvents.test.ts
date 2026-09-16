import { describe, expect, it, vi } from 'vitest';

import {
  buildGrowthEventBody,
  GROWTH_EVENT_BODY_KEYS,
  isGrowthObject,
  postGrowthEvent,
  type GrowthEvent,
} from '../growthEvents';
import type { ViaChannel } from '../inboundLink';

const INSTALL = '0b7e6b0a-5f3c-4e2a-9d1b-6c8f7a2e4d10';
const ROOM = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const CTX = { installId: INSTALL, platform: 'android' as const };

describe('buildGrowthEventBody', () => {
  it('link_opened carries via, src and the object', () => {
    const body = buildGrowthEventBody(
      { name: 'link_opened', via: 'share', src: 'push', object: { type: 'title', id: 'movie-603' } },
      CTX,
    );
    expect(body).toEqual({
      event_name: 'link_opened',
      install_id: INSTALL,
      platform: 'android',
      via: 'share',
      src: 'push',
      object_type: 'title',
      object_id: 'movie-603',
      delivery_id: null,
      metadata: {},
    });
  });

  it('has exactly the keys the Worker accepts and never a user id', () => {
    const body = buildGrowthEventBody(
      { name: 'first_open', via: null, src: null, object: null, metadata: { touch: null, prior_install: false } },
      CTX,
    );
    expect(Object.keys(body).sort()).toEqual([...GROWTH_EVENT_BODY_KEYS].sort());
    expect(body).not.toHaveProperty('user_id');
  });

  it('first_open and signup_completed carry the first-touch metadata', () => {
    expect(
      buildGrowthEventBody(
        {
          name: 'first_open',
          via: 'card',
          src: null,
          object: { type: 'room', id: ROOM },
          metadata: { touch: 'install_referrer', prior_install: false },
        },
        CTX,
      ),
    ).toMatchObject({
      via: 'card',
      object_type: 'room',
      object_id: ROOM,
      metadata: { touch: 'install_referrer', prior_install: false },
    });
    expect(
      buildGrowthEventBody(
        { name: 'signup_completed', via: null, src: null, object: null, metadata: { touch: null } },
        { installId: INSTALL, platform: 'ios' },
      ),
    ).toMatchObject({ platform: 'ios', object_type: null, object_id: null, metadata: { touch: null } });
  });

  it('notification_opened carries the delivery id; others never do', () => {
    const event: GrowthEvent = {
      name: 'notification_opened',
      via: 'push',
      src: null,
      object: { type: 'title', id: 'tv-95396' },
      deliveryId: ROOM,
    };
    expect(buildGrowthEventBody(event, CTX).delivery_id).toBe(ROOM);
  });

  it('notification_opened carries its push type and src (S4)', () => {
    const body = buildGrowthEventBody(
      {
        name: 'notification_opened',
        via: 'push',
        src: 'push',
        object: null,
        deliveryId: null,
        metadata: { type: 'bundle' },
      },
      CTX,
    );
    expect(body).toMatchObject({ via: 'push', src: 'push', object_type: null, delivery_id: null });
    expect(body.metadata).toEqual({ type: 'bundle' });
  });

  it('drops a via outside the contract', () => {
    const body = buildGrowthEventBody(
      { name: 'link_opened', via: 'spam' as ViaChannel, src: null, object: { type: 'title', id: 'movie-1' } },
      CTX,
    );
    expect(body.via).toBeNull();
  });
});

describe('postGrowthEvent', () => {
  const event: GrowthEvent = {
    name: 'link_opened',
    via: 'share',
    src: null,
    object: { type: 'title', id: 'movie-603' },
  };

  it('POSTs the body to /v1/growth/events with the Bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await postGrowthEvent(event, { ...CTX, baseUrl: 'https://api.example/', accessToken: 'jwt', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example/v1/growth/events');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer jwt' });
    expect(JSON.parse(init.body as string)).toEqual(buildGrowthEventBody(event, CTX));
  });

  it('sends no Authorization header without a session', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await postGrowthEvent(event, { ...CTX, baseUrl: 'https://api.example', accessToken: null, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('sends nothing when the API URL is not configured', async () => {
    const fetchImpl = vi.fn();
    await postGrowthEvent(event, { ...CTX, baseUrl: undefined, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never rejects, whether fetch rejects or throws', async () => {
    const rejecting = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(postGrowthEvent(event, { ...CTX, baseUrl: 'https://api.example', fetchImpl: rejecting })).resolves.toBeUndefined();
    const throwing = vi.fn(() => {
      throw new Error('sync');
    }) as unknown as typeof fetch;
    await expect(postGrowthEvent(event, { ...CTX, baseUrl: 'https://api.example', fetchImpl: throwing })).resolves.toBeUndefined();
  });
});

describe('isGrowthObject', () => {
  it.each([
    ['title', 'movie-603', true],
    ['title', 'tv-95396', true],
    ['title', 'movie-0603', false],
    ['title', 'movie-603-x', false],
    ['room', ROOM, true],
    ['room', 'abc', false],
    ['list', 'my_list-1', true],
    ['list', 'a/b', false],
    ['podcast', 'x', false],
    ['title', 603, false],
  ])('%s %s → %s', (type, id, ok) => {
    expect(isGrowthObject(type, id)).toBe(ok);
  });
});
