/**
 * Pending inbound link (Growth G0-2, ADR-015).
 *
 * A shared link can arrive before the app can honour it: signed out, or
 * mid sign-up and onboarding. +native-intent.tsx records every object link
 * here as it comes in; the record is resumed once, by the first of:
 *  - auth.tsx after a successful sign-in,
 *  - curating.tsx at the end of onboarding,
 * and dropped when the target screen itself is shown to a signed-in user
 * (detail/[id].tsx, room/[id].tsx), so a link opened while signed in never
 * resurfaces later. 24h TTL; cleared on sign-out with the onboarding draft.
 *
 * MMKV directly (synchronous), same pattern as onboardingDraft.ts: the
 * intent interceptor runs before React and cannot await.
 */

import { createMMKV } from 'react-native-mmkv';

import { isPendingLinkFresh, type InboundLink, type InboundObject } from '@/lib/growth/inboundLink';

const mmkv = createMMKV({ id: 'videx-pending-link' });
const KEY = 'pending';

// Bump when the shape changes so a stale-shaped record is ignored.
const VERSION = 1;

export interface PendingLink {
  version: number;
  route: string;
  object: InboundObject;
  via: InboundLink['via'];
  src: InboundLink['src'];
  /** ms epoch the link was opened. */
  seenAt: number;
}

/** Record an object link. Non-object links (home, reset bridge) are ignored. */
export function writePendingLink(link: InboundLink): void {
  if (!link.object) return;
  try {
    const record: PendingLink = {
      version: VERSION,
      route: link.route,
      object: link.object,
      via: link.via,
      src: link.src,
      seenAt: Date.now(),
    };
    mmkv.set(KEY, JSON.stringify(record));
  } catch {
    // Best-effort: a failed write only loses the resume, never the open.
  }
}

/** The live record, or null if absent, stale-shaped, corrupt or expired. */
export function readPendingLink(): PendingLink | null {
  try {
    const raw = mmkv.getString(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingLink;
    if (parsed?.version !== VERSION || typeof parsed.route !== 'string') {
      mmkv.remove(KEY);
      return null;
    }
    if (!isPendingLinkFresh(parsed.seenAt, Date.now())) {
      mmkv.remove(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Read and remove: the one-shot resume. */
export function consumePendingLink(): PendingLink | null {
  const record = readPendingLink();
  if (record) clearPendingLink();
  return record;
}

export function clearPendingLink(): void {
  try {
    mmkv.remove(KEY);
  } catch {
    // ignore
  }
}

/** Drop the record if it points at `route` (the target screen is showing). */
export function clearPendingLinkFor(route: string): void {
  if (readPendingLink()?.route === route) clearPendingLink();
}
