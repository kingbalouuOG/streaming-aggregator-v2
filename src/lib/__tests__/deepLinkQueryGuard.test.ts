/**
 * stripMalformedQuery — the +native-intent guard in front of expo-router's
 * query parsing (IN-DEP-001, GHSA-vcc3-ghjq-m6fr).
 *
 * Well-formed links must pass through byte-for-byte (password reset
 * depends on its query); malformed percent-encoding must never reach
 * query-string, whose decoder is super-linear on it.
 */

import { describe, it, expect } from 'vitest';
import { stripMalformedQuery } from '../deepLinkQueryGuard';

describe('stripMalformedQuery — passes well-formed links through', () => {
  it.each([
    'videx://watchlist',
    'videx://detail/movie-123',
    'videx://reset-password?token_hash=9f86d081884c7d65&type=recovery',
    'videx://browse?contentType=tv&seed=a%20b+c',
    'videx://detail/tv-1?title=Am%C3%A9lie%20%E2%9C%93',
    'videx://reset-password#error=otp_expired&error_code=403',
    'videx://x?',
  ])('%s', (url) => {
    expect(stripMalformedQuery(url)).toBe(url);
  });

  it('leaves a long well-formed query alone (length alone is not the hazard)', () => {
    const url = 'videx://browse?a=' + '%41'.repeat(4000);
    expect(stripMalformedQuery(url)).toBe(url);
  });
});

describe('stripMalformedQuery — drops malformed queries, keeps the route', () => {
  it.each([
    ['lone invalid byte', 'videx://detail/movie-1?a=%FF'],
    ['truncated multi-byte sequence', 'videx://detail/movie-1?a=%E0%A4'],
    ['overlong encoding', 'videx://detail/movie-1?a=%C0%80'],
    ['bare percent', 'videx://detail/movie-1?a=100%'],
    ['bad hex digits', 'videx://detail/movie-1?a=%zz'],
    ['malformed key, valid value', 'videx://detail/movie-1?%FF=1&title=ok'],
  ])('%s', (_label, url) => {
    expect(stripMalformedQuery(url)).toBe('videx://detail/movie-1');
  });

  it('also drops a fragment that follows a malformed query', () => {
    expect(stripMalformedQuery('videx://reset-password?a=%FF#token=x')).toBe(
      'videx://reset-password',
    );
  });

  it('handles the measured DoS payload in linear time', () => {
    const url = 'videx://x?a=' + '%FF'.repeat(5000);
    const start = performance.now();
    expect(stripMalformedQuery(url)).toBe('videx://x');
    expect(performance.now() - start).toBeLessThan(250);
  });
});
