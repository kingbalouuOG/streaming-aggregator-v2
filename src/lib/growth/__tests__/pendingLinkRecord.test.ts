import { describe, expect, it } from 'vitest';

import { parseInboundLink, PENDING_LINK_TTL_MS } from '../inboundLink';
import { parseInstallReferrer } from '../installReferrer';
import {
  buildPendingLink,
  clearsOnResume,
  parsePendingLink,
  PENDING_LINK_VERSION,
  pendingLinkMatches,
  routePath,
} from '../pendingLinkRecord';

const LIST = '8c1e3f2b-4e6f-4a9d-8b7a-5a6b1c2d3e4f';
const TOKEN = 'd3e4f5a6-1c2d-4b7a-9a4d-3f2b8c1e4e6f';
const ROOM = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const NOW = 1_800_000_000_000;

describe('buildPendingLink', () => {
  it('stores a list link with an invite deliberately, as a join with the full router path', () => {
    const record = buildPendingLink(
      parseInboundLink(`https://videxstreaming.com/list/${LIST}?invite=${TOKEN}&via=household`),
      NOW,
    );
    expect(record).toEqual({
      version: PENDING_LINK_VERSION,
      route: `/list/${LIST}?invite=${TOKEN}`,
      object: { type: 'list', id: LIST },
      via: 'household',
      src: null,
      intent: 'join',
      invite: TOKEN,
      seenAt: NOW,
    });
  });

  it('stores a list link without an invite as an open', () => {
    const record = buildPendingLink(parseInboundLink(`videx://list/${LIST}`), NOW);
    expect(record).toMatchObject({ route: `/list/${LIST}`, intent: 'open', invite: null });
  });

  it('stores the install referrer list link the same way (its route already has the query)', () => {
    const fromReferrer = parseInstallReferrer(`via=household&l=${LIST}&i=${TOKEN}`)!;
    const fromLink = parseInboundLink(`https://videxstreaming.com/list/${LIST}?invite=${TOKEN}&via=household`);
    expect(buildPendingLink(fromReferrer, NOW)).toEqual(buildPendingLink(fromLink, NOW));
  });

  it('stores titles and rooms as opens with no invite, whatever the query carried', () => {
    expect(buildPendingLink(parseInboundLink(`/t/movie/603?invite=${TOKEN}`), NOW)).toMatchObject({
      route: '/detail/movie-603',
      intent: 'open',
      invite: null,
    });
    expect(buildPendingLink(parseInboundLink(`videx://room/${ROOM}?via=share`), NOW)).toMatchObject({
      route: `/room/${ROOM}`,
      via: 'share',
      intent: 'open',
      invite: null,
    });
  });

  it('accepts a writer that omits invite (the detail sign-in prompt)', () => {
    const record = buildPendingLink(
      { route: '/detail/movie-603', object: { type: 'title', id: 'movie-603' }, via: null, src: null },
      NOW,
    );
    expect(record?.invite).toBeNull();
  });

  it('ignores links that name no object', () => {
    expect(buildPendingLink(parseInboundLink('videx://watchlist'), NOW)).toBeNull();
    expect(buildPendingLink(parseInboundLink('https://videxstreaming.com/list/abc'), NOW)).toBeNull();
  });
});

describe('parsePendingLink', () => {
  const stored = JSON.stringify(buildPendingLink(parseInboundLink(`videx://list/${LIST}?invite=${TOKEN}`), NOW));

  it('reads a fresh v2 record', () => {
    expect(parsePendingLink(stored, NOW + 1000)).toEqual({ record: JSON.parse(stored), discard: false });
  });

  it('nothing stored is nothing to discard', () => {
    expect(parsePendingLink(null, NOW)).toEqual({ record: null, discard: false });
    expect(parsePendingLink('', NOW)).toEqual({ record: null, discard: false });
  });

  it('discards a version-1 record', () => {
    const v1 = JSON.stringify({
      version: 1,
      route: '/detail/movie-603',
      object: { type: 'title', id: 'movie-603' },
      via: null,
      src: null,
      seenAt: NOW,
    });
    expect(parsePendingLink(v1, NOW)).toEqual({ record: null, discard: true });
  });

  it('discards expired, corrupt and malformed records', () => {
    expect(parsePendingLink(stored, NOW + PENDING_LINK_TTL_MS)).toEqual({ record: null, discard: true });
    expect(parsePendingLink('{not json', NOW)).toEqual({ record: null, discard: true });
    expect(parsePendingLink('null', NOW)).toEqual({ record: null, discard: true });
    const bad = { ...JSON.parse(stored), intent: 'delete' };
    expect(parsePendingLink(JSON.stringify(bad), NOW)).toEqual({ record: null, discard: true });
    const noObject = { ...JSON.parse(stored), object: null };
    expect(parsePendingLink(JSON.stringify(noObject), NOW)).toEqual({ record: null, discard: true });
  });
});

describe('clearing rules', () => {
  const list = buildPendingLink(parseInboundLink(`videx://list/${LIST}?invite=${TOKEN}`), NOW)!;
  const title = buildPendingLink(parseInboundLink('videx://detail/movie-603'), NOW)!;
  const room = buildPendingLink(parseInboundLink(`videx://room/${ROOM}`), NOW)!;

  it('a resume clears titles and rooms but never a list (the list screen clears it after the join)', () => {
    expect(clearsOnResume(title)).toBe(true);
    expect(clearsOnResume(room)).toBe(true);
    expect(clearsOnResume(list)).toBe(false);
  });

  it('matches the screen by path, ignoring the invite query', () => {
    expect(pendingLinkMatches(list, `/list/${LIST}`)).toBe(true);
    expect(pendingLinkMatches(list, `/list/${LIST}?invite=${TOKEN}`)).toBe(true);
    expect(pendingLinkMatches(list, `/list/${ROOM}`)).toBe(false);
    expect(pendingLinkMatches(title, '/detail/movie-603')).toBe(true);
    expect(pendingLinkMatches(title, '/detail/movie-604')).toBe(false);
    expect(pendingLinkMatches(null, '/detail/movie-603')).toBe(false);
  });

  it('routePath drops the query only', () => {
    expect(routePath(`/list/${LIST}?invite=${TOKEN}`)).toBe(`/list/${LIST}`);
    expect(routePath('/detail/movie-603')).toBe('/detail/movie-603');
  });
});
