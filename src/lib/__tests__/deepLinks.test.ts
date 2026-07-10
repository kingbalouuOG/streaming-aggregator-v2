/**
 * getDeepLink — resolver for streaming-service open URLs.
 *
 * Locks in the platform-conditional Prime Video behaviour (beta feedback
 * 2026-07-09): Prime's exact SA link is discarded in favour of search on
 * Android (no reliable app deep link), but honoured on iOS (primevideo.com
 * Universal Links are reliable) and web.
 */

import { describe, it, expect } from 'vitest';
import { getDeepLink } from '../deepLinks';

const PRIME_SA_LINK = 'https://www.primevideo.com/detail/0ABCDEF/ref=xyz';
const NETFLIX_SA_LINK = 'https://www.netflix.com/title/70131314';

describe('getDeepLink — Prime platform conditional', () => {
  it('Android: discards the exact Prime link for search', () => {
    const r = getDeepLink('prime', PRIME_SA_LINK, 'Predator', 1987, 'android');
    expect(r.type).toBe('search');
    expect(r.url).toContain('primevideo.com/search');
    expect(r.url).not.toBe(PRIME_SA_LINK);
  });

  it('iOS: uses the exact Prime SA link when present', () => {
    const r = getDeepLink('prime', PRIME_SA_LINK, 'Predator', 1987, 'ios');
    expect(r.type).toBe('exact');
    expect(r.url).toBe(PRIME_SA_LINK);
  });

  it('web: uses the exact Prime SA link when present', () => {
    const r = getDeepLink('prime', PRIME_SA_LINK, 'Predator', 1987, 'web');
    expect(r.type).toBe('exact');
    expect(r.url).toBe(PRIME_SA_LINK);
  });

  it('defaults to web behaviour (exact Prime link) when platform omitted', () => {
    const r = getDeepLink('prime', PRIME_SA_LINK, 'Predator', 1987);
    expect(r.type).toBe('exact');
    expect(r.url).toBe(PRIME_SA_LINK);
  });

  it('iOS with no SA link still falls back to Prime search', () => {
    const r = getDeepLink('prime', null, 'Predator', 1987, 'ios');
    expect(r.type).toBe('search');
    expect(r.url).toContain('primevideo.com/search');
  });
});

describe('getDeepLink — non-Prime services are unaffected by platform', () => {
  for (const platform of ['android', 'ios', 'web'] as const) {
    it(`Netflix uses the exact link on ${platform}`, () => {
      const r = getDeepLink('netflix', NETFLIX_SA_LINK, 'Predator', 1987, platform);
      expect(r.type).toBe('exact');
      expect(r.url).toBe(NETFLIX_SA_LINK);
    });
  }

  it('Channel 4 builds a /programmes slug fallback when no SA link', () => {
    const r = getDeepLink('channel4', null, 'Predator', 1987, 'android');
    expect(r.type).toBe('search');
    expect(r.url).toContain('/programmes/predator-1987');
  });
});
