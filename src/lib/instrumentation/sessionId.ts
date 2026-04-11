/**
 * Session ID Module (IN-006)
 *
 * Generates a UUID per app session. A session ends when the app
 * has been backgrounded for at least SESSION_TIMEOUT_MS; the next
 * foreground transition mints a new session id.
 *
 * Subscribes to the lifecycle manager so that consumers (dwell
 * timer, impression batcher, interaction emitters) can call
 * getCurrentSessionId() lazily without coordinating their own
 * lifecycle wiring.
 *
 * Session rollover fires registered onSessionReset callbacks so
 * stateful consumers (dwell timer's negative-weight accumulator,
 * impression batcher's per-session dedup set) can clear their
 * per-session state.
 */

import { subscribe } from '../lifecycle/appState';

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let currentSessionId: string | null = null;
let backgroundedAt: number | null = null;
let initialised = false;

const resetCallbacks = new Set<() => void>();

function generateUuid(): string {
  // crypto.randomUUID is available in modern WebViews and Node 19+.
  // Capacitor 8 targets Android API 23+, but the WebView is the
  // system WebView which on any device running Android 10+ supports
  // crypto.randomUUID. If we ever need to support older devices we
  // can polyfill here.
  return crypto.randomUUID();
}

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;

  subscribe((isActive) => {
    if (!isActive) {
      backgroundedAt = Date.now();
      return;
    }
    // Foreground: roll over the session if we were backgrounded
    // long enough.
    if (backgroundedAt !== null && Date.now() - backgroundedAt >= SESSION_TIMEOUT_MS) {
      currentSessionId = generateUuid();
      for (const cb of resetCallbacks) {
        try {
          cb();
        } catch (err) {
          console.error('[sessionId] reset callback threw:', err);
        }
      }
    }
    backgroundedAt = null;
  });
}

/**
 * Returns the current session id, generating one lazily if none
 * exists yet. Stable for the lifetime of a session; changes when
 * the app has been backgrounded for >= SESSION_TIMEOUT_MS.
 */
export function getCurrentSessionId(): string {
  ensureInitialised();
  if (currentSessionId === null) {
    currentSessionId = generateUuid();
  }
  return currentSessionId;
}

/**
 * Register a callback that fires when the session id rolls over
 * (after a >= 5-minute background). Returns an unsubscribe.
 *
 * Used by the dwell timer to reset its per-session negative-weight
 * accumulator and by the impression batcher's ContentRow dedup set.
 */
export function onSessionReset(cb: () => void): () => void {
  ensureInitialised();
  resetCallbacks.add(cb);
  return () => {
    resetCallbacks.delete(cb);
  };
}
