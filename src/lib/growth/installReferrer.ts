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
 * ("movie-603"), r = room uuid, l = shared list uuid and i = its household
 * invite token (uuid; G2 H3, read only beside l). One object per referrer:
 * a present l key wins over t, and t over r, even when the winner is refused. An organic Play install reports
 * "utm_source=google-play&utm_medium=organic", which parses to null.
 *
 * Pure: no React Native imports, so it runs under the root vitest rig and in
 * the Worker.
 */

import {
  inboundHref,
  isListId,
  isRoomId,
  normaliseInvite,
  normaliseSrc,
  normaliseVia,
  readQuery,
  tmdbId,
  type InboundLink,
  type InboundObject,
} from './inboundLink';

export const REFERRER_TITLE_KEY = 't';
export const REFERRER_ROOM_KEY = 'r';
export const REFERRER_LIST_KEY = 'l';
export const REFERRER_INVITE_KEY = 'i';

// A bare "movie-603" / "tv-095396" shape only (no path, no query); the
// contract itself (positive id, at most ten digits, leading zeros dropped) is
// the one parseInboundLink applies, through the same tmdbId.
const BARE_CONTENT_REF_RE = /^(movie|tv)-(\d{1,15})$/;

/** The title object parseInboundLink would produce for this content id, or null. */
function titleObject(contentId: string): InboundObject | null {
  const m = BARE_CONTENT_REF_RE.exec(contentId);
  const id = m ? tmdbId(m[2]) : null;
  // tmdbId is the whole rule (positive, at most ten digits, zeros dropped):
  // the result is a content id by construction.
  return m && id ? { type: 'title', id: `${m[1]}-${id}` } : null;
}

function roomObject(id: string): InboundObject | null {
  return isRoomId(id) ? { type: 'room', id: id.toLowerCase() } : null;
}

function listObject(id: string): InboundObject | null {
  return isListId(id) ? { type: 'list', id: id.toLowerCase() } : null;
}

const routeFor = (object: InboundObject) =>
  object.type === 'title' ? `/detail/${object.id}` : object.type === 'room' ? `/room/${object.id}` : `/list/${object.id}`;

/**
 * The raw (not yet URL-encoded) referrer for a page's Play link, or '' when
 * there is nothing to carry. Values outside the contract are dropped; the
 * invite is carried only with a list object.
 */
export function buildPlayReferrer(
  via: string | null | undefined,
  src: string | null | undefined,
  object?: InboundObject | null,
  invite?: string | null,
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
  } else if (object?.type === 'list') {
    const list = listObject(object.id);
    const token = normaliseInvite(invite);
    if (list) pairs.push(`${REFERRER_LIST_KEY}=${encodeURIComponent(list.id)}`);
    if (list && token) pairs.push(`${REFERRER_INVITE_KEY}=${encodeURIComponent(token)}`);
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
  const l = params.get(REFERRER_LIST_KEY);
  // Precedence by key presence, not validity: a refused list id does not fall
  // back to a title or room (the same rule as t over r).
  const target = l ? listObject(l) : t ? titleObject(t) : r ? roomObject(r) : null;
  const invite = target?.type === 'list' ? normaliseInvite(params.get(REFERRER_INVITE_KEY)) : null;

  if (!target && !via && !src) return null;
  // The list route carries its invite (the app pushes `route` as it is).
  const route = target ? inboundHref({ route: routeFor(target), object: target, invite }) : '/';
  return { route, object: target, via, src, invite };
}
