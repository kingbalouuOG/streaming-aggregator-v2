/**
 * Unit tests for the UA-aware title-page renderer. Pure module (no
 * Workers/Hono imports), runs under the root vitest rig — same pattern as
 * policyPages.test.ts. Beta feedback 2026-07-09: the store CTA must adapt
 * to the visitor's platform, and the edge cache must vary by that bucket.
 */

import { describe, it, expect } from 'vitest';
import {
  platformBucket,
  storeCta,
  renderTitlePage,
  renderTitleNotFoundPage,
  esc,
  PLAY_STORE_URL,
  titlePageCacheKey,
  type TitlePageData,
} from '../titlePage';
import { applyAttribution, DEEP_LINK_QUERY_MARK, PAGE_CACHE_VERSION, PLAY_REFERRER_MARK } from '../pageShell';

const SAMPLE: TitlePageData = {
  title: 'Predator',
  year: 1987,
  posterUrl: null,
  overview: null,
  subscription: ['Disney+'],
  rentBuy: [],
};

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  bot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

describe('platformBucket', () => {
  it('classifies iPhone/iPad/iPod as ios', () => {
    expect(platformBucket(UA.iphone)).toBe('ios');
    expect(platformBucket(UA.ipad)).toBe('ios');
  });
  it('classifies Android as android', () => {
    expect(platformBucket(UA.android)).toBe('android');
  });
  it('classifies desktop, mac Safari and bots as other', () => {
    expect(platformBucket(UA.desktop)).toBe('other');
    expect(platformBucket(UA.macSafari)).toBe('other');
    expect(platformBucket(UA.bot)).toBe('other');
  });
  it('treats null/empty UA as other', () => {
    expect(platformBucket(null)).toBe('other');
    expect(platformBucket(undefined)).toBe('other');
    expect(platformBucket('')).toBe('other');
  });
});

describe('storeCta', () => {
  it('android → Play link', () => {
    const html = storeCta('android');
    expect(html).toContain(PLAY_STORE_URL);
    expect(html).toContain('Get Videx on Android');
  });
  it('ios → coming soon copy, no dead App Store href while TestFlight-only', () => {
    const html = storeCta('ios');
    expect(html).toContain('Coming soon to the App Store');
    expect(html).not.toContain('Get Videx on Android');
    // No half-broken apps.apple.com link before the listing is live.
    expect(html).not.toContain('apps.apple.com');
  });
  it('other → neutral Get Videx (Play link) plus iOS-coming-soon hint', () => {
    const html = storeCta('other');
    expect(html).toContain(PLAY_STORE_URL);
    expect(html).toContain('>Get Videx<');
    expect(html).toContain('iOS coming soon');
  });
});

describe('renderTitlePage CTA by platform', () => {
  it('iOS visitor never sees the Android CTA', () => {
    const html = renderTitlePage('movie', 106, SAMPLE, 'https://x.videx', 'ios');
    expect(html).toContain('Coming soon to the App Store');
    expect(html).not.toContain('Get Videx on Android');
  });
  it('Android visitor sees the Play CTA', () => {
    const html = renderTitlePage('movie', 106, SAMPLE, 'https://x.videx', 'android');
    expect(html).toContain('Get Videx on Android');
  });
  it('desktop visitor sees the neutral CTA', () => {
    const html = renderTitlePage('movie', 106, SAMPLE, 'https://x.videx', 'other');
    expect(html).toContain('>Get Videx<');
    expect(html).toContain('iOS coming soon');
  });
  it('keeps the deep-link and uses the slugged canonical', () => {
    const html = renderTitlePage('movie', 106, SAMPLE, 'https://x.videx', 'android');
    expect(html).toContain('videx://detail/movie-106');
    expect(html).toContain('<link rel="canonical" href="https://x.videx/t/movie/106-predator-1987">');
    expect(html).toContain('<meta property="og:url" content="https://x.videx/t/movie/106-predator-1987">');
  });
  it('carries the iOS smart banner pointing at the canonical URL', () => {
    const html = renderTitlePage('movie', 106, SAMPLE, 'https://x.videx', 'ios');
    expect(html).toContain(
      '<meta name="apple-itunes-app" content="app-id=6785395342, app-argument=https://x.videx/t/movie/106-predator-1987">',
    );
  });
  it('escapes title text (esc discipline preserved)', () => {
    const evil: TitlePageData = { ...SAMPLE, title: 'A <b> & "co"' };
    const html = renderTitlePage('movie', 1, evil, 'https://x.videx', 'other');
    expect(html).toContain('A &lt;b&gt; &amp; &quot;co&quot;');
    expect(html).not.toContain('A <b> &');
  });
});

