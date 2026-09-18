import { describe, expect, it } from 'vitest';

import { stripMalformedQuery } from '../../deepLinkQueryGuard';
import {
  inboundHref,
  isPendingLinkFresh,
  normaliseInvite,
  parseInboundLink,
  PENDING_LINK_TTL_MS,
} from '../inboundLink';

const ROOM = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const LIST = '8c1e3f2b-4e6f-4a9d-8b7a-5a6b1c2d3e4f';
const TOKEN = 'd3e4f5a6-1c2d-4b7a-9a4d-3f2b8c1e4e6f';
const HOME = { route: '/', object: null, via: null, src: null, invite: null };

describe('parseInboundLink — titles', () => {
  const expected = { route: '/detail/movie-603', object: { type: 'title', id: 'movie-603' } };

  it.each([
    'https://videxstreaming.com/t/movie/603',
    'https://videxstreaming.com/t/movie/603-the-matrix-1999',
    'https://www.videxstreaming.com/t/movie/603-the-matrix-1999/',
    'https://videxstreaming.com/t/movie/603-stale-slug#top',
    '/t/movie/603-the-matrix-1999',
    'videx://detail/movie-603',
    'videx:///detail/movie-603',
  ])('%s', (input) => {
    expect(parseInboundLink(input)).toEqual({ ...expected, via: null, src: null, invite: null });
  });

  it('maps tv and normalises leading zeros', () => {
    expect(parseInboundLink('https://videxstreaming.com/t/tv/095396-severance-2022').route).toBe(
      '/detail/tv-95396',
    );
  });

  it('captures via and src from the query', () => {
    expect(
      parseInboundLink('https://videxstreaming.com/t/movie/603-the-matrix-1999?via=share&src=push'),
    ).toEqual({ ...expected, via: 'share', src: 'push', invite: null });
    expect(parseInboundLink('videx://detail/movie-603?via=push')).toEqual({
      ...expected,
      via: 'push',
      src: null,
      invite: null,
    });
  });

  it.each(['share', 'push', 'seo', 'card', 'household'])('accepts via=%s', (via) => {
    expect(parseInboundLink(`/t/movie/603?via=${via}`).via).toBe(via);
  });

  it('drops values outside the contract', () => {
    const link = parseInboundLink('/t/movie/603?via=twitter&src=elsewhere&utm_source=x');
    expect(link.route).toBe('/detail/movie-603');
    expect(link.via).toBeNull();
    expect(link.src).toBeNull();
  });

  it('keeps the first value when a key repeats', () => {
    expect(parseInboundLink('/t/movie/603?via=share&via=push').via).toBe('share');
  });

  it('rejects zero ids and unknown types', () => {
    expect(parseInboundLink('/t/movie/0')).toEqual(HOME);
    expect(parseInboundLink('/t/person/603')).toEqual(HOME);
  });
});

describe('parseInboundLink — rooms and lists', () => {
  it.each([
    `https://videxstreaming.com/room/${ROOM}`,
    `https://videxstreaming.com/room/${ROOM.toUpperCase()}?via=share`,
    `videx://room/${ROOM}`,
  ])('%s', (input) => {
    const link = parseInboundLink(input);
    expect(link.route).toBe(`/room/${ROOM}`);
    expect(link.object).toEqual({ type: 'room', id: ROOM });
  });

  it('rejects a non-uuid room id', () => {
    expect(parseInboundLink('https://videxstreaming.com/room/123')).toEqual(HOME);
    expect(parseInboundLink('https://videxstreaming.com/room/<script>')).toEqual(HOME);
  });

});

describe('parseInboundLink — shared lists (G2 H3)', () => {
  const list = { route: `/list/${LIST}`, object: { type: 'list', id: LIST } };

  it.each([
    [`https://videxstreaming.com/list/${LIST}?invite=${TOKEN}&via=household`, 'household'],
    [`https://www.videxstreaming.com/list/${LIST.toUpperCase()}/?via=household&invite=${TOKEN.toUpperCase()}`, 'household'],
    [`videx://list/${LIST}?invite=${TOKEN}`, null],
    [`videx:///list/${LIST}?invite=${TOKEN}&via=household`, 'household'],
    [`/list/${LIST}?invite=${TOKEN}`, null],
  ])('%s routes to the list screen with the invite', (input, via) => {
    expect(parseInboundLink(input)).toEqual({ ...list, via, src: null, invite: TOKEN });
  });

  it.each([
    `https://videxstreaming.com/list/${LIST}`,
    `videx://list/${LIST}`,
    `https://videxstreaming.com/list/${LIST}?invite=`,
    `https://videxstreaming.com/list/${LIST}?invite=not-a-token`,
    `https://videxstreaming.com/list/${LIST}?invite=${TOKEN}x`,
    `videx://list/${LIST}?invite=${'%FF'}`,
  ])('%s has no invite', (input) => {
    const link = parseInboundLink(input);
    expect(link.route).toBe(`/list/${LIST}`);
    expect(link.object).toEqual({ type: 'list', id: LIST });
    expect(link.invite).toBeNull();
  });

  it('keeps the first invite when the key repeats', () => {
    const other = '11111111-2222-4333-8444-555555555555';
    expect(parseInboundLink(`/list/${LIST}?invite=${TOKEN}&invite=${other}`).invite).toBe(TOKEN);
  });

  it.each([
    'https://videxstreaming.com/list/abc123?via=household',
    `https://videxstreaming.com/list/abc123?invite=${TOKEN}`,
    'videx://list/<script>',
    `videx://list/${LIST}/items`,
  ])('%s: a non-uuid list id stays home with no object', (input) => {
    expect(parseInboundLink(input)).toEqual({ ...HOME, via: parseInboundLink(input).via });
  });

  it('ignores an invite on a title or room link (decoys)', () => {
    expect(parseInboundLink(`https://videxstreaming.com/t/movie/603?invite=${TOKEN}`).invite).toBeNull();
    expect(parseInboundLink(`videx://detail/movie-603?invite=${TOKEN}`).invite).toBeNull();
    expect(parseInboundLink(`https://videxstreaming.com/room/${ROOM}?invite=${TOKEN}`).invite).toBeNull();
    expect(parseInboundLink(`https://videxstreaming.com/?invite=${TOKEN}`)).toEqual(HOME);
    expect(parseInboundLink(`videx://watchlist?invite=${TOKEN}`).invite).toBeNull();
  });
});

