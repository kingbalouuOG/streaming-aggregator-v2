import { describe, expect, it } from 'vitest';

import {
  listOgDescription,
  listOgTitle,
  listPageCacheKey,
  renderListNotFoundPage,
  renderListPage,
  type ListPageData,
} from '../listPage';
import {
  applyAttribution,
  LIST_PAGE_TTL_SECONDS,
  PAGE_CACHE_VERSION,
  PAGE_TTL_SECONDS,
  PLAY_STORE_URL,
} from '../pageShell';

const ID = '8c1e3f2b-4e6f-4a9d-8b7a-5a6b1c2d3e4f';
const TOKEN = 'd3e4f5a6-1c2d-4b7a-9a4d-3f2b8c1e4e6f';
const LIST_OBJECT = { type: 'list' as const, id: ID };

const LIST: ListPageData = {
  id: ID,
  name: 'Shared',
  household_name: 'The Sofa',
  count: 9,
  posters: Array.from({ length: 8 }, (_, i) => `/p${i}.jpg`),
  members: 2,
};

// Fields loadListPreview never selects, planted to prove the page renders
// only what it is meant to, even when handed more.
const DECOY_USERNAME = 'decoy_username_zq';
const DECOY_EMAIL = 'decoy@example.test';
const DECOY_TOKEN = '99999999-8888-4777-8666-555555555555';
const WITH_DECOYS = {
  ...LIST,
  usernames: [DECOY_USERNAME],
  added_by: [DECOY_USERNAME],
  owner: { username: DECOY_USERNAME, email: DECOY_EMAIL },
  email: DECOY_EMAIL,
  token: DECOY_TOKEN,
  invite: DECOY_TOKEN,
  household_invites: [{ token: DECOY_TOKEN }],
} as unknown as ListPageData;

