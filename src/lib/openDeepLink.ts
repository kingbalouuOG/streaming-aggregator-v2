/**
 * Deep Link Opener (IN-013)
 *
 * Opens a URL via Android's intent system or in a new browser tab on web.
 *
 * Uses @capacitor/app-launcher on native — dispatches through the OS
 * intent resolver to route to installed streaming apps.
 *
 * Supports:
 * - https:// URLs (App Links, web fallback)
 * - intent:// URIs (Android-specific, targets specific app packages)
 *
 * ─── Phase 0 instrumentation ─────────────────────────────────────
 *
 * Every deep link tap is emitted as a `deep_link_click` event into
 * user_interactions, tagged with a confidence level:
 *
 *   - 'high' — the primary AppLauncher.openUrl() succeeded. The user
 *              most likely landed in the target service's native app.
 *              Phase 3 treats this as a strong positive signal (+0.8).
 *
 *   - 'low'  — AppLauncher.openUrl() threw, and we fell back to
 *              window.open() with an http(s) URL. The user got the
 *              service's web interface instead of the app.
 *              Phase 3 discounts this (+0.4).
 *
 * On both branches we call appState.markDeepLinkExpected() so that
 * the subsequent background event (the app losing focus while the
 * target service opens) is delivered to the dwell timer with
 * `expected: true` and NOT treated as a session interruption.
 *
 * The caller is expected to call dwellTimer.exitDwell('deep_link_click')
 * after this promise resolves. As an additional safety net, the
 * dwell timer itself arms a 10-second fallback on `expected: true`
 * background that force-exits with 'deep_link_click' if the caller
 * never does.
 */

import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { emitDeepLinkClick } from './storage/interactions';
import { markDeepLinkExpected } from './lifecycle/appState';

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'intent:']);

/** Event context stamped on the deep_link_click interaction row. */
export interface DeepLinkContext {
  contentId: number;
  mediaType: 'movie' | 'tv';
  serviceId: string;
  dwellSecondsBeforeClick: number;
  /**
   * Whether the resolved URL is an exact deep link or a search-page
   * fallback. Search-fallback URLs always emit confidence='low' even
   * if AppLauncher.openUrl succeeds, because "success" here just
   * means the OS routed the intent somewhere — usually the browser
   * landing on a search results page, not the native app opening
   * the title's detail screen. See DeepLinkResult in deepLinks.ts.
   */
  linkType: 'exact' | 'search';
  /** Rent/buy price shown at click time as rendered (e.g. "Rent from
   *  £3.49"); null for flat-rate services with no price. Persisted as
   *  price_shown on the deep_link_click event (A2 / roadmap 0.3). */
  priceShown?: string | null;
}

export interface DeepLinkResult {
  /** 'high' if AppLauncher.openUrl succeeded, 'low' if we fell back to window.open. */
  confidence: 'high' | 'low';
}

export async function openDeepLink(
  url: string,
  ctx: DeepLinkContext
): Promise<DeepLinkResult> {
  // Validate URL protocol — allow HTTPS, HTTP, and intent:// (Android-specific).
  // On an invalid URL we still emit a low-confidence event so we have
  // a record of the attempt, then bail — no window is set because no
  // background is about to happen.
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      emitDeepLinkClick({ ...ctx, deepLinkUrl: url, confidence: 'low' });
      return { confidence: 'low' };
    }
  } catch {
    emitDeepLinkClick({ ...ctx, deepLinkUrl: url, confidence: 'low' });
    return { confidence: 'low' };
  }

  // Arm the correlation window BEFORE dispatching the deep link. On
  // Android, the intent dispatches and Videx can background before
  // the AppLauncher.openUrl promise resolves; if we set the window
  // AFTER the await, the background event races ahead with
  // expected=false, the dwell timer pauses, and the 5-minute
  // abandonment fallback can fire (exiting with 'app_backgrounded').
  // Setting it before the await eliminates the race regardless of
  // how the bridge schedules the intent dispatch vs. promise
  // resolution. Applies equally to the web window.open path.
  markDeepLinkExpected();

  if (Capacitor.isNativePlatform()) {
    try {
      await AppLauncher.openUrl({ url });
      // openUrl succeeded — but "success" here only means the OS
      // intent resolver accepted the URL. For exact deep links that
      // means we almost certainly landed in the target app. For
      // search-fallback URLs it typically means the browser opened
      // a search results page instead. Only the exact case is
      // high-confidence in the Signal Spec sense.
      const confidence: 'high' | 'low' = ctx.linkType === 'exact' ? 'high' : 'low';
      emitDeepLinkClick({ ...ctx, deepLinkUrl: url, confidence });
      return { confidence };
    } catch {
      // Fallback: if AppLauncher fails (e.g. intent:// not supported),
      // try opening the original web URL in the system browser.
      if (url.startsWith('intent://')) {
        // Extract the https:// URL from the intent URI for browser fallback.
        const schemeMatch = url.match(/scheme=([^;]+)/);
        const hostMatch = url.match(/intent:\/\/([^#]+)/);
        if (schemeMatch && hostMatch) {
          window.open(`${schemeMatch[1]}://${hostMatch[1]}`, '_system', 'noopener,noreferrer');
        }
      } else {
        window.open(url, '_system', 'noopener,noreferrer');
      }
      emitDeepLinkClick({ ...ctx, deepLinkUrl: url, confidence: 'low' });
      return { confidence: 'low' };
    }
  }

  // Web path (Vite preview / dev server). Always low-confidence
  // because there is no native app to route into.
  if (url.startsWith('intent://')) {
    const schemeMatch = url.match(/scheme=([^;]+)/);
    const hostMatch = url.match(/intent:\/\/([^#]+)/);
    if (schemeMatch && hostMatch) {
      window.open(`${schemeMatch[1]}://${hostMatch[1]}`, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  emitDeepLinkClick({ ...ctx, deepLinkUrl: url, confidence: 'low' });
  return { confidence: 'low' };
}
