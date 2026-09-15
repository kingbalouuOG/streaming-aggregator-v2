import { describe, expect, it } from 'vitest';

import { applyAttribution, PAGE_CACHE_VERSION, PLAY_STORE_URL } from '../pageShell';
import {
  renderListNotFoundPage,
  renderRoomNotFoundPage,
  renderRoomPage,
  roomOgDescription,
  roomPageCacheKey,
  type RoomPageData,
} from '../roomPage';

const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const poster = (n: number) => `https://image.tmdb.org/t/p/w500/p${n}.jpg`;

const ROOM: RoomPageData = {
  id: ID,
  label: 'Slow-burn crime sagas',
  description: 'Long nights, longer cons.',
  createdAt: '2026-09-14T10:00:00Z',
  titles: Array.from({ length: 15 }, (_, i) => ({ title: `Title ${i}`, year: 2000 + i, image: poster(i) })),
};

describe('renderRoomPage', () => {
  const html = renderRoomPage(ROOM, 'https://videxstreaming.com', 'android');

  it('carries the OG contract', () => {
    expect(html).toContain('<meta property="og:title" content="Slow-burn crime sagas">');
    expect(html).toContain(
      '<meta property="og:description" content="15 titles picked for the mood, with UK availability on Videx">',
    );
    expect(html).toContain(`<meta property="og:image" content="${poster(0)}">`);
    expect(html).toContain(`<link rel="canonical" href="https://videxstreaming.com/room/${ID}">`);
    expect(html).toContain(`<meta property="og:url" content="https://videxstreaming.com/room/${ID}">`);
  });

  it('shows the picked-on line and the first 12 posters only', () => {
    expect(html).toContain('15 titles · picked on 14 September 2026');
    expect(html).toContain(poster(11));
    expect(html).not.toContain(poster(12));
  });

  it('has the smart banner, the app deep link and the platform CTA', () => {
    expect(html).toContain(
      `<meta name="apple-itunes-app" content="app-id=6785395342, app-argument=https://videxstreaming.com/room/${ID}">`,
    );
    const filled = applyAttribution(html, 'share', null);
    expect(filled).toContain(`href="videx://room/${ID}?via=share">Open in the Videx app`);
    expect(filled).toContain(`${PLAY_STORE_URL}&amp;referrer=via%3Dshare`);
    expect(filled).toContain('Get Videx on Android');
  });

  it('is indexable', () => {
    expect(html).not.toContain('noindex');
  });

  it('escapes the label and description', () => {
    const evil = renderRoomPage(
      { ...ROOM, label: '<script>x</script>', description: '"q" & <b>' },
      'https://videxstreaming.com',
      'other',
    );
    expect(evil).not.toContain('<script>x');
    expect(evil).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(evil).toContain('&quot;q&quot; &amp; &lt;b&gt;');
  });

  it('handles a single title and no posters', () => {
    const one = renderRoomPage(
      { ...ROOM, description: null, titles: [{ title: 'Heat', image: '' }] },
      'https://videxstreaming.com',
      'ios',
    );
    expect(one).toContain('1 title · picked on');
    expect(one).not.toContain('og:image');
    expect(one).toContain('Coming soon to the App Store');
  });
});

describe('room helpers', () => {
  it('og description pluralises', () => {
    expect(roomOgDescription(1)).toBe('1 title picked for the mood, with UK availability on Videx');
  });
  it('cache key is id + platform bucket + page cache version, no request query', () => {
    expect(roomPageCacheKey(ID, 'ios')).toBe(`https://cache.videx/room/${ID}?p=ios&v=${PAGE_CACHE_VERSION}`);
  });
  it('404 pages are branded and noindex', () => {
    expect(renderRoomNotFoundPage('other')).toContain('<meta name="robots" content="noindex">');
    expect(renderRoomNotFoundPage('other')).toContain('Room not found');
    expect(renderListNotFoundPage('android')).toContain('<meta name="robots" content="noindex">');
    expect(renderListNotFoundPage('android')).toContain('Get Videx on Android');
  });
});
