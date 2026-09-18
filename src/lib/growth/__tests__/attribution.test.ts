import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  attributionOf,
  claimOnce,
  FIRST_TOUCH_KEY,
  firstTouchFromLink,
  INSTALL_ID_KEY,
  readFirstTouch,
  recordFirstTouch,
  resolveInstallId,
  type FirstTouch,
  type KeyValueStore,
} from '../attribution';
import { parseInboundLink } from '../inboundLink';
import { generateUuid, isUuid } from '../uuid';

const ROOM = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

function memoryStore(seed: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getString: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    getAllKeys: () => [...data.keys()],
  };
}

describe('generateUuid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns distinct v4 uuids', () => {
    const a = generateUuid();
    expect(isUuid(a)).toBe(true);
    expect(a).not.toBe(generateUuid());
  });

  it('falls back to a v4 shape where crypto.randomUUID is missing (Hermes)', () => {
    vi.stubGlobal('crypto', undefined);
    const id = generateUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('resolveInstallId', () => {
  it('mints once and returns the same id afterwards', () => {
    const store = memoryStore();
    const first = resolveInstallId(store);
    expect(first.minted).toBe(true);
    expect(isUuid(first.installId)).toBe(true);
    expect(store.getString(INSTALL_ID_KEY)).toBe(first.installId);

    const second = resolveInstallId(store);
    expect(second).toEqual({ installId: first.installId, minted: false, priorInstall: false });
  });

  it('stores the id lower-cased', () => {
    const store = memoryStore();
    const { installId } = resolveInstallId(store, () => 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE');
    expect(installId).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });

  it('replaces a corrupt stored value', () => {
    const store = memoryStore({ [INSTALL_ID_KEY]: 'not-a-uuid' });
    const { minted, installId } = resolveInstallId(store);
    expect(minted).toBe(true);
    expect(isUuid(installId)).toBe(true);
  });

  it('flags an update from a pre-attribution build (a session already stored) and remembers it', () => {
    const store = memoryStore({ 'sb-fmusugdcnnwiuzkbjquo-auth-token': '{}' });
    expect(resolveInstallId(store).priorInstall).toBe(true);
    expect(resolveInstallId(store).priorInstall).toBe(true);
  });

  it('does not flag a fresh install', () => {
    const store = memoryStore({ fb_prompt_shown: '1' });
    expect(resolveInstallId(store).priorInstall).toBe(false);
  });
});

describe('first touch', () => {
  const link = parseInboundLink('https://videxstreaming.com/t/movie/603-the-matrix-1999?via=share&src=push');

  it('builds a touch from an object link', () => {
    expect(firstTouchFromLink(link, 'link', 1000)).toEqual({
      version: 1,
      source: 'link',
      via: 'share',
      src: 'push',
      objectType: 'title',
      objectId: 'movie-603',
      seenAt: 1000,
    });
  });

  it('keeps attribution without an object, ignores a link with neither', () => {
    expect(firstTouchFromLink({ route: '/', object: null, via: 'seo', src: null, invite: null }, 'install_referrer', 1)).toMatchObject({
      via: 'seo',
      objectType: null,
      objectId: null,
    });
    expect(firstTouchFromLink(parseInboundLink('videx://watchlist'), 'link', 1)).toBeNull();
  });

  it('is written once and never overwritten', () => {
    const store = memoryStore();
    const first = firstTouchFromLink(link, 'link', 1000);
    const later = firstTouchFromLink(parseInboundLink(`videx://room/${ROOM}?via=card`), 'install_referrer', 2000);
    expect(recordFirstTouch(store, first)).toBe(true);
    expect(recordFirstTouch(store, later)).toBe(false);
    expect(readFirstTouch(store)).toEqual(first);
  });

  it('ignores null and replaces a corrupt record', () => {
    const store = memoryStore({ [FIRST_TOUCH_KEY]: '{oops' });
    expect(recordFirstTouch(store, null)).toBe(false);
    expect(readFirstTouch(store)).toBeNull();
    expect(recordFirstTouch(store, firstTouchFromLink(link, 'link', 5))).toBe(true);
    expect(readFirstTouch(store)?.seenAt).toBe(5);
  });

  it('drops stored values outside the contract', () => {
    const tampered: Record<string, unknown> = {
      version: 1,
      source: 'link',
      via: 'spam',
      src: 'organic',
      objectType: 'podcast',
      objectId: 'x',
      seenAt: 1,
    };
    const store = memoryStore({ [FIRST_TOUCH_KEY]: JSON.stringify(tampered) });
    expect(readFirstTouch(store)).toEqual({
      version: 1,
      source: 'link',
      via: null,
      src: 'organic',
      objectType: null,
      objectId: null,
      seenAt: 1,
    });
  });

  it('rejects another version or source', () => {
    const touch = firstTouchFromLink(link, 'link', 1) as FirstTouch;
    expect(readFirstTouch(memoryStore({ [FIRST_TOUCH_KEY]: JSON.stringify({ ...touch, version: 2 }) }))).toBeNull();
    expect(readFirstTouch(memoryStore({ [FIRST_TOUCH_KEY]: JSON.stringify({ ...touch, source: 'ad' }) }))).toBeNull();
  });

  it('attributionOf maps a touch to event fields', () => {
    expect(attributionOf(firstTouchFromLink(link, 'link', 1))).toEqual({
      via: 'share',
      src: 'push',
      object: { type: 'title', id: 'movie-603' },
    });
    expect(attributionOf(null)).toEqual({ via: null, src: null, object: null });
  });
});

describe('claimOnce', () => {
  it('is true once per key', () => {
    const store = memoryStore();
    expect(claimOnce(store, 'first_open_sent')).toBe(true);
    expect(claimOnce(store, 'first_open_sent')).toBe(false);
    expect(claimOnce(store, 'other')).toBe(true);
  });
});
