/**
 * Push-token lifecycle + notification preferences (H0 Stream B, Notifications v1).
 *
 * Native-only (expo-notifications / expo-device). Lives OUTSIDE the
 * native/src/lib junction so it never bleeds into the shared web tree.
 *
 * Consent model: an Expo push token cannot be minted without the OS
 * notification permission, so writing a user_push_tokens row IS the record
 * of consent. The automatic ask (IN-GR-034) comes after onboarding, on For
 * You, behind a short in-app explainer (PushExplainerSheet) — never at cold
 * launch, and at most once per install and account. Per-type toggles live in
 * notification_preferences; the daily Edge Function filters on them server-side.
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  decidePushPrompt,
  parsePromptRecord,
  PROMPT_RECORD_ASKED,
  PROMPT_RECORD_DECLINED,
  toPushPermission,
  type PromptDecision,
} from '@/lib/notifications/promptDecision';
import storage from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export type NotificationType = 'arrival' | 'leaving_soon';

// Default-on: matches the DB's "absent pref row = enabled" contract (migration 056).
export const DEFAULT_PREFERENCES: Record<NotificationType, boolean> = {
  arrival: true,
  leaving_soon: true,
};

const ANDROID_CHANNEL_ID = 'default';
// MMKV bookkeeping so the automatic ask happens at most once per install and
// account (values in promptDecision.ts: asked / declined), and so this device's token can be cleared on sign-out without a network fetch.
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
  // Android 13+: the POST_NOTIFICATIONS dialog does not appear until a
  // channel exists. The provider creates it on mount; this makes the
  // request independent of that ordering.
  await ensureAndroidChannel();
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
 * so the NEXT user on this device gets their own explainer.
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
 * Should For You offer the notification explainer? Reads the OS permission
 * and this install's record; the rule itself is decidePushPrompt.
 */
export async function getPushPromptDecision(
  userId: string | null,
  pendingLink: boolean,
): Promise<PromptDecision> {
  try {
    if (!userId || !Device.isDevice) return 'skip';
    const [perm, raw] = await Promise.all([
      Notifications.getPermissionsAsync(),
      storage.getItem(PROMPT_SHOWN_KEY),
    ]);
    return decidePushPrompt({
      signedIn: true,
      isDevice: true,
      permission: toPushPermission(perm),
      record: parsePromptRecord(raw),
      pendingLink,
    });
  } catch (err) {
    console.warn('[push] getPushPromptDecision error:', (err as Error).message);
    return 'skip';
  }
}

/**
 * Explainer "Turn on": record the ask first (so a crash or kill mid-dialog
 * never re-asks), then show the system prompt and register on grant.
 */
export async function acceptPushPrompt(userId: string): Promise<boolean> {
  try {
    await storage.setItem(PROMPT_SHOWN_KEY, PROMPT_RECORD_ASKED);
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      await registerPushToken(userId);
      return true;
    }
    // Blocked since the explainer opened: the request would be a no-op.
    if (!existing.canAskAgain) return false;
    const granted = await requestPermission();
    if (granted) await registerPushToken(userId);
    return granted;
  } catch (err) {
    console.warn('[push] acceptPushPrompt error:', (err as Error).message);
    return false;
  }
}

/**
 * Explainer "Not now" (or dismissed): never ask automatically again on this
 * install for this account. Profile → Notifications stays the way back in.
 */
export async function declinePushPrompt(): Promise<void> {
  try {
    await storage.setItem(PROMPT_SHOWN_KEY, PROMPT_RECORD_DECLINED);
  } catch (err) {
    console.warn('[push] declinePushPrompt error:', (err as Error).message);
  }
}

/**
 * Explicit opt-in from the Profile → Notifications screen (user actively
 * asked to turn alerts on). Unlike the automatic explainer, this always tries to
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
