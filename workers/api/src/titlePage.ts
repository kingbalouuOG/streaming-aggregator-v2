/**
 * Public share / SEO title page renderer (H0 Stream B — Share v1; slug
 * canonical and smart banner added in Growth S1).
 *
 * Pure module — NO Hono/Workers imports — so it runs under the root
 * vitest rig (see workers/api/src/__tests__/titlePage.test.ts). index.ts
 * wires it into the /t/:type/:ref route. The shell, store CTA and platform
 * bucketing live in pageShell.ts and are re-exported here.
 *
 * URL (ADR-015): /t/{movie|tv}/{tmdbId}-{slug}. The page is resolved by
 * type and id only; index.ts 301s a bare or stale slug to the canonical
 * ref, which the render reports in CANONICAL_REF_HEADER so a cache hit can
 * redirect without a database read.
 */

import { titleRef } from '../../../src/lib/growth/slug';
import {
  ATTRIBUTION_FOOTER,
  DEEP_LINK_QUERY_MARK,
  esc,
  renderDocument,
  renderNotFoundPage,
  smartBannerMeta,
  storeCta,
  type PlatformBucket,
} from './pageShell';

export {
  APP_STORE_URL,
  IOS_APP_STORE_LIVE,
  PLAY_STORE_URL,
  esc,
  platformBucket,
  storeCta,
  type PlatformBucket,
} from './pageShell';

/** Response header carrying the canonical {tmdbId}-{slug} ref. Internal. */
export const CANONICAL_REF_HEADER = 'x-videx-canonical-ref';

// service_id → display label (mirrors the native SERVICE_LABELS map).
export const SHARE_SERVICE_LABELS: Record<string, string> = {
  netflix: 'Netflix', prime: 'Prime Video', disney: 'Disney+', apple: 'Apple TV+',
  now: 'NOW', paramount: 'Paramount+', itvx: 'ITVX', channel4: 'Channel 4',
  hbo: 'HBO Max', discovery: 'Discovery+', crunchyroll: 'Crunchyroll',
  mubi: 'MUBI', plutotv: 'Pluto TV',
  bbc: 'BBC iPlayer', skygo: 'Sky Go',
};

export interface TitlePageData {
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  subscription: string[]; // service labels you can stream on
  rentBuy: string[]; // service labels for rent/buy
}

/**
 * Edge cache key for a title page: type, id and platform bucket only. The
 * slug and the ?via= / ?src= query are deliberately absent, so every share
 * of a title reads one cached render (attribution is filled after the read).
 */
export function titlePageCacheKey(type: string, id: number, bucket: PlatformBucket): string {
  return `https://cache.videx/t/${type}/${id}?p=${bucket}`;
}

const TITLE_CSS = `.hero{display:flex;gap:16px;align-items:flex-start}
.poster{width:120px;height:180px;border-radius:12px;object-fit:cover;background:#14141c;flex:none}
.year{color:rgba(245,241,232,.6);font-weight:400}
ul.svc{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
ul.svc li{background:#14141c;border:1px solid rgba(245,241,232,.12);border-radius:999px;padding:6px 14px;font-size:14px}
.overview{margin-top:20px;color:rgba(245,241,232,.85)}`;

export function renderTitlePage(
  type: string,
  id: number,
  d: TitlePageData,
  origin: string,
  bucket: PlatformBucket,
): string {
  const yearStr = d.year ? ` (${d.year})` : '';
  const pageTitle = `Where to watch ${d.title}${yearStr} in the UK | Videx`;
  const desc =
    d.subscription.length > 0
      ? `Stream ${d.title} on ${d.subscription.join(', ')}. See where to watch in the UK on Videx.`
      : `See where to watch ${d.title} in the UK on Videx.`;
  const deepLink = `videx://detail/${type}-${id}${DEEP_LINK_QUERY_MARK}`;
  const canonical = `${origin}/t/${type}/${titleRef(id, d.title, d.year)}`;

  const watchBlock =
    d.subscription.length > 0 || d.rentBuy.length > 0
      ? `
      ${d.subscription.length > 0
        ? `<section><h2>Stream now</h2><ul class="svc">${d.subscription
            .map((s) => `<li>${esc(s)}</li>`)
            .join('')}</ul></section>`
        : ''}
      ${d.rentBuy.length > 0
        ? `<section><h2>Rent or buy</h2><ul class="svc">${d.rentBuy
            .map((s) => `<li>${esc(s)}</li>`)
            .join('')}</ul></section>`
        : ''}`
      : `<section><p class="muted">We don't have current UK streaming info for this title yet.</p></section>`;

  const head = `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${smartBannerMeta(canonical)}
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="Videx">
<meta property="og:title" content="${esc(`${d.title}${yearStr}`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${d.posterUrl ? `<meta property="og:image" content="${esc(d.posterUrl)}">` : ''}
<meta name="twitter:card" content="${d.posterUrl ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(`${d.title}${yearStr}`)}">
<meta name="twitter:description" content="${esc(desc)}">
${d.posterUrl ? `<meta name="twitter:image" content="${esc(d.posterUrl)}">` : ''}`;

  const body = `  <div class="hero">
    ${d.posterUrl ? `<img class="poster" src="${esc(d.posterUrl)}" alt="${esc(d.title)} poster" width="120" height="180">` : ''}
    <div>
      <h1>${esc(d.title)} <span class="year">${esc(yearStr.trim())}</span></h1>
      <p class="muted">Where to watch in the UK</p>
    </div>
  </div>

  ${watchBlock}

  ${d.overview ? `<p class="overview">${esc(d.overview)}</p>` : ''}

  <div class="cta">
    <a class="btn btn-primary" href="${deepLink}">Open in the Videx app</a>
    ${storeCta(bucket)}
  </div>

  ${ATTRIBUTION_FOOTER}`;

  return renderDocument({ title: pageTitle, head, css: TITLE_CSS, body });
}

/** Small branded 404 for /t/ requests whose title isn't in the cache. */
export function renderTitleNotFoundPage(bucket: PlatformBucket): string {
  return renderNotFoundPage('Title not found', "We don't have this title in the Videx catalogue.", bucket);
}
