/**
 * Deep Link Opener — React Native shadow of openDeepLink.ts
 * (NATIVE-1 W3). Replaces Capacitor's AppLauncher with RN Linking,
 * which dispatches the same Android ACTION_VIEW intent, so the
 * per-service App Links behaviour (Netflix opens the app, Prime falls
 * back to search) carries over unchanged. Confidence semantics and the
 * markDeepLinkExpected() race-avoidance ordering are identical to the
 * web/Capacitor implementation — see openDeepLink.ts for the full
 * Phase 0 instrumentation rationale.
 *
 * intent:// URIs: RN Linking does not parse Android intent URIs the
 * way Capacitor's AppLauncher did. We try openURL first (some OEM
 * resolvers accept it) and fall back to the embedded https:// URL.
 * No current service link resolves to intent:// (deepLinks.ts emits
 * https + search fallbacks), so this path is belt-and-braces.
 *
 * ── App-vs-browser reality per service (beta feedback 2026-07-09) ────
 * Founder reported links "sometimes still open in the browser" (Prime
 * especially). This is the OS App-Links / Universal-Links resolver's
 * call, NOT something openURL can force — RN Linking.openURL hands the
 * https URL to the platform, which opens the owning app IFF it is
 * installed and has verified that domain, else the browser. There is no
 * "force app" API on either platform for an https link, so the reliable
 * knob is which URL deepLinks.ts hands us (exact vs search).
 *
 *   Service      iOS (Universal Links)         Android (App Links)
 *   Netflix      app if installed              app if installed
 *   Disney+      app if installed              app if installed
 *   Prime Video  app if installed (reliable)   NO — always browser/shop;
 *                                              deepLinks.ts forces search
 *                                              on Android for this reason
 *   Channel 4    app if installed              app if installed
 *   Apple TV+    app if installed              browser (no verified app)
 *   ITVX/NOW/    app if installed, else web    varies; browser common
 *   Paramount+
 *   BBC iPlayer  search fallback (SA empty)    search fallback
 *   Sky Go       Google search fallback        Google search fallback
 *
 * canOpenURL is NOT a useful gate here: for https it returns true even
 * when only the browser can handle it, so it cannot distinguish "app
 * will open" from "browser will open". We therefore do not branch on it
 * and keep confidence tied to link_type (exact→high, search→low) — the
 * Phase-0 telemetry contract. Changing that would corrupt the
 * app-open-rate signal, so it stays put.
 */

import { Linking } from 'react-native';
import { emitDeepLinkClick } from './storage/interactions';
import { markDeepLinkExpected } from './lifecycle/appState';

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'intent:']);

/** Event context stamped on the deep_link_click interaction row.
 *  Duplicated from openDeepLink.ts — importing './openDeepLink' from
 *  here would self-resolve back to this .native file under Metro. */
export interface DeepLinkContext {
  contentId: number;
  mediaType: 'movie' | 'tv';
  serviceId: string;
  dwellSecondsBeforeClick: number;
  /** Whether the resolved URL is an exact deep link or a search-page
   *  fallback. Search fallbacks always emit confidence='low'. */
  linkType: 'exact' | 'search';
  /** Rent/buy price shown at click time as rendered (e.g. "Rent from
   *  £3.49"); null for flat-rate services with no price. Persisted as
   *  price_shown on the deep_link_click event (A2 / roadmap 0.3). */
  priceShown?: string | null;
}

export interface DeepLinkResult {
  /** 'high' if the exact-link dispatch succeeded, 'low' otherwise. */
  confidence: 'high' | 'low';
}

function intentFallbackUrl(url: string): string | null {
  const schemeMatch = url.match(/scheme=([^;]+)/);
  const hostMatch = url.match(/intent:\/\/([^#]+)/);
  if (schemeMatch && hostMatch) {
    return `${schemeMatch[1]}://${hostMatch[1]}`;
  }
  return null;
}

export async function openDeepLink(
  url: string,
  ctx: DeepLinkContext
): Promise<DeepLinkResult> {
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

  // Arm the correlation window BEFORE dispatching — the background
  // event can race ahead of the openURL promise (see openDeepLink.ts).
  markDeepLinkExpected();

  try {
    await Linking.openURL(url);
    const confidence: 'high' | 'low' = ctx.linkType === 'exact' ? 'high' : 'low';
    emitDeepLinkClick({ ...ctx, deepLinkUrl: url, confidence });
    return { confidence };
  } catch {
    if (url.startsWith('intent://')) {
      const fallback = intentFallbackUrl(url);
      if (fallback) {
        try {
          await Linking.openURL(fallback);
        } catch {
          // Both dispatches failed — still record the attempt below.
        }
      }
    }
    emitDeepLinkClick({ ...ctx, deepLinkUrl: url, confidence: 'low' });
    return { confidence: 'low' };
  }
}
