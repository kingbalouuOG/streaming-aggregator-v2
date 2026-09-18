/**
 * The pending inbound link record (ADR-015; version 2 since G2 H3).
 *
 * native/src/pendingLink.ts stores one of these in MMKV when a shared link
 * opens the app, so a signed-out recipient lands on the object after sign-in
 * or onboarding. This module is the pure half (shape, versioning, TTL and the
 * clearing rules), so it runs under the root vitest rig.
 *
 * Version 2 adds `intent` and `invite`. A shared household list link is
 * stored deliberately: 'join' when it carries an invite token, else 'open',
 * with `route` the full router path the list screen expects
 * (/list/{id}?invite={token}). Version-1 records are discarded on read; the
 * 24h TTL already bounds them.
 *
 * Clearing: title and room links are consumed when resumed and dropped when
 * their screen reaches focus for a signed-in user. A list link is never
 * cleared by a resume: the list screen clears it itself once join_household
 * has resolved (G2 plan §11b), so a failed join can still be retried after
 * the next sign-in.
 */

import {
  inboundHref,
  isPendingLinkFresh,
  normaliseInvite,
  type InboundLink,
  type InboundObject,
} from './inboundLink';

export const PENDING_LINK_VERSION = 2;

export type PendingLinkIntent = 'open' | 'join';

export interface PendingLink {
  version: typeof PENDING_LINK_VERSION;
  /** The router path to push on resume, query included (a list's ?invite=). */
  route: string;
  object: InboundObject;
  via: InboundLink['via'];
  src: InboundLink['src'];
  /** 'join' for a list link with an invite token; 'open' for everything else. */
  intent: PendingLinkIntent;
  /** The household invite token (list links only), or null. */
  invite: string | null;
  /** ms epoch the link was opened. */
  seenAt: number;
}

/** What a writer supplies: an InboundLink; `invite` may be omitted by callers that never carry one. */
export type PendingLinkInput = Pick<InboundLink, 'route' | 'object' | 'via' | 'src'> & {
  invite?: string | null;
};

/** The record to store for `link`, or null for a link that names no object (home, reset bridge). */
export function buildPendingLink(link: PendingLinkInput, now: number): PendingLink | null {
  if (!link.object) return null;
  if (link.object.type === 'list') {
    // Deliberate since H3: the list screen owns the join, the route carries the token.
    const invite = normaliseInvite(link.invite);
    return {
      version: PENDING_LINK_VERSION,
      route: inboundHref({ ...link, invite }),
      object: { type: 'list', id: link.object.id.toLowerCase() },
      via: link.via,
      src: link.src,
      intent: invite ? 'join' : 'open',
      invite,
      seenAt: now,
    };
  }
  return {
    version: PENDING_LINK_VERSION,
    route: link.route,
    object: link.object,
    via: link.via,
    src: link.src,
    intent: 'open',
    invite: null,
    seenAt: now,
  };
}

/**
 * The live record in `raw`, or null. `discard` is true when a stored value
 * exists but must be removed: corrupt, another version (v1 rows), or expired.
 */
export function parsePendingLink(
  raw: string | null | undefined,
  now: number,
): { record: PendingLink | null; discard: boolean } {
  if (!raw) return { record: null, discard: false };
  let parsed: Partial<PendingLink> | null;
  try {
    parsed = JSON.parse(raw) as Partial<PendingLink> | null;
  } catch {
    return { record: null, discard: true };
  }
  if (
    !parsed ||
    parsed.version !== PENDING_LINK_VERSION ||
    typeof parsed.route !== 'string' ||
    !parsed.object ||
    (parsed.intent !== 'open' && parsed.intent !== 'join') ||
    !isPendingLinkFresh(Number(parsed.seenAt), now)
  ) {
    return { record: null, discard: true };
  }
  return { record: parsed as PendingLink, discard: false };
}

/** A route without its query: '/list/{id}?invite=…' → '/list/{id}'. */
export function routePath(route: string): string {
  const q = route.indexOf('?');
  return q === -1 ? route : route.slice(0, q);
}

/** True when `record` points at the screen for `route` (the query is ignored). */
export function pendingLinkMatches(record: Pick<PendingLink, 'route'> | null, route: string): boolean {
  return !!record && routePath(record.route) === routePath(route);
}

/** Whether a resume (auth.tsx, curating.tsx, onboarding) removes the record: every link but a list. */
export function clearsOnResume(record: Pick<PendingLink, 'object'>): boolean {
  return record.object.type !== 'list';
}
