import { describe, expect, it } from 'vitest';

import { stripMalformedQuery } from '../../deepLinkQueryGuard';
import { isPendingLinkFresh, parseInboundLink, PENDING_LINK_TTL_MS } from '../inboundLink';

const ROOM = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const HOME = { route: '/', object: null, via: null, src: null };

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
    expect(parseInboundLink(input)).toEqual({ ...expected, via: null, src: null });
  });

  it('maps tv and normalises leading zeros', () => {
    expect(parseInboundLink('https://videxstreaming.com/t/tv/095396-severance-2022').route).toBe(
      '/detail/tv-95396',
    );
  });

  it('captures via and src from the query', () => {
    expect(
      parseInboundLink('https://videxstreaming.com/t/movie/603-the-matrix-1999?via=share&src=push'),
    ).toEqual({ ...expected, via: 'share', src: 'push' });
    expect(parseInboundLink('videx://detail/movie-603?via=push')).toEqual({
      ...expected,
      via: 'push',
      src: null,
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

  it('maps the reserved list grammar', () => {
    expect(parseInboundLink('https://videxstreaming.com/list/abc123?via=household')).toEqual({
      route: '/list/abc123',
      object: { type: 'list', id: 'abc123' },
      via: 'household',
      src: null,
    });
  });
});

describe('parseInboundLink — pass-through and fallback', () => {
  it('passes videx://watchlist through unchanged', () => {
    expect(parseInboundLink('videx://watchlist')).toEqual({
      route: 'videx://watchlist',
      object: null,
      via: null,
      src: null,
    });
  });

  it('passes the password-reset bridge through unchanged, query included', () => {
    const reset = 'videx://reset-password?token_hash=abc123def&type=recovery';
    expect(parseInboundLink(reset).route).toBe(reset);
  });

  it.each([
    'https://videxstreaming.com/',
    'https://videxstreaming.com/privacy',
    'https://example.com/t/movie/603',
    'https://videxstreaming.com.evil.test/t/movie/603',
    'https://videxstreaming.com/reset-password',
    'videx://',
    'videx://profile/settings',
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
