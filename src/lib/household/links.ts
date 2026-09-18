/**
 * Shared-list URLs (Growth G2, ADR-015 /list/{id} grammar, plan D4).
 *
 * The list's stable URL is its identity; an invite is a token on it:
 *   https://videxstreaming.com/list/{listId}                  (a member shares)
 *   https://videxstreaming.com/list/{listId}?invite={token}   (the owner invites)
 * withShareAttribution then appends via=household. The in-app route the link
 * resolves to is /list/{listId}?invite={token} (H3 delivers it).
 */

import { CANONICAL_ORIGIN } from '../growth/slug';

export function sharedListUrl(listId: string, inviteToken?: string | null): string {
  const base = `${CANONICAL_ORIGIN}/list/${encodeURIComponent(listId)}`;
  return inviteToken ? `${base}?invite=${encodeURIComponent(inviteToken)}` : base;
}

/** The in-app route of a list, the key clearPendingLinkFor matches on. */
export function sharedListRoute(listId: string): string {
  return `/list/${listId}`;
}