describe('renderTitleNotFoundPage', () => {
  it('renders the platform CTA', () => {
    expect(renderTitleNotFoundPage('ios')).toContain('Coming soon to the App Store');
    expect(renderTitleNotFoundPage('android')).toContain('Get Videx on Android');
  });
  it('stays noindex', () => {
    expect(renderTitleNotFoundPage('other')).toContain('<meta name="robots" content="noindex">');
  });
});

describe('attribution pass-through (?via= / ?src=)', () => {
  const page = renderTitlePage('movie', 603, { ...SAMPLE, title: 'The Matrix', year: 1999 }, 'https://videxstreaming.com', 'android');

  it('fills via and src into the deep link and the Play referrer, unchanged', () => {
    const html = applyAttribution(page, 'share', 'push');
    expect(html).toContain('href="videx://detail/movie-603?via=share&amp;src=push"');
    expect(html).toContain(`href="${PLAY_STORE_URL}&amp;referrer=via%3Dshare%26src%3Dpush"`);
  });

  it('leaves clean links and no markers when there is no query', () => {
    const html = applyAttribution(page, null, undefined);
    expect(html).toContain('href="videx://detail/movie-603"');
    expect(html).toContain(`href="${PLAY_STORE_URL}"`);
    expect(html).not.toContain(DEEP_LINK_QUERY_MARK);
    expect(html).not.toContain(PLAY_REFERRER_MARK);
  });

  it('drops values outside the contract instead of echoing them', () => {
    const html = applyAttribution(page, '"><script>', 'organic');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="videx://detail/movie-603?src=organic"');
  });

  it('names the object in the Play referrer (Growth S2) without touching the deep link', () => {
    const html = applyAttribution(page, 'share', 'push', { type: 'title', id: 'movie-603' });
    expect(html).toContain('href="videx://detail/movie-603?via=share&amp;src=push"');
    expect(html).toContain(`href="${PLAY_STORE_URL}&amp;referrer=via%3Dshare%26src%3Dpush%26t%3Dmovie-603"`);
  });

  it('carries the object alone when the link had no attribution', () => {
    const html = applyAttribution(page, undefined, undefined, { type: 'title', id: 'movie-603' });
    expect(html).toContain('href="videx://detail/movie-603"');
    expect(html).toContain(`href="${PLAY_STORE_URL}&amp;referrer=t%3Dmovie-603"`);
  });

  it('the canonical URL never carries the query', () => {
    const html = applyAttribution(page, 'share', 'push');
    expect(html).toContain('<link rel="canonical" href="https://videxstreaming.com/t/movie/603-the-matrix-1999">');
  });
});

describe('titlePageCacheKey', () => {
  // index.ts reads and writes the edge cache with this key, so a shared
  // URL's slug and ?via= / ?src= can never mint a separate cache entry.
  it('is type + id + platform bucket + page cache version only (the index.ts:281 pattern)', () => {
    expect(titlePageCacheKey('movie', 603, 'ios')).toBe(
      `https://cache.videx/t/movie/603?p=ios&v=${PAGE_CACHE_VERSION}`,
    );
  });
  it('never reads entries written before page cache versioning', () => {
    expect(titlePageCacheKey('movie', 603, 'ios')).not.toBe('https://cache.videx/t/movie/603?p=ios');
  });
  it('takes no slug or query input', () => {
    expect(titlePageCacheKey.length).toBe(3);
  });
});

describe('esc', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(esc(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });
});
