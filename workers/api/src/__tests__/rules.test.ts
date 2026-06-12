/**
 * PLAT-2 — unit tests for the Worker's pure routing/caching rules.
 * Runs under the root vitest rig (rules.ts has no Workers/Hono imports).
 */

import { describe, it, expect } from 'vitest';
import {
  matchTmdbPath,
  cacheControlFor,
  sanitiseParams,
  isValidTitleRequest,
  TITLE_TTL_SECONDS,
} from '../rules';

const HOUR = 3600;
const DAY = 24 * HOUR;

describe('matchTmdbPath (the allowlist)', () => {
  it('allows the client read surface with the right TTL classes', () => {
    expect(matchTmdbPath('discover/movie')).toBe(HOUR);
    expect(matchTmdbPath('discover/tv')).toBe(HOUR);
    expect(matchTmdbPath('search/movie')).toBe(HOUR);
    expect(matchTmdbPath('search/multi')).toBe(HOUR);
    expect(matchTmdbPath('trending/all/week')).toBe(HOUR);
    expect(matchTmdbPath('movie/603')).toBe(DAY);
    expect(matchTmdbPath('tv/1396/similar')).toBe(DAY);
    expect(matchTmdbPath('movie/603/recommendations')).toBe(DAY);
    expect(matchTmdbPath('tv/1396/watch/providers')).toBe(6 * HOUR);
    expect(matchTmdbPath('configuration')).toBe(7 * DAY);
  });

  it('rejects everything off-allowlist', () => {
    expect(matchTmdbPath('account')).toBeNull();
    expect(matchTmdbPath('authentication/token/new')).toBeNull();
    expect(matchTmdbPath('movie/603/account_states')).toBeNull();
    expect(matchTmdbPath('person/287')).toBeNull();
    expect(matchTmdbPath('discover/movie/extra')).toBeNull();
    expect(matchTmdbPath('search/person')).toBeNull();
    expect(matchTmdbPath('')).toBeNull();
    expect(matchTmdbPath('movie/abc')).toBeNull();
  });
});

describe('cacheControlFor', () => {
  it('emits the brief §6.3 s-maxage + SWR shape', () => {
    expect(cacheControlFor(DAY)).toBe(
      'public, max-age=60, s-maxage=86400, stale-while-revalidate=86400',
    );
  });
  it('title TTL is the 24h tier', () => {
    expect(TITLE_TTL_SECONDS).toBe(DAY);
  });
});

describe('sanitiseParams', () => {
  it('strips credential params and sorts for cache-key stability', () => {
    const input = new URLSearchParams('page=2&api_key=LEAKED&with_genres=35&apikey=ALSO');
    const out = sanitiseParams(input);
    expect(out.toString()).toBe('page=2&with_genres=35');
  });
  it('keeps duplicate-key params intact', () => {
    const out = sanitiseParams(new URLSearchParams('a=2&a=1'));
    expect(out.getAll('a')).toEqual(['2', '1']);
  });
});

describe('isValidTitleRequest', () => {
  it('accepts movie/tv with positive numeric ids', () => {
    expect(isValidTitleRequest('movie', '603')).toBe(true);
    expect(isValidTitleRequest('tv', '1396')).toBe(true);
  });
  it('rejects bad types and ids', () => {
    expect(isValidTitleRequest('person', '287')).toBe(false);
    expect(isValidTitleRequest('movie', 'abc')).toBe(false);
    expect(isValidTitleRequest('movie', '0')).toBe(false);
    expect(isValidTitleRequest('movie', '-1')).toBe(false);
    expect(isValidTitleRequest('movie', '12.5')).toBe(false);
  });
});
