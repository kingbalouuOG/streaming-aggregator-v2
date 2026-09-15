/**
 * Install id (Growth G0-6, plan D17).
 *
 * A random UUID v4 the app mints on first launch and keeps in the 'videx'
 * MMKV store under 'install_id' (the same instance as
 * src/lib/storage.native.ts). Not a device or advertising identifier: no
 * expo-application, no permissions, gone when the app is uninstalled. It
 * survives sign-out, because sign-out removes named keys only.
 *
 * Resolved at module load, so it is minted before the rest of the app writes
 * the store. An install that already holds a Supabase session at that moment
 * is an update from a build without attribution (priorInstall), and its
 * first_open is flagged so the funnel can leave it out.
 */

import { createMMKV } from 'react-native-mmkv';

import { resolveInstallId, type InstallIdentity, type KeyValueStore } from '@/lib/growth/attribution';
import { generateUuid } from '@/lib/growth/uuid';

export const installStore: KeyValueStore = createMMKV({ id: 'videx' });

let identity: InstallIdentity | null = null;

function ensureIdentity(): InstallIdentity {
  if (!identity) {
    try {
      identity = resolveInstallId(installStore);
    } catch {
      // Storage failure: an in-memory id still lets this session's events
      // join up; the next launch retries the store.
      identity = { installId: generateUuid(), minted: true, priorInstall: false };
    }
  }
  return identity;
}

ensureIdentity();

export function getInstallId(): string {
  return ensureIdentity().installId;
}

export function isPriorInstall(): boolean {
  return ensureIdentity().priorInstall;
}
