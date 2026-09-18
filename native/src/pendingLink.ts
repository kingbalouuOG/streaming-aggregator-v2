/**
 * Pending inbound link (Growth G0-2, ADR-015; version 2 since G2 H3).
 *
 * A shared link can arrive before the app can honour it: signed out, or
 * mid sign-up and onboarding. +native-intent.tsx records every object link
 * here as it comes in; the record is resumed by the first of:
 *  - auth.tsx after a successful sign-in,
 *  - curating.tsx at the end of onboarding,
 *  - the onboarding flow, for a provider identity that is already onboarded,
 * and dropped when the target screen reaches focus for a signed-in user
 * (useClearPendingLinkOnFocus in detail/[id].tsx and room/[id].tsx), so a
 * link opened while signed in never resurfaces later. 24h TTL; cleared on
 * sign-out with the onboarding draft.
 *
 * Shared household lists (G2) are stored deliberately, with intent 'join'
 * when the link carries an invite token, and `route` is the full router path
 * (/list/{id}?invite={token}). A resume never clears a list link: the list
 * screen clears it with clearPendingLinkFor once join_household resolves.
 * The record shape and rules are src/lib/growth/pendingLinkRecord.ts (pure,
 * tested); this file is the MMKV half.
 *
 * MMKV directly (synchronous), same pattern as onboardingDraft.ts: the
 * intent interceptor runs before React and cannot await.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { createMMKV } from 'react-native-mmkv';

import {
  buildPendingLink,
  clearsOnResume,
  parsePendingLink,
  pendingLinkMatches,
  type PendingLink,
  type PendingLinkInput,
} from '@/lib/growth/pendingLinkRecord';

export type { PendingLink, PendingLinkIntent } from '@/lib/growth/pendingLinkRecord';

const mmkv = createMMKV({ id: 'videx-pending-link' });
const KEY = 'pending';

/** Record an object link. Non-object links (home, reset bridge) are ignored. */
export function writePendingLink(link: PendingLinkInput): void {
  const record = buildPendingLink(link, Date.now());
  if (!record) return;
  try {
    mmkv.set(KEY, JSON.stringify(record));
  } catch {
    // Best-effort: a failed write only loses the resume, never the open.
  }
}

/** The live record, or null if absent, another version, corrupt or expired. */
export function readPendingLink(): PendingLink | null {
  try {
    const { record, discard } = parsePendingLink(mmkv.getString(KEY), Date.now());
    if (discard) mmkv.remove(KEY);
    return record;
  } catch {
    return null;
  }
}

/**
 * The resume: read the record and remove it, except a list link, which stays
 * until the list screen has resolved the join (see the header). Push
 * `record.route` as it is; it carries the list's ?invite=.
 */
export function consumePendingLink(): PendingLink | null {
  const record = readPendingLink();
  if (record && clearsOnResume(record)) clearPendingLink();
  return record;
}

export function clearPendingLink(): void {
  try {
    mmkv.remove(KEY);
  } catch {
    // ignore
  }
}

/**
 * Drop the record if it points at `route`'s screen (the query is ignored,
 * so '/list/{id}' clears '/list/{id}?invite=…'). The list screen calls this
 * after join_household resolves; other screens use the focus hook below.
 */
export function clearPendingLinkFor(route: string): void {
  if (pendingLinkMatches(readPendingLink(), route)) clearPendingLink();
}

/**
 * Clear the record for `route` when this screen reaches focus while `active`
 * (a signed-in user is looking at it). Keyed on focus, not on the session
 * appearing (IN-GR-040): a screen left mounted beneath /auth is not focused
 * when the sign-in lands, so it no longer drops the link before auth.tsx
 * resumes it. Pass active = false to skip (signed out, or no id yet).
 */
export function useClearPendingLinkOnFocus(route: string, active: boolean): void {
  useFocusEffect(
    useCallback(() => {
      if (active) clearPendingLinkFor(route);
    }, [route, active]),
  );
}
