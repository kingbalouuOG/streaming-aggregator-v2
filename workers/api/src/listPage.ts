/**
 * Public page for a shared household list, GET /list/:id (Growth G2 H3).
 *
 * Pure module — NO Hono/Workers imports — tested from the root vitest rig.
 * Same shell, store CTA, smart banner and attribution markers as the room
 * page (pageShell.ts). Unlike a room, a list is live: it caches for
 * LIST_PAGE_TTL_SECONDS, keyed by id and platform bucket. The household
 * invite token is never rendered: applyAttribution() adds it to the deep link
 * and the Play referrer per request, after the cache read.
 *
 * Renders only what loadListPreview selects (names, counts, posters): no
 * member names, no emails, no tokens.
 */

import { countLabel } from '../../../src/lib/format/plural';
import { CANONICAL_ORIGIN } from '../../../src/lib/growth/slug';
import type { ListPreview } from './listStore';
import { isPosterPath, LIST_POSTER_LIMIT } from './listStore';
import {
  ATTRIBUTION_FOOTER,
  DEEP_LINK_QUERY_MARK,
  esc,
  pageCacheKey,
  renderDocument,
  renderNotFoundPage,
  smartBannerMeta,
  storeCta,
  type PlatformBucket,
} from './pageShell';

export type ListPageData = ListPreview;

const posterUrl = (path: string) => `https://image.tmdb.org/t/p/w342${path}`;

export function listPageCacheKey(id: string, bucket: PlatformBucket): string {
  return pageCacheKey(`/list/${id}`, bucket);
}

/**
 * og:title. Every v1 list is named 'Shared' (create_household, 093), so the
 * household name is what a recipient recognises; the list name is used only
 * if the household name is somehow empty.
 */
export function listOgTitle(d: Pick<ListPageData, 'name' | 'household_name'>): string {
  return `${d.household_name || d.name} on Videx`;
}

export function listOgDescription(count: number): string {
  return `${countLabel(count, 'title')} to pick from together, with UK availability on Videx`;
}

const LIST_CSS = `.kicker{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#e85d25;font-weight:700;margin:0 0 6px}
.grid{list-style:none;padding:0;margin:24px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.grid img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:10px;background:#14141c;display:block}`;

export function renderListPage(d: ListPageData, bucket: PlatformBucket): string {
  const canonical = `${CANONICAL_ORIGIN}/list/${d.id}`;
  const title = listOgTitle(d);
  const desc = listOgDescription(d.count);
  const posters = d.posters.filter(isPosterPath).slice(0, LIST_POSTER_LIMIT).map(posterUrl);
  const firstPoster = posters[0] ?? null;

  const head = `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${smartBannerMeta(canonical)}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Videx">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${firstPoster ? `<meta property="og:image" content="${esc(firstPoster)}">` : ''}
<meta name="twitter:card" content="${firstPoster ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${firstPoster ? `<meta name="twitter:image" content="${esc(firstPoster)}">` : ''}`;

  const grid = posters
    .map((src) => `<li><img src="${esc(src)}" alt="" loading="lazy" width="160" height="240"></li>`)
    .join('');

  const body = `  <p class="kicker">Shared list</p>
  <h1>${esc(d.household_name || d.name)}</h1>
  <p class="muted">${countLabel(d.count, 'title')} · ${countLabel(d.members, 'person', 'people')}</p>

  ${grid ? `<ul class="grid">${grid}</ul>` : ''}

  <div class="cta">
    <a class="btn btn-primary" href="videx://list/${esc(d.id)}${DEEP_LINK_QUERY_MARK}">Open in the Videx app</a>
    ${storeCta(bucket)}
  </div>

  ${ATTRIBUTION_FOOTER}`;

  // A household's list is shared by link, not published: keep it out of search.
  return renderDocument({ title, head, css: LIST_CSS, body, noindex: true });
}

export function renderListNotFoundPage(bucket: PlatformBucket): string {
  return renderNotFoundPage('List not found', "This list doesn't exist.", bucket);
}
