import { describe, expect, it } from 'vitest';

import { inboundHref, parseInboundLink } from '../inboundLink';
import { buildPlayReferrer, parseInstallReferrer } from '../installReferrer';

const ROOM = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const LIST = '8c1e3f2b-4e6f-4a9d-8b7a-5a6b1c2d3e4f';
const TOKEN = 'd3e4f5a6-1c2d-4b7a-9a4d-3f2b8c1e4e6f';

describe('buildPlayReferrer', () => {
  it('carries via, src and the title', () => {
    expect(buildPlayReferrer('share', 'push', { type: 'title', id: 'movie-603' })).toBe(
      'via=share&src=push&t=movie-603',
    );
  });

  it('carries a room, lower-cased', () => {
    expect(buildPlayReferrer('share', null, { type: 'room', id: ROOM.toUpperCase() })).toBe(`via=share&r=${ROOM}`);
  });

  it('carries the object alone when there is no attribution', () => {
    expect(buildPlayReferrer(undefined, undefined, { type: 'title', id: 'tv-95396' })).toBe('t=tv-95396');
  });

  it('drops values outside the contract and objects it cannot name', () => {
    expect(buildPlayReferrer('"><script>', 'organic', { type: 'title', id: 'movie-603&x=1' })).toBe('src=organic');
    expect(buildPlayReferrer(null, null, { type: 'room', id: 'nope' })).toBe('');
    expect(buildPlayReferrer('share', null, { type: 'list', id: 'abc' })).toBe('via=share');
    expect(buildPlayReferrer('share', null, { type: 'list', id: 'abc' }, TOKEN)).toBe('via=share');
    expect(buildPlayReferrer(null, null, null)).toBe('');
  });
});

describe('parseInstallReferrer', () => {
  it('round-trips what the page builds into the same link the app would parse', () => {
    const referrer = buildPlayReferrer('share', 'push', { type: 'title', id: 'movie-603' });
    expect(parseInstallReferrer(referrer)).toEqual(
      parseInboundLink('https://videxstreaming.com/t/movie/603-the-matrix-1999?via=share&src=push'),
    );
  });

  it('reads the string Play hands back after decoding the page URL', () => {
    const playHref = `referrer=${encodeURIComponent(buildPlayReferrer('card', null, { type: 'room', id: ROOM }))}`;
    const decoded = decodeURIComponent(playHref.slice('referrer='.length));
    expect(parseInstallReferrer(decoded)).toEqual({
      route: `/room/${ROOM}`,
      object: { type: 'room', id: ROOM },
      via: 'card',
      src: null,
      invite: null,
    });
  });

  it('keeps attribution without an object', () => {
    expect(parseInstallReferrer('via=seo')).toEqual({ route: '/', object: null, via: 'seo', src: null, invite: null });
  });

  it.each([null, undefined, '', '   ', 'utm_source=google-play&utm_medium=organic', 'via=spam&t=movie-abc'])(
    'returns null for %j',
    (raw) => {
      expect(parseInstallReferrer(raw)).toBeNull();
    },
  );

  it('uses the URL query rules: first value wins, undecodable pairs skipped, leading ? ok', () => {
    expect(parseInstallReferrer('?via=share&via=push&t=movie-603')?.via).toBe('share');
    expect(parseInstallReferrer('via=%E0%A4&t=movie-603')).toEqual({
      route: '/detail/movie-603',
      object: { type: 'title', id: 'movie-603' },
      via: null,
      src: null,
      invite: null,
    });
  });

  it('normalises the title id and refuses anything but a bare content id', () => {
    expect(parseInstallReferrer('t=tv-095396')?.object).toEqual({ type: 'title', id: 'tv-95396' });
    expect(parseInstallReferrer('via=share&t=movie-603/x')?.object).toBeNull();
    expect(parseInstallReferrer('via=share&t=movie-603%3Fvia%3Dpush')?.object).toBeNull();
    expect(parseInstallReferrer('via=share&t=movie-0')?.object).toBeNull();
  });

  // IN-GR-045: the check runs on the parsed fields instead of a videx:// round
  // trip; these pin every branch to what parseInboundLink accepts.
  it.each([
    ['movie-603', 'movie-603'],
    ['tv-1', 'tv-1'],
    ['movie-9999999999', 'movie-9999999999'],
    ['movie-000000000000603', 'movie-603'],
  ])('accepts title %s as %s, the same object the deep link parses to', (raw, id) => {
    expect(parseInstallReferrer(`t=${raw}`)?.object).toEqual({ type: 'title', id });
    expect(parseInstallReferrer(`t=${raw}`)?.object).toEqual(parseInboundLink(`videx://detail/${raw}`).object);
    expect(parseInstallReferrer(`t=${raw}`)?.route).toBe(`/detail/${id}`);
  });

  it.each([
    'movie-10000000000', // 11 digits
    'movie-0000000000000603', // 16 digits: over the bare shape
    'movie-000', // zero
    'MOVIE-603', // type is case-sensitive
    'episode-603',
    'movie-',
    'movie-60a',
    ' movie-603',
  ])('refuses title %j', (raw) => {
    expect(parseInstallReferrer(`via=share&t=${encodeURIComponent(raw)}`)?.object).toBeNull();
    expect(buildPlayReferrer(null, null, { type: 'title', id: raw })).toBe('');
  });

  it('a title key wins over a room key, even when the title is refused', () => {
    expect(parseInstallReferrer(`t=movie-603&r=${ROOM}`)?.object).toEqual({ type: 'title', id: 'movie-603' });
    expect(parseInstallReferrer(`via=share&t=movie-0&r=${ROOM}`)?.object).toBeNull();
  });

  it('routes a room to its screen', () => {
    expect(parseInstallReferrer(`r=${ROOM}`)?.route).toBe(`/room/${ROOM}`);
  });

  it('lower-cases a room id and refuses a non-uuid', () => {
    expect(parseInstallReferrer(`r=${ROOM.toUpperCase()}`)?.object).toEqual({ type: 'room', id: ROOM });
    expect(parseInstallReferrer('via=share&r=abc')?.object).toBeNull();
  });

  it('ignores i= beside a room key', () => {
    expect(parseInstallReferrer(`i=${TOKEN}&r=${ROOM}`)?.invite).toBeNull();
  });
});

