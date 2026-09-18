/**
 * Session origin (Growth S4, plan G1-3, D13).
 *
 * Remembers, in memory, that the current app session was opened by a push
 * tap and which title the push was about. Two readers:
 *  - share events and share URLs carry src = 'push' | 'organic' for every
 *    share made in the session (getSessionSrc);
 *  - the detail page shows the "Tell someone" moment when the push's title
 *    is the one on screen (getSessionOrigin).
 *
 * The origin ends with the session: sessionId's onSessionReset fires when the
 * app returns after SESSION_TIMEOUT_MS in the background. A push tap that
 * wakes a long-backgrounded app races that reset (the tap and the foreground
 * event arrive in either order), so an origin set in the last
 * RESET_GRACE_MS survives it: a reset needs minutes in the background, so an
 * origin that fresh can only belong to the tap that woke the app.
 *
 * No React or React Native imports, so it runs under the root vitest rig.
 */

import type { InboundObject, SrcOrigin } from '../growth/inboundLink';
import { onSessionReset } from './sessionId';

export const RESET_GRACE_MS = 10_000;

export type PushOriginType = 'arrival' | 'leaving_soon' | 'bundle' | 'household_nudge';

export interface SessionOrigin {
  origin: 'push';
  /** The title (or, for a household nudge, the list) the push opened; null for a bundle (it lands on the watchlist). */
  object: InboundObject | null;
  type: PushOriginType;
  serviceId?: string | null;
  expiresOn?: string | null;
  /** Date.now() when the tap was handled. */
  at: number;
  /** The detail banner was closed; the session stays push-originated. */
  bannerDismissed?: boolean;
}

let current: SessionOrigin | null = null;
let subscribedToReset = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error('[sessionOrigin] listener threw:', err);
    }
  }
}

function onReset(): void {
  if (!current || Date.now() - current.at < RESET_GRACE_MS) return;
  current = null;
  notify();
}

export function setSessionOrigin(record: SessionOrigin): void {
  if (!subscribedToReset) {
    subscribedToReset = true;
    onSessionReset(onReset);
  }
  current = { ...record };
  notify();
}

export function getSessionOrigin(): SessionOrigin | null {
  return current;
}

/** 'push' for a session a push tap opened, otherwise 'organic'. */
export function getSessionSrc(): SrcOrigin {
  return current?.origin === 'push' ? 'push' : 'organic';
}

export function dismissSessionBanner(): void {
  if (!current || current.bannerDismissed) return;
  current = { ...current, bannerDismissed: true };
  notify();
}

/** For useSyncExternalStore. Returns an unsubscribe. */
export function subscribeSessionOrigin(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function __resetSessionOriginForTests(): void {
  current = null;
  subscribedToReset = false;
  listeners.clear();
}
