import { describe, expect, it } from 'vitest';

import { parseInboundLink } from '../inboundLink';
import { buildPlayReferrer, parseInstallReferrer } from '../installReferrer';

const ROOM = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

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
    });
  });

  it('keeps attribution without an object', () => {
    expect(parseInstallReferrer('via=seo')).toEqual({ route: '/', object: null, via: 'seo', src: null });
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
    });
  });

  it('normalises the title id and refuses anything but a bare content id', () => {
    expect(parseInstallReferrer('t=tv-095396')?.object).toEqual({ type: 'title', id: 'tv-95396' });
    expect(parseInstallReferrer('via=share&t=movie-603/x')?.object).toBeNull();
    expect(parseInstallReferrer('via=share&t=movie-603%3Fvia%3Dpush')?.object).toBeNull();
    expect(parseInstallReferrer('via=share&t=movie-0')?.object).toBeNull();
  });

  it('lower-cases a room id and refuses a non-uuid', () => {
    expect(parseInstallReferrer(`r=${ROOM.toUpperCase()}`)?.object).toEqual({ type: 'room', id: ROOM });
    expect(parseInstallReferrer('via=share&r=abc')?.object).toBeNull();
  });
});
