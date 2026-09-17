/**
 * First-touch attribution and growth events in the app (Growth G0-6, S2).
 *
 *  - recordInboundLink: +native-intent.tsx, for every system link. Records
 *    the first touch (if none yet) and posts link_opened for object links.
 *  - runFirstLaunchAttribution: RootLayout, once per launch. On Android it
 *    reads the Play Install Referrer once per install (first touch, and a
 *    pending link when the referrer names a title or room), then posts
 *    first_open once per install id.
 *  - emitSignupCompleted: curating.tsx, at the end of onboarding.
 *
 * Pure rules live in src/lib/growth (attribution.ts, installReferrer.ts,
 * growthEvents.ts). Everything here is best-effort: it never throws and
 * nothing awaits it before rendering.
 */

import { Platform } from 'react-native';

import { getReferrer } from '../modules/play-install-referrer';
import { env } from '@/lib/env';
import {
  attributionOf,
  claimOnce,
  FIRST_OPEN_SENT_KEY,
  firstTouchFromLink,
  INSTALL_REFERRER_READ_KEY,
  readFirstTouch as readStoredFirstTouch,
  readFlag,
  recordFirstTouch,
  setFlag,
  type FirstTouch,
} from '@/lib/growth/attribution';
import { postGrowthEvent, type GrowthEvent } from '@/lib/growth/growthEvents';
import type { InboundLink } from '@/lib/growth/inboundLink';
import { parseInstallReferrer } from '@/lib/growth/installReferrer';
import { supabase } from '@/lib/supabase';
import { getInstallId, installStore, isPriorInstall } from '@/installId';
import { readPendingLink, writePendingLink } from '@/pendingLink';

const PLATFORM = Platform.OS === 'ios' ? 'ios' : 'android';
const REFERRER_TIMEOUT_MS = 5_000;
// Distinguishes "Play took too long" from "no referrer": only the latter is final.
const REFERRER_TIMED_OUT = Symbol('referrer-timed-out');
// Expo Router can hand the same cold-start URL to the interceptor twice.
const LINK_DEDUPE_MS = 2_000;

export function readFirstTouch(): FirstTouch | null {
  try {
    return readStoredFirstTouch(installStore);
  } catch {
    return null;
  }
}

/** Fire-and-forget POST /v1/growth/events with the install id and session token. */
export function sendGrowthEvent(event: GrowthEvent): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await postGrowthEvent(event, {
        baseUrl: env.API_PROXY_URL,
        installId: getInstallId(),
        platform: PLATFORM,
        accessToken: data.session?.access_token ?? null,
      });
    } catch {
      // Dropped by design.
    }
  })();
}

let lastLinkOpened: { key: string; at: number } | null = null;

export function recordInboundLink(link: InboundLink): void {
  try {
    // An update from a pre-attribution build has no first touch to learn.
    if (!isPriorInstall()) recordFirstTouch(installStore, firstTouchFromLink(link, 'link', Date.now()));
    if (!link.object) return;

    const key = `${link.route}|${link.via ?? ''}|${link.src ?? ''}`;
    const now = Date.now();
    if (lastLinkOpened?.key === key && now - lastLinkOpened.at < LINK_DEDUPE_MS) return;
    lastLinkOpened = { key, at: now };

    sendGrowthEvent({ name: 'link_opened', object: link.object, via: link.via, src: link.src });
  } catch {
    // Never break the interceptor.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function readInstallReferrerOnce(): Promise<void> {
  if (Platform.OS !== 'android' || readFlag(installStore, INSTALL_REFERRER_READ_KEY)) return;
  if (isPriorInstall()) {
    // A months-old referrer must not hijack an existing user's next sign-in.
    setFlag(installStore, INSTALL_REFERRER_READ_KEY);
    return;
  }
  const raw = await withTimeout<string | null | typeof REFERRER_TIMED_OUT>(
    getReferrer(),
    REFERRER_TIMEOUT_MS,
    REFERRER_TIMED_OUT,
  );
  // A slow Play service on a cold first launch must not discard the only
  // deterministic install → object path: Play keeps the referrer for 90 days,
  // so leave the flag unset and read again next launch (sweep, TS 4).
  if (raw === REFERRER_TIMED_OUT) return;
  // Marked after the read, so a launch killed mid-read tries again.
  setFlag(installStore, INSTALL_REFERRER_READ_KEY);

  const link = parseInstallReferrer(raw);
  if (!link) return;
  recordFirstTouch(installStore, firstTouchFromLink(link, 'install_referrer', Date.now()));
  // The Android deferred deep link: land on the shared object after sign-up.
  // A link the user opened this launch takes precedence.
  if (link.object && !readPendingLink()) writePendingLink(link);
}

export async function runFirstLaunchAttribution(): Promise<void> {
  try {
    await readInstallReferrerOnce();
  } catch {
    // Fall through to first_open without a referrer.
  }
  try {
    if (!claimOnce(installStore, FIRST_OPEN_SENT_KEY)) return;
    const touch = readFirstTouch();
    sendGrowthEvent({
      name: 'first_open',
      ...attributionOf(touch),
      metadata: { touch: touch?.source ?? null, prior_install: isPriorInstall() },
    });
  } catch {
    // Dropped by design.
  }
}

export function emitSignupCompleted(touch: FirstTouch | null): void {
  sendGrowthEvent({
    name: 'signup_completed',
    ...attributionOf(touch),
    metadata: { touch: touch?.source ?? null },
  });
}
