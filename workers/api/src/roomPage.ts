/**
 * Public page for a shared room snapshot, GET /room/:id (Growth G0-4).
 *
 * Pure module — NO Hono/Workers imports — tested from the root vitest rig.
 * Same shell, store CTA, smart banner and attribution markers as the title
 * page (pageShell.ts). The row is immutable (no unshare, no expiry), so the
 * page caches 24h keyed by id and platform bucket.
 *
 * /list/:id is reserved for the G2 watchlists entity and renders the
 * branded 404 until then.
 */

import { countLabel } from '../../../src/lib/format/plural';
import { formatPickedDate } from '../../../src/lib/growth/roomSnapshot';
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

/** Posters in the grid; the count line still reports every title. */
export const ROOM_POSTER_LIMIT = 12;

export interface RoomPageData {
  id: string;
  label: string;
  description: string | null;
  createdAt: string;
  titles: { title: string; year?: number; image: string }[];
}

export function roomPageCacheKey(id: string, bucket: PlatformBucket): string {
  return pageCacheKey(`/room/${id}`, bucket);
}

export function roomOgDescription(count: number): string {
  return `${countLabel(count, 'title')} picked for the mood, with UK availability on Videx`;
}

const ROOM_CSS = `.kicker{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#e85d25;font-weight:700;margin:0 0 6px}
.desc{margin:12px 0 0;color:rgba(245,241,232,.85);font-style:italic}
.grid{list-style:none;padding:0;margin:24px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.grid img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:10px;background:#14141c;display:block}
@media (min-width:520px){.grid{grid-template-columns:repeat(4,1fr)}}`;

export function renderRoomPage(d: RoomPageData, origin: string, bucket: PlatformBucket): string {
  const canonical = `${origin}/room/${d.id}`;
  const count = d.titles.length;
  const desc = roomOgDescription(count);
  const picked = formatPickedDate(d.createdAt);
  const firstPoster = d.titles.find((t) => t.image)?.image ?? null;

  const head = `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${smartBannerMeta(canonical)}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Videx">
<meta property="og:title" content="${esc(d.label)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${firstPoster ? `<meta property="og:image" content="${esc(firstPoster)}">` : ''}
<meta name="twitter:card" content="${firstPoster ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(d.label)}">
<meta name="twitter:description" content="${esc(desc)}">
${firstPoster ? `<meta name="twitter:image" content="${esc(firstPoster)}">` : ''}`;

  const posters = d.titles
    .filter((t) => t.image)
    .slice(0, ROOM_POSTER_LIMIT)
    .map((t) => {
      const alt = t.year ? `${t.title} (${t.year})` : t.title;
      return `<li><img src="${esc(t.image)}" alt="${esc(alt)}" loading="lazy" width="160" height="240"></li>`;
    })
    .join('');

  const body = `  <p class="kicker">Mood room</p>
  <h1>${esc(d.label)}</h1>
  <p class="muted">${countLabel(count, 'title')}${picked ? ` · picked on ${esc(picked)}` : ''}</p>
  ${d.description ? `<p class="desc">${esc(d.description)}</p>` : ''}

  ${posters ? `<ul class="grid">${posters}</ul>` : ''}

  <div class="cta">
    <a class="btn btn-primary" href="videx://room/${esc(d.id)}${DEEP_LINK_QUERY_MARK}">Open in the Videx app</a>
    ${storeCta(bucket)}
  </div>

  ${ATTRIBUTION_FOOTER}`;

  return renderDocument({ title: `${d.label} | Videx`, head, css: ROOM_CSS, body });
}

export function renderRoomNotFoundPage(bucket: PlatformBucket): string {
  return renderNotFoundPage('Room not found', "This shared room doesn't exist.", bucket);
}

export function renderListNotFoundPage(bucket: PlatformBucket): string {
  return renderNotFoundPage('List not found', "This list doesn't exist.", bucket);
}
