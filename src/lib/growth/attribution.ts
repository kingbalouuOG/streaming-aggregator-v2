/**
 * Install identity and first-touch attribution (Growth G0-6, session S2).
 *
 * - Install id: a random UUID the app mints on first launch and keeps for
 *   the life of the install. Not a device or advertising identifier.
 * - First touch: the first thing that brought this install to Videx, written
 *   once and never overwritten. Sources, in priority order: an inbound link
 *   (+native-intent.tsx), then on Android the Play Install Referrer read on
 *   first launch (installReferrer.ts).
 *
 * Neither is cleared on sign-out; they go with the install. Server-side,
 * migration 090's delete_own_account removes the growth_events rows of every
 * install an account has used.
 *
 * Pure: the app passes its MMKV instance (native/src/installId.ts,
 * native/src/attribution.ts), the tests pass a Map-backed store.
 */

import {
  normaliseSrc,
  normaliseVia,
  type InboundLink,
  type InboundObject,
  type InboundObjectType,
  type SrcOrigin,
  type ViaChannel,
} from './inboundLink';
import { generateUuid, isUuid } from './uuid';

/** The subset of MMKV's API used here. */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  getAllKeys?(): string[];
}

export const INSTALL_ID_KEY = 'install_id';
export const PRIOR_INSTALL_KEY = 'install_prior';
export const FIRST_TOUCH_KEY = 'first_touch';
export const FIRST_OPEN_SENT_KEY = 'first_open_sent';
export const INSTALL_REFERRER_READ_KEY = 'install_referrer_read';

/**
 * supabase-js keeps its session under `sb-<ref>-auth-token` in the same
 * store. Present when the install id is first minted, it means the app was
 * in use before this code shipped: an update, not a new install.
 */
const SESSION_KEY_PREFIX = 'sb-';

export interface InstallIdentity {
  installId: string;
  /** True only on the call that created the id. */
  minted: boolean;
  /** The id was minted on an install that already had a signed-in session. */
  priorInstall: boolean;
}

export function resolveInstallId(
  store: KeyValueStore,
  mint: () => string = generateUuid,
): InstallIdentity {
  const existing = store.getString(INSTALL_ID_KEY);
  if (isUuid(existing)) {
    return {
      installId: existing.toLowerCase(),
      minted: false,
      priorInstall: store.getString(PRIOR_INSTALL_KEY) === '1',
    };
  }
  const priorInstall = (store.getAllKeys?.() ?? []).some((k) => k.startsWith(SESSION_KEY_PREFIX));
  const installId = mint().toLowerCase();
  store.set(INSTALL_ID_KEY, installId);
  if (priorInstall) store.set(PRIOR_INSTALL_KEY, '1');
  return { installId, minted: true, priorInstall };
}

export type FirstTouchSource = 'link' | 'install_referrer';

const FIRST_TOUCH_VERSION = 1;
const OBJECT_TYPES: readonly InboundObjectType[] = ['title', 'room', 'list'];

export interface FirstTouch {
  version: typeof FIRST_TOUCH_VERSION;
  source: FirstTouchSource;
  via: ViaChannel | null;
  src: SrcOrigin | null;
  objectType: InboundObjectType | null;
  objectId: string | null;
  /** ms epoch. */
  seenAt: number;
}

/** A touch worth recording: it names an object or carries attribution. */
export function firstTouchFromLink(
  link: InboundLink,
  source: FirstTouchSource,
  now: number,
): FirstTouch | null {
  if (!link.object && !link.via && !link.src) return null;
  return {
    version: FIRST_TOUCH_VERSION,
    source,
    via: link.via,
    src: link.src,
    objectType: link.object?.type ?? null,
    objectId: link.object?.id ?? null,
    seenAt: now,
  };
}

/** The stored first touch, or null if absent, stale-shaped or corrupt. */
export function readFirstTouch(store: KeyValueStore): FirstTouch | null {
  try {
    const raw = store.getString(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<FirstTouch> | null;
    if (!p || p.version !== FIRST_TOUCH_VERSION) return null;
    if (p.source !== 'link' && p.source !== 'install_referrer') return null;
    if (typeof p.seenAt !== 'number' || !Number.isFinite(p.seenAt)) return null;
    const objectType = OBJECT_TYPES.includes(p.objectType as InboundObjectType)
      ? (p.objectType as InboundObjectType)
      : null;
    const objectId = objectType && typeof p.objectId === 'string' ? p.objectId : null;
    return {
      version: FIRST_TOUCH_VERSION,
      source: p.source,
      via: normaliseVia(p.via),
      src: normaliseSrc(p.src),
      objectType: objectId ? objectType : null,
      objectId,
      seenAt: p.seenAt,
    };
  } catch {
    return null;
  }
}

/** Writes the touch only if none is stored. Returns whether it wrote. */
export function recordFirstTouch(store: KeyValueStore, touch: FirstTouch | null): boolean {
  if (!touch || readFirstTouch(store)) return false;
  store.set(FIRST_TOUCH_KEY, JSON.stringify(touch));
  return true;
}

/** via / src / object for a growth event, from a first touch (or none). */
export function attributionOf(touch: FirstTouch | null): {
  via: ViaChannel | null;
  src: SrcOrigin | null;
  object: InboundObject | null;
} {
  return {
    via: touch?.via ?? null,
    src: touch?.src ?? null,
    object: touch?.objectType && touch.objectId ? { type: touch.objectType, id: touch.objectId } : null,
  };
}

export function readFlag(store: KeyValueStore, key: string): boolean {
  return store.getString(key) === '1';
}

export function setFlag(store: KeyValueStore, key: string): void {
  store.set(key, '1');
}

/** True the first time it is called for `key` on this store, then false. */
export function claimOnce(store: KeyValueStore, key: string): boolean {
  if (readFlag(store, key)) return false;
  setFlag(store, key);
  return true;
}
