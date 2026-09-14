/**
 * Inbound link mapping (Growth G0-2, ADR-015).
 *
 * Every system link the app receives (universal links, app links, the
 * videx:// scheme) passes through native/src/app/+native-intent.tsx, which
 * calls parseInboundLink to turn the public URL grammar into an Expo Router
 * route and to capture the attribution query:
 *
 *   https://videxstreaming.com/t/{movie|tv}/{tmdbId}[-{slug}] -> /detail/{type}-{id}
 *   https://videxstreaming.com/room/{uuid}                    -> /room/{uuid}
 *   https://videxstreaming.com/list/{id}                      -> /list/{id} (reserved, G2)
 *   videx://detail/{type}-{id}, videx://room/{uuid}           -> same routes
 *   videx://watchlist, videx://reset-password?...             -> passed through unchanged
 *   anything else                                             -> '/'
 *
 * ?via= is the URL channel and ?src= the originating session of a share.
 * Values outside the contract are dropped, not rewritten.
 *
 * Pure: no React Native imports, so it runs under the root vitest rig.
 */

export const VIA_CHANNELS = ['share', 'push', 'seo', 'card', 'household'] as const;
export type ViaChannel = (typeof VIA_CHANNELS)[number];

export const SRC_ORIGINS = ['push', 'organic'] as const;
export type SrcOrigin = (typeof SRC_ORIGINS)[number];

export const LINK_HOSTS = ['videxstreaming.com', 'www.videxstreaming.com'];

/** How long a link opened before sign-in waits to be resumed. */
export const PENDING_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export type InboundObjectType = 'title' | 'room' | 'list';

export interface InboundObject {
  type: InboundObjectType;
  /** "movie-603" for titles (the client content id), the uuid for rooms. */
  id: string;
}

export interface InboundLink {
  route: string;
  object: InboundObject | null;
  via: ViaChannel | null;
  src: SrcOrigin | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The G2 watchlists entity does not exist yet; accept a conservative id.
const LIST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isRoomId(id: string): boolean {
  return UUID_RE.test(id);
}

export function normaliseVia(raw: string | null | undefined): ViaChannel | null {
  return raw && (VIA_CHANNELS as readonly string[]).includes(raw) ? (raw as ViaChannel) : null;
}

export function normaliseSrc(raw: string | null | undefined): SrcOrigin | null {
  return raw && (SRC_ORIGINS as readonly string[]).includes(raw) ? (raw as SrcOrigin) : null;
}

/** True while a pending link recorded at `seenAt` may still be resumed. */
export function isPendingLinkFresh(seenAt: number, now: number): boolean {
  return Number.isFinite(seenAt) && now >= seenAt && now - seenAt < PENDING_LINK_TTL_MS;
}

const home = (): InboundLink => ({ route: '/', object: null, via: null, src: null });

/** First value per key; undecodable pairs are skipped. */
function readQuery(query: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of query.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawValue = eq === -1 ? '' : part.slice(eq + 1);
    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      if (!out.has(key)) out.set(key, decodeURIComponent(rawValue.replace(/\+/g, ' ')));
    } catch {
      // Malformed escapes: ignore the pair, keep the route.
    }
  }
  return out;
}

function tmdbId(digits: string): string | null {
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? String(n) : null;
}

export function parseInboundLink(input: string): InboundLink {
  const raw = (input ?? '').trim();

  let rest: string;
  let fromApp = false;
  const web = /^https?:\/\/([^/?#]+)(.*)$/i.exec(raw);
  if (web) {
    const host = web[1].toLowerCase().replace(/:\d+$/, '');
    if (!LINK_HOSTS.includes(host)) return home();
    rest = web[2] || '/';
  } else if (/^videx:/i.test(raw)) {
    // videx://detail/x and videx:///detail/x both mean /detail/x.
    rest = `/${raw.replace(/^videx:\/*/i, '')}`;
    fromApp = true;
  } else if (raw.startsWith('/')) {
    rest = raw;
    fromApp = true;
  } else {
    return home();
  }

  rest = rest.split('#')[0];
  const q = rest.indexOf('?');
  const path = (q === -1 ? rest : rest.slice(0, q)).replace(/\/+$/, '') || '/';
  const params = readQuery(q === -1 ? '' : rest.slice(q + 1));
  const via = normaliseVia(params.get('via'));
  const src = normaliseSrc(params.get('src'));

  const title =
    /^\/t\/(movie|tv)\/(\d+)(?:-[^/]*)?$/.exec(path) ??
    (fromApp ? /^\/detail\/(movie|tv)-(\d+)$/.exec(path) : null);
  if (title) {
    const id = tmdbId(title[2]);
    if (!id) return home();
    const contentId = `${title[1]}-${id}`;
    return { route: `/detail/${contentId}`, object: { type: 'title', id: contentId }, via, src };
  }

  const room = /^\/room\/([^/]+)$/.exec(path);
  if (room && isRoomId(room[1])) {
    const id = room[1].toLowerCase();
    return { route: `/room/${id}`, object: { type: 'room', id }, via, src };
  }

  const list = /^\/list\/([^/]+)$/.exec(path);
  if (list && LIST_ID_RE.test(list[1])) {
    return { route: `/list/${list[1]}`, object: { type: 'list', id: list[1] }, via, src };
  }

  if (fromApp && (path === '/watchlist' || path === '/reset-password')) {
    return { route: raw, object: null, via: null, src: null };
  }

  return home();
}
