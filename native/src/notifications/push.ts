/**
 * Push-token lifecycle + notification preferences (H0 Stream B, Notifications v1).
 *
 * Native-only (expo-notifications / expo-device). Lives OUTSIDE the
 * native/src/lib junction so it never bleeds into the shared web tree.
 *
 * Consent model: an Expo push token cannot be minted without the OS
 * notification permission, so writing a user_push_tokens row IS the record
 * of consent. We prompt for that permission at the user's FIRST VALUE MOMENT
 * (first watchlist add) — never at first launch. Per-type toggles live in
 * notification_preferences; the daily Edge Function filters on them server-side.
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import storage from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export type NotificationType = 'arrival' | 'leaving_soon';

// Default-on: matches the DB's "absent pref row = enabled" contract (migration 056).
export const DEFAULT_PREFERENCES: Record<NotificationType, boolean> = {
  arrival: true,
  leaving_soon: true,
};

const ANDROID_CHANNEL_ID = 'default';
// MMKV bookkeeping so the value-moment prompt fires at most once per device,
// and so this device's token can be cleared on sign-out without a network fetch.
const PROMPT_SHOWN_KEY = 'push_prompt_shown';
const TOKEN_KEY = 'push_token';

/** EAS projectId — required by getExpoPushTokenAsync on SDK 56. */
function getProjectId(): string | undefined {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  // easConfig is populated in built (non-Expo-Go) runtimes.
  const fromEas = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig
    ?.projectId;
  return fromConfig ?? fromEas;
}

/** Android requires a channel before notifications display. Idempotent. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Videx alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function isPermissionGranted(): Promise<boolean> {
  const perm = await Notifications.getPermissionsAsync();
  return perm.granted;
}

async function requestPermission(): Promise<boolean> {
  const perm = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return perm.granted;
}

/**
 * Register (or refresh) this device's Expo push token for the signed-in user.
 * Idempotent — safe to call on every app start / sign-in. Silent: never prompts.
 * No-op on simulators (no push tokens) or when permission isn't granted.
 */
// _userId: unused since migration 060 — claim_push_token derives the owner
// from auth.uid() server-side; kept in the signature so call sites still
// document whose token is being claimed.
export async function registerPushToken(_userId: string): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (!(await isPermissionGranted())) return null;
    await ensureAndroidChannel();

    const projectId = getProjectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token) return null;

    // SECURITY DEFINER RPC (migration 060): claims the token row for the
    // signed-in user even when a stale row is still owned by a previous
    // account (offline sign-out / reinstall) — the owner-only RLS on
    // user_push_tokens blocks a direct client upsert from moving that row.
    const { error } = await supabase.rpc('claim_push_token', {
      p_expo_push_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_device_name: Device.deviceName ?? undefined,
      p_app_version: Constants.expoConfig?.version ?? undefined,
    });
    if (error) {
      console.warn('[push] token claim failed:', error.message);
      return null;
    }
    // Persist locally so sign-out can delete exactly this token offline.
    await storage.setItem(TOKEN_KEY, token);
    return token;
  } catch (err) {
    console.warn('[push] registerPushToken error:', (err as Error).message);
    return null;
  }
}

/**
 * Clear this device's push token on sign-out. Deletes the DB row for the token
 * we stored at registration (no network re-fetch), then clears local bookkeeping
 * so the NEXT user on this device gets their own value-moment prompt.
 */
export async function clearPushToken(): Promise<void> {
  try {
    const token = await storage.getItem(TOKEN_KEY);
    if (token) {
      await supabase.from('user_push_tokens').delete().eq('expo_push_token', token);
    }
  } catch (err) {
    console.warn('[push] clearPushToken error:', (err as Error).message);
  } finally {
    await storage.multiRemove([TOKEN_KEY, PROMPT_SHOWN_KEY]);
  }
}

/**
 * First-value-moment consent prompt. Called after the user's first watchlist
 * add. Prompts the OS permission at most once per device (PROMPT_SHOWN_KEY),
 * then registers on grant. Respects a prior decision: if already granted, just
 * (re)registers silently; if previously denied, does nothing.
 */
export async function maybePromptForPush(userId: string | null): Promise<void> {
  try {
    if (!userId || !Device.isDevice) return;
    if ((await storage.getItem(PROMPT_SHOWN_KEY)) === '1') return;

    const existing = await Notifications.getPermissionsAsync();
    await storage.setItem(PROMPT_SHOWN_KEY, '1');

    if (existing.granted) {
      await registerPushToken(userId);
      return;
    }
    // Respect a permanent denial — don't surface a no-op prompt. canAskAgain
    // is true while undetermined (first run) and false once blocked.
    if (!existing.canAskAgain) return;
    const granted = await requestPermission();
    if (granted) await registerPushToken(userId);
  } catch (err) {
    console.warn('[push] maybePromptForPush error:', (err as Error).message);
  }
}

/**
 * Explicit opt-in from the Profile → Notifications screen (user actively
 * asked to turn alerts on). Unlike maybePromptForPush, this always tries to
 * obtain permission and reports the outcome so the UI can route a blocked
 * user to OS settings.
 */
export async function enableNotifications(
  userId: string,
): Promise<'granted' | 'denied' | 'blocked' | 'unsupported'> {
  if (!Device.isDevice) return 'unsupported';
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    await registerPushToken(userId);
    return 'granted';
  }
  if (!existing.canAskAgain) {
    return 'blocked'; // permanently denied — must be re-enabled in OS settings
  }
  const granted = await requestPermission();
  if (granted) {
    await registerPushToken(userId);
    return 'granted';
  }
  const after = await Notifications.getPermissionsAsync();
  return after.canAskAgain ? 'denied' : 'blocked';
}

// ── Preferences ──────────────────────────────────────────
export async function fetchPreferences(
  userId: string,
): Promise<Record<NotificationType, boolean>> {
  const prefs = { ...DEFAULT_PREFERENCES };
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('notification_type, enabled')
    .eq('user_id', userId);
  if (error) return prefs;
  for (const row of data ?? []) {
    if (row.notification_type in prefs) {
      prefs[row.notification_type as NotificationType] = row.enabled;
    }
  }
  return prefs;
}

export async function setPreference(
  userId: string,
  type: NotificationType,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.from('notification_preferences').upsert(
    { user_id: userId, notification_type: type, enabled, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,notification_type' },
  );
  if (error) throw error;
}