describe('inboundHref and normaliseInvite', () => {
  it('adds ?invite= to a list route only', () => {
    expect(inboundHref(parseInboundLink(`videx://list/${LIST}?invite=${TOKEN}`))).toBe(`/list/${LIST}?invite=${TOKEN}`);
    expect(inboundHref(parseInboundLink(`videx://list/${LIST}`))).toBe(`/list/${LIST}`);
    expect(inboundHref(parseInboundLink(`/t/movie/603?invite=${TOKEN}`))).toBe('/detail/movie-603');
    expect(inboundHref(parseInboundLink('videx://watchlist'))).toBe('videx://watchlist');
  });

  it('is idempotent on a route that already carries the invite (the install referrer)', () => {
    const link = { route: `/list/${LIST}?invite=${TOKEN}`, object: { type: 'list' as const, id: LIST }, invite: TOKEN };
    expect(inboundHref(link)).toBe(`/list/${LIST}?invite=${TOKEN}`);
  });

  it('accepts uuid tokens only, lowercased', () => {
    expect(normaliseInvite(TOKEN.toUpperCase())).toBe(TOKEN);
    expect(normaliseInvite('abc')).toBeNull();
    expect(normaliseInvite('')).toBeNull();
    expect(normaliseInvite(null)).toBeNull();
    expect(normaliseInvite(undefined)).toBeNull();
  });
});

describe('parseInboundLink — pass-through and fallback', () => {
  it('passes videx://watchlist through unchanged', () => {
    expect(parseInboundLink('videx://watchlist')).toEqual({
      route: 'videx://watchlist',
      object: null,
      via: null,
      src: null,
      invite: null,
    });
  });

  it('passes the password-reset bridge through unchanged, query included', () => {
    const reset = 'videx://reset-password?token_hash=abc123def&type=recovery';
    expect(parseInboundLink(reset).route).toBe(reset);
  });

  it('passes the sign-up confirmation bridge through unchanged, query included', () => {
    const confirm = 'videx://confirm-email?token_hash=abc123def&type=email';
    expect(parseInboundLink(confirm)).toEqual({ route: confirm, object: null, via: null, src: null, invite: null });
  });

  it.each([
    'https://videxstreaming.com/',
    'https://videxstreaming.com/privacy',
    'https://example.com/t/movie/603',
    'https://videxstreaming.com.evil.test/t/movie/603',
    'https://videxstreaming.com/reset-password',
    'https://videxstreaming.com/confirm-email',
    'videx://',
    'videx://t/movie/abc',
    'mailto:hi@videxstreaming.com',
    '',
    'not a url',
  ])('%s -> home', (input) => {
    expect(parseInboundLink(input)).toEqual(HOME);
  });
});

describe('guard first, then mapper (as +native-intent.tsx runs them)', () => {
  it('a malformed query is stripped and the route survives', () => {
    const hostile = `https://videxstreaming.com/t/movie/603?via=share&a=${'%FF'.repeat(200)}`;
    const link = parseInboundLink(stripMalformedQuery(hostile));
    expect(link.route).toBe('/detail/movie-603');
    expect(link.via).toBeNull();
  });

  it('a well-formed query passes intact', () => {
    const link = parseInboundLink(stripMalformedQuery('/room/' + ROOM + '?via=share&src=organic'));
    expect(link).toMatchObject({ route: `/room/${ROOM}`, via: 'share', src: 'organic' });
  });
});

describe('isPendingLinkFresh', () => {
  const now = 1_800_000_000_000;
  it('is fresh inside 24h and stale after', () => {
    expect(isPendingLinkFresh(now, now)).toBe(true);
    expect(isPendingLinkFresh(now - PENDING_LINK_TTL_MS + 1, now)).toBe(true);
    expect(isPendingLinkFresh(now - PENDING_LINK_TTL_MS, now)).toBe(false);
  });
  it('rejects future and non-finite timestamps', () => {
    expect(isPendingLinkFresh(now + 1000, now)).toBe(false);
    expect(isPendingLinkFresh(Number.NaN, now)).toBe(false);
  });
});

describe('parseInboundLink — sweep additions', () => {
  it('passes unknown app-scheme paths through unchanged', () => {
    expect(parseInboundLink('videx://profile/settings')).toEqual({
      route: 'videx://profile/settings',
      object: null,
      via: null,
      src: null,
      invite: null,
    });
  });

  it('sends unknown https paths home', () => {
    expect(parseInboundLink('https://videxstreaming.com/about')).toEqual(HOME);
  });

  it('rejects a title id longer than ten digits', () => {
    expect(parseInboundLink('https://videxstreaming.com/t/movie/12345678901').object).toBeNull();
    expect(parseInboundLink('videx://detail/tv-00012').object).toEqual({ type: 'title', id: 'tv-12' });
  });

  it('accepts a host with an explicit port', () => {
    expect(parseInboundLink('https://videxstreaming.com:443/t/movie/550').object).toEqual({ type: 'title', id: 'movie-550' });
  });
});
