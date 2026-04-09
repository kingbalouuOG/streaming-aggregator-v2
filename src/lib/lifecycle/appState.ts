/**
 * App Lifecycle Manager (IN-009)
 *
 * Centralises Capacitor's appStateChange handling so every consumer
 * (dwell timer, impression batcher, session ID) subscribes to a single
 * source of truth rather than registering competing @capacitor/app
 * listeners. Competing listeners fire in non-deterministic order.
 *
 * Also owns the deep-link correlation window: when the detail page
 * kicks off a deep-link launch, it calls markDeepLinkExpected() and
 * any background event that fires within the next DEEP_LINK_WINDOW_MS
 * is tagged with `expected: true` so the dwell timer can distinguish
 * "app backgrounded because user tapped Watch on Netflix" from
 * "app backgrounded because user pressed the home button".
 *
 * Graceful fallback on web: uses document.visibilitychange when
 * Capacitor is not running natively, so the web preview still fires
 * foreground/background transitions during development.
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

const DEEP_LINK_WINDOW_MS = 3_000;

export type LifecycleListener = (isActive: boolean, expected: boolean) => void;

type ImpressionFlusher = () => void | Promise<void>;

let isActive = true;
let deepLinkExpectedUntil = 0;
let initialised = false;

const listeners = new Set<LifecycleListener>();
let impressionFlusher: ImpressionFlusher | null = null;

function isDeepLinkExpectedNow(): boolean {
  return Date.now() < deepLinkExpectedUntil;
}

function handleStateChange(active: boolean): void {
  if (active === isActive) return;
  const expected = !active && isDeepLinkExpectedNow();
  isActive = active;
  for (const listener of listeners) {
    try {
      listener(active, expected);
    } catch (err) {
      console.error('[appState] listener threw:', err);
    }
  }
}

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;

  if (Capacitor.isNativePlatform()) {
    // Single source of truth for @capacitor/app appStateChange.
    // Any other listener in the app is a bug.
    void CapApp.addListener('appStateChange', ({ isActive: active }) => {
      handleStateChange(active);
    });
  } else if (typeof document !== 'undefined') {
    // Web fallback for the Vite dev preview.
    isActive = !document.hidden;
    document.addEventListener('visibilitychange', () => {
      handleStateChange(!document.hidden);
    });
  }
}

/**
 * Subscribe to foreground/background transitions.
 * Returns an unsubscribe function.
 */
export function subscribe(listener: LifecycleListener): () => void {
  ensureInitialised();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current foreground state. */
export function isForeground(): boolean {
  ensureInitialised();
  return isActive;
}

/**
 * Arm the 3-second deep-link correlation window. Any background
 * event that fires before the window closes will be delivered to
 * subscribers with `expected: true`.
 */
export function markDeepLinkExpected(): void {
  deepLinkExpectedUntil = Date.now() + DEEP_LINK_WINDOW_MS;
}

/**
 * Register the impression batcher's flush function. The lifecycle
 * manager itself does not own impression state — it just relays
 * "please flush now" calls.
 */
export function registerImpressionFlusher(fn: ImpressionFlusher | null): void {
  impressionFlusher = fn;
}

/**
 * Flush impressions via the registered flusher. No-op if no
 * flusher is registered yet.
 */
export function flushImpressions(): void {
  if (!impressionFlusher) return;
  try {
    const result = impressionFlusher();
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch((err) => {
        console.error('[appState] impression flusher rejected:', err);
      });
    }
  } catch (err) {
    console.error('[appState] impression flusher threw:', err);
  }
}
