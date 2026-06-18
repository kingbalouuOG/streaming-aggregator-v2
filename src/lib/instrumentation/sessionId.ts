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
  // crypto.randomUUID exists in modern WebViews/Node 19+ but NOT in Hermes
  // (React Native) — a bare `crypto` reference there is a ReferenceError.
  // A session id needs uniqueness, not cryptographic strength, so fall back
  // to a Math.random v4 when crypto is unavailable. Accessed via globalThis
  // so the absence is `undefined`, not a throw.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
