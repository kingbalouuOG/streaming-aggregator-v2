/**
 * Automatic notification-permission ask (IN-GR-034, Growth S5).
 *
 * The rule: once per install and account, after onboarding, For You shows a
 * short explainer ("Turn on" / "Not now") before the OS prompt. This module
 * is the pure decision behind that; native/src/notifications/push.ts reads
 * the OS permission and the local record and feeds them in. Lives in the
 * shared lib only so the root vitest rig can test it (native has no runner).
 */

/** The OS permission, reduced to what the decision needs. */
export type PushPermission = 'granted' | 'askable' | 'blocked';

/**
 * The local record of an automatic ask (MMKV `push_prompt_shown`), cleared
 * on sign-out so the next account on a shared phone gets its own ask.
 * 'asked': the system prompt was shown (also the legacy "1" value written
 * by the old first-watchlist-add trigger). 'declined': "Not now".
 */
export type PromptRecord = 'asked' | 'declined' | null;

export const PROMPT_RECORD_ASKED = '1';
export const PROMPT_RECORD_DECLINED = 'declined';

export function parsePromptRecord(raw: string | null | undefined): PromptRecord {
  if (raw === PROMPT_RECORD_DECLINED) return 'declined';
  // Any other non-empty value means the old trigger already asked.
  return raw ? 'asked' : null;
}

/**
 * Shape of expo-notifications' getPermissionsAsync() result that matters.
 * `status` is deliberately ignored below: on Android 13+ a fresh install
 * reports status 'denied' (notifications are disabled until
 * POST_NOTIFICATIONS is granted) with canAskAgain true, so only
 * canAskAgain separates "can still ask" from "blocked until Settings".
 * On iOS canAskAgain is false after any denial; on Android it turns false
 * after the second system-dialog denial.
 */
export interface OsPermission {
  granted: boolean;
  canAskAgain: boolean;
}

export function toPushPermission(perm: OsPermission): PushPermission {
  if (perm.granted) return 'granted';
  return perm.canAskAgain ? 'askable' : 'blocked';
}

export interface PromptInputs {
  signedIn: boolean;
  /** Simulators and emulators can't mint push tokens. */
  isDevice: boolean;
  permission: PushPermission;
  record: PromptRecord;
  /** A shared link is still waiting to be shown; the explainer must not cover it. */
  pendingLink: boolean;
}

/**
 * - 'explain': show the explainer now.
 * - 'register': already granted; register the token silently, no UI.
 * - 'wait': not now, but decide again on the next For You focus.
 * - 'skip': never ask automatically (Profile → Notifications is the way in).
 */
export type PromptDecision = 'explain' | 'register' | 'wait' | 'skip';

export function decidePushPrompt(input: PromptInputs): PromptDecision {
  if (!input.signedIn || !input.isDevice) return 'skip';
  if (input.permission === 'granted') return 'register';
  // Blocked: the system prompt would be a no-op, so the explainer would lie.
  if (input.permission === 'blocked') return 'skip';
  // At most one automatic ask per install and account.
  if (input.record !== null) return 'skip';
  if (input.pendingLink) return 'wait';
  return 'explain';
}