describe('renderListPage', () => {
  const html = renderListPage(LIST, 'android');

  it('carries the OG contract', () => {
    expect(html).toContain('<meta property="og:title" content="The Sofa on Videx">');
    expect(html).toContain(
      '<meta property="og:description" content="9 titles to pick from together, with UK availability on Videx">',
    );
    expect(html).toContain('<meta property="og:image" content="https://image.tmdb.org/t/p/w342/p0.jpg">');
    expect(html).toContain(`<link rel="canonical" href="https://videxstreaming.com/list/${ID}">`);
    expect(html).toContain(`<meta property="og:url" content="https://videxstreaming.com/list/${ID}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<title>The Sofa on Videx</title>');
  });

  it('shows the counts and the first six posters only', () => {
    expect(html).toContain('9 titles · 2 people');
    expect(html).toContain('/p5.jpg');
    expect(html).not.toContain('/p6.jpg');
  });

  it('has the smart banner, the app deep link and the platform CTA', () => {
    expect(html).toContain(
      `<meta name="apple-itunes-app" content="app-id=6785395342, app-argument=https://videxstreaming.com/list/${ID}">`,
    );
    const filled = applyAttribution(html, 'household', null, LIST_OBJECT);
    expect(filled).toContain(`href="videx://list/${ID}?via=household">Open in the Videx app`);
    expect(filled).toContain(`${PLAY_STORE_URL}&amp;referrer=${encodeURIComponent(`via=household&l=${ID}`)}`);
    expect(filled).toContain('Get Videx on Android');
  });

  it('is noindex: a household list is shared by link, not published', () => {
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('renders no username, email or token, even when the data carries decoys', () => {
    const page = renderListPage(WITH_DECOYS, 'other');
    for (const secret of [DECOY_USERNAME, DECOY_EMAIL, DECOY_TOKEN, 'invite=', 'added_by', '@']) {
      expect(page).not.toContain(secret);
    }
    // And the per-request fill adds only the request's own token, only where it belongs.
    const filled = applyAttribution(page, 'household', null, LIST_OBJECT, TOKEN);
    expect(filled).not.toContain(DECOY_TOKEN);
    expect(filled).not.toContain(DECOY_USERNAME);
    expect(filled.split(TOKEN).length - 1).toBe(2); // the deep link and the Play link
  });

  it('escapes the names', () => {
    const evil = renderListPage({ ...LIST, household_name: '<script>x</script>', name: '"q"' }, 'ios');
    expect(evil).not.toContain('<script>x');
    expect(evil).toContain('&lt;script&gt;x&lt;/script&gt; on Videx');
  });

  it('skips poster paths that are not plain TMDb paths', () => {
    const page = renderListPage(
      { ...LIST, posters: ['javascript:alert(1)', '//evil.test/x.jpg', '/ok.jpg', '/a/../b.jpg'] },
      'ios',
    );
    expect(page).toContain('https://image.tmdb.org/t/p/w342/ok.jpg');
    expect(page).not.toContain('evil.test');
    expect(page).not.toContain('javascript:');
    expect(page).not.toContain('..');
  });

  it('handles an empty list', () => {
    const empty = renderListPage({ ...LIST, count: 0, posters: [], members: 1 }, 'ios');
    expect(empty).toContain('0 titles · 1 person');
    expect(empty).not.toContain('og:image');
    expect(empty).toContain('<meta name="twitter:card" content="summary">');
    expect(empty).toContain('Get Videx on iOS');
  });
});

describe('the invite rides the markers, never the cache', () => {
  const cached = renderListPage(LIST, 'android');

  it('fills invite= into the deep link and i= into the Play referrer', () => {
    const filled = applyAttribution(cached, 'household', 'push', LIST_OBJECT, TOKEN);
    expect(filled).toContain(`href="videx://list/${ID}?invite=${TOKEN}&amp;via=household&amp;src=push"`);
    expect(filled).toContain(
      `${PLAY_STORE_URL}&amp;referrer=${encodeURIComponent(`via=household&src=push&l=${ID}&i=${TOKEN}`)}`,
    );
  });

  it('drops an invite that is not a uuid', () => {
    const filled = applyAttribution(cached, 'household', null, LIST_OBJECT, '"><script>');
    expect(filled).toContain(`href="videx://list/${ID}?via=household"`);
    expect(filled).not.toContain('script>');
  });

  it('two requests with different tokens share one cached render', () => {
    const other = '11111111-2222-4333-8444-555555555555';
    const a = applyAttribution(cached, null, null, LIST_OBJECT, TOKEN);
    const b = applyAttribution(cached, null, null, LIST_OBJECT, other);
    expect(a).toContain(TOKEN);
    expect(a).not.toContain(other);
    expect(b).toContain(other);
    expect(b).not.toContain(TOKEN);
  });

  it('ignores an invite on a room or title page', () => {
    const room = '<a href="videx://room/x__VIDEX_DL_QUERY__">';
    expect(applyAttribution(room, 'share', null, { type: 'room', id: ID }, TOKEN)).toBe(
      '<a href="videx://room/x?via=share">',
    );
    expect(applyAttribution(room, 'share', null, { type: 'title', id: 'movie-603' }, TOKEN)).toBe(
      '<a href="videx://room/x?via=share">',
    );
  });
});

describe('list helpers', () => {
  it('og title falls back to the list name', () => {
    expect(listOgTitle({ name: 'Shared', household_name: '' })).toBe('Shared on Videx');
  });
  it('og description pluralises', () => {
    expect(listOgDescription(1)).toBe('1 title to pick from together, with UK availability on Videx');
  });
  it('cache key is id + platform bucket + page cache version, no request query', () => {
    expect(listPageCacheKey(ID, 'other')).toBe(`https://cache.videx/list/${ID}?p=other&v=${PAGE_CACHE_VERSION}`);
  });
  it('a list caches for a minute, not a day', () => {
    expect(LIST_PAGE_TTL_SECONDS).toBe(60);
    expect(PAGE_TTL_SECONDS).toBe(86400);
  });
  it('the 404 is branded and noindex', () => {
    expect(renderListNotFoundPage('android')).toContain('<meta name="robots" content="noindex">');
    expect(renderListNotFoundPage('android')).toContain('List not found');
  });
});
