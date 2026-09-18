/**
 * Play Install Referrer: the builder the Worker's pages use and the parser
 * the app uses (Growth S2, plan D9 and D18).
 *
 * A title or room page puts the attribution and the object into its Play
 * link:
 *
 *   https://play.google.com/store/apps/details?id=app.videx.streaming
 *     &referrer=via%3Dshare%26src%3Dpush%26t%3Dmovie-603
 *
 * Play keeps the referrer through the install and hands the decoded string
 * ("via=share&src=push&t=movie-603") to the app through the Install Referrer
 * API (native/modules/play-install-referrer). On first launch the app records
 * it as the first touch and, when it names an object, as the pending link, so
 * the new user lands on that title or room after sign-up. This is the only
 * deterministic install-to-object path; iOS has none, by decision.
 *
 * Keys: via and src (the ADR-015 contract), t = title content id
 * ("movie-603"), r = room uuid. An organic Play install reports
 * "utm_source=google-play&utm_medium=organic", which parses to null.
 *
 * Pure: no React Native imports, so it runs under the root vitest rig and in
 * the Worker.
 */

import {
  isContentId,
  isRoomId,
  normaliseSrc,
  normaliseVia,
  readQuery,
  tmdbId,
  type InboundLink,
  type InboundObject,
} from './inboundLink';

export const REFERRER_TITLE_KEY = 't';
export const REFERRER_ROOM_KEY = 'r';

// A bare "movie-603" / "tv-095396" shape only (no path, no query); the
// contract itself (positive id, at most ten digits, leading zeros dropped) is
// the one parseInboundLink applies, through the same tmdbId and isContentId.
const BARE_CONTENT_REF_RE = /^(movie|tv)-(\d{1,15})$/;

/** The title object parseInboundLink would produce for this content id, or null. */
function titleObject(contentId: string): InboundObject | null {
  const m = BARE_CONTENT_REF_RE.exec(contentId);
  const id = m ? tmdbId(m[2]) : null;
  const normalised = m && id ? `${m[1]}-${id}` : null;
  return normalised && isContentId(normalised) ? { type: 'title', id: normalised } : null;
}

function roomObject(id: string): InboundObject | null {
  return isRoomId(id) ? { type: 'room', id: id.toLowerCase() } : null;
}

const routeFor = (object: InboundObject) =>
  object.type === 'title' ? `/detail/${object.id}` : `/room/${object.id}`;

/**
 * The raw (not yet URL-encoded) referrer for a page's Play link, or '' when
 * there is nothing to carry. Values outside the contract are dropped.
 */
export function buildPlayReferrer(
  via: string | null | undefined,
  src: string | null | undefined,
  object?: InboundObject | null,
): string {
  const pairs: string[] = [];
  const v = normaliseVia(via);
  const s = normaliseSrc(src);
  if (v) pairs.push(`via=${v}`);
  if (s) pairs.push(`src=${s}`);
  if (object?.type === 'title') {
    const title = titleObject(object.id);
    if (title) pairs.push(`${REFERRER_TITLE_KEY}=${encodeURIComponent(title.id)}`);
  } else if (object?.type === 'room') {
    const room = roomObject(object.id);
    if (room) pairs.push(`${REFERRER_ROOM_KEY}=${encodeURIComponent(room.id)}`);
  }
  return pairs.join('&');
}

/**
 * The install referrer as an InboundLink, or null when it carries nothing
 * Videx wrote (organic installs, other campaigns, empty).
 */
export function parseInstallReferrer(raw: string | null | undefined): InboundLink | null {
  if (typeof raw !== 'string') return null;
  const query = raw.trim().replace(/^\?/, '');
  if (!query) return null;

  const params = readQuery(query);
  const via = normaliseVia(params.get('via'));
  const src = normaliseSrc(params.get('src'));

  const t = params.get(REFERRER_TITLE_KEY);
  const r = params.get(REFERRER_ROOM_KEY);
  const target = t ? titleObject(t) : r ? roomObject(r) : null;

  if (!target && !via && !src) return null;
  return { route: target ? routeFor(target) : '/', object: target, via, src };
}
