/**
 * Deep Link Opener
 * Opens a URL via Android's intent system or in a new browser tab on web.
 *
 * Uses @capacitor/app-launcher on native — dispatches through the OS
 * intent resolver to route to installed streaming apps.
 *
 * Supports:
 * - https:// URLs (App Links, web fallback)
 * - intent:// URIs (Android-specific, targets specific app packages)
 */

import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'intent:']);

export async function openDeepLink(url: string): Promise<void> {
  // Validate URL protocol — allow HTTPS, HTTP, and intent:// (Android-specific)
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return;
  } catch {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await AppLauncher.openUrl({ url });
    } catch {
      // Fallback: if AppLauncher fails (e.g. intent:// not supported),
      // try opening the original web URL in the system browser
      if (url.startsWith('intent://')) {
        // Extract the https:// URL from the intent URI for browser fallback
        const schemeMatch = url.match(/scheme=([^;]+)/);
        const hostMatch = url.match(/intent:\/\/([^#]+)/);
        if (schemeMatch && hostMatch) {
          window.open(`${schemeMatch[1]}://${hostMatch[1]}`, '_system', 'noopener,noreferrer');
        }
      } else {
        window.open(url, '_system', 'noopener,noreferrer');
      }
    }
  } else {
    // On web, intent:// URIs don't work — extract the HTTPS URL
    if (url.startsWith('intent://')) {
      const schemeMatch = url.match(/scheme=([^;]+)/);
      const hostMatch = url.match(/intent:\/\/([^#]+)/);
      if (schemeMatch && hostMatch) {
        window.open(`${schemeMatch[1]}://${hostMatch[1]}`, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}
