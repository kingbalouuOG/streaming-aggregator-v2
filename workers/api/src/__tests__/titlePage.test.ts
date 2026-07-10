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
  type TitlePageData,
} from '../titlePage';

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
  it('keeps the deep-link and canonical intact', () => {
    const html = renderTitlePage('movie', 106, SAMPLE, 'https://x.videx', 'android');
    expect(html).toContain('videx://detail/movie-106');
    expect(html).toContain('<link rel="canonical" href="https://x.videx/t/movie/106">');
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

describe('esc', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(esc(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });
});