describe('shared lists: l= and i= (G2 H3)', () => {
  const list = { type: 'list' as const, id: LIST };

  it('builds l= and i= for a list with an invite, lower-cased', () => {
    expect(buildPlayReferrer('household', null, { type: 'list', id: LIST.toUpperCase() }, TOKEN.toUpperCase())).toBe(
      `via=household&l=${LIST}&i=${TOKEN}`,
    );
    expect(buildPlayReferrer('household', 'push', list)).toBe(`via=household&src=push&l=${LIST}`);
    expect(buildPlayReferrer(null, null, list, 'not-a-token')).toBe(`l=${LIST}`);
  });

  it('never carries an invite beside a title or room', () => {
    expect(buildPlayReferrer('share', null, { type: 'title', id: 'movie-603' }, TOKEN)).toBe('via=share&t=movie-603');
    expect(buildPlayReferrer('share', null, { type: 'room', id: ROOM }, TOKEN)).toBe(`via=share&r=${ROOM}`);
  });

  it('parses to the list route with its invite', () => {
    expect(parseInstallReferrer(`via=household&l=${LIST}&i=${TOKEN}`)).toEqual({
      route: `/list/${LIST}?invite=${TOKEN}`,
      object: list,
      via: 'household',
      src: null,
      invite: TOKEN,
    });
    expect(parseInstallReferrer(`l=${LIST}`)).toEqual({ route: `/list/${LIST}`, object: list, via: null, src: null, invite: null });
  });

  // Every combination of via / src / invite round-trips into what the app
  // would route to for the same https link (+native-intent's inboundHref).
  const vias = [null, 'household', 'share'] as const;
  const srcs = [null, 'push', 'organic'] as const;
  const invites = [null, TOKEN] as const;
  const combos = vias.flatMap((via) => srcs.flatMap((src) => invites.map((invite) => [via, src, invite] as const)));
  it.each(combos)('round-trips via=%s src=%s invite=%s', (via, src, invite) => {
    const referrer = buildPlayReferrer(via, src, list, invite);
    const query = [invite && `invite=${invite}`, via && `via=${via}`, src && `src=${src}`].filter(Boolean).join('&');
    const fromLink = parseInboundLink(`https://videxstreaming.com/list/${LIST}${query ? `?${query}` : ''}`);
    expect(parseInstallReferrer(referrer)).toEqual({ ...fromLink, route: inboundHref(fromLink) });
  });

  it('round-trips title and room with every via / src pair (unchanged by lists)', () => {
    for (const via of vias) {
      for (const src of srcs) {
        const t = parseInstallReferrer(buildPlayReferrer(via, src, { type: 'title', id: 'movie-603' }));
        expect(t).toEqual(parseInboundLink(`videx://detail/movie-603?via=${via ?? ''}&src=${src ?? ''}`));
        const r = parseInstallReferrer(buildPlayReferrer(via, src, { type: 'room', id: ROOM }));
        expect(r).toEqual(parseInboundLink(`videx://room/${ROOM}?via=${via ?? ''}&src=${src ?? ''}`));
      }
    }
  });

  it('a list key wins over title and room keys, even when the list id is refused', () => {
    expect(parseInstallReferrer(`t=movie-603&r=${ROOM}&l=${LIST}&i=${TOKEN}`)?.route).toBe(`/list/${LIST}?invite=${TOKEN}`);
    expect(parseInstallReferrer(`via=share&l=abc&t=movie-603`)?.object).toBeNull();
    expect(parseInstallReferrer(`via=share&l=abc&t=movie-603`)?.route).toBe('/');
  });

  it('reads i= only beside a valid l=, uuid only', () => {
    expect(parseInstallReferrer(`t=movie-603&i=${TOKEN}`)?.invite).toBeNull();
    expect(parseInstallReferrer(`l=${LIST}&i=abc`)?.invite).toBeNull();
    expect(parseInstallReferrer(`l=${LIST}&i=abc`)?.route).toBe(`/list/${LIST}`);
    expect(parseInstallReferrer(`i=${TOKEN}`)).toBeNull();
  });

  it('survives the Play URL encoding round trip', () => {
    const encoded = encodeURIComponent(buildPlayReferrer('household', null, list, TOKEN));
    expect(parseInstallReferrer(decodeURIComponent(encoded))?.route).toBe(`/list/${LIST}?invite=${TOKEN}`);
  });
});
