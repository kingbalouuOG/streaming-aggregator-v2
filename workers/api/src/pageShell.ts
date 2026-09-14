/**
 * Shared HTML shell for the Worker's public object pages (/t/, /room/,
 * /list/): document head, CSS, security headers, the UA-aware store CTA,
 * the iOS smart banner and the ?via= / ?src= attribution pass-through.
 * Extracted from titlePage.ts in Growth S1 so roomPage.ts renders the same
 * page. policyPages.ts and resetBridge.ts keep their own shells.
 *
 * Pure module — NO Hono/Workers imports — tested from the root vitest rig.
 *
 * Attribution and the edge cache: pages are cached for 24h keyed by object
 * id and platform bucket only, never by query string (a per-share cache
 * entry would defeat the cache). So pages are rendered with two markers in
 * the app-facing hrefs, and applyAttribution() fills them per request AFTER
 * the cache read. Nothing query-derived is ever stored.
 */

import { normaliseSrc, normaliseVia } from '../../../src/lib/growth/inboundLink';

/** Android is live on Google Play. */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=app.videx.streaming';

/** App Store Connect app id (native/eas.json submit.production.ios.ascAppId). */
export const APP_STORE_ID = '6785395342';

/**
 * iOS was submitted to the App Store on 10 Sept 2026 and is TestFlight-only
 * until approved. When the listing is live, set this to the real
 * https://apps.apple.com/... URL and flip IOS_APP_STORE_LIVE to true — the
 * iOS CTA then becomes a real link instead of the "coming soon" copy.
 * Single-const switch, no other edits.
 */
export const APP_STORE_URL = ''; // TODO: set when the App Store listing is live
export const IOS_APP_STORE_LIVE = false;

/** Coarse platform bucket for CTA rendering AND cache-key variance. */
export type PlatformBucket = 'android' | 'ios' | 'other';

/**
 * Classify a User-Agent string into a coarse platform bucket. Order
 * matters: iPadOS Safari can report "Macintosh", but genuine iOS devices
 * always carry iPhone/iPad/iPod, so we check those explicitly. Anything
 * not clearly Android or iOS (desktop, bots, unknown) → 'other', which
 * gets the neutral CTA. Bucketing (not full UA) keeps the cache to at
 * most 3 variants per page.
 */
export function platformBucket(userAgent: string | null | undefined): PlatformBucket {
  const ua = userAgent ?? '';
  // iOS first: an iPad/iPhone UA can also contain "Mac OS X" wording.
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** Minimal HTML escaper for interpolating cached title/label text. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Defence-in-depth headers on every browser-navigable HTML response. */
export const HTML_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

// ── Attribution pass-through ─────────────────────────────────────────
/** Placed at the end of a videx:// href; becomes "?via=…&amp;src=…" or "". */
export const DEEP_LINK_QUERY_MARK = '__VIDEX_DL_QUERY__';
/** Placed at the end of the Play href; becomes "&amp;referrer=via%3D…" or "". */
export const PLAY_REFERRER_MARK = '__VIDEX_PLAY_REFERRER__';

/**
 * Fill the attribution markers for one request. Values outside the
 * ADR-015 contract (via: share|push|seo|card|household, src: push|organic)
 * are dropped; valid ones pass through unchanged into the app deep link
 * and into the Play Install Referrer.
 */
export function applyAttribution(
  html: string,
  via: string | null | undefined,
  src: string | null | undefined,
): string {
  const pairs: string[] = [];
  const v = normaliseVia(via);
  const s = normaliseSrc(src);
  if (v) pairs.push(`via=${v}`);
  if (s) pairs.push(`src=${s}`);
  const deepLinkQuery = pairs.length ? `?${pairs.join('&amp;')}` : '';
  const playReferrer = pairs.length ? `&amp;referrer=${encodeURIComponent(pairs.join('&'))}` : '';
  return html.split(DEEP_LINK_QUERY_MARK).join(deepLinkQuery).split(PLAY_REFERRER_MARK).join(playReferrer);
}

/**
 * Render the store-download CTA button(s) for a platform bucket.
 *  - android: Play link.
 *  - ios: App Store link if live, else "Coming soon to the App Store".
 *  - other (desktop/unknown): neutral "Get Videx" (Play link) plus an
 *    "iOS coming soon" hint so both audiences see themselves.
 */
export function storeCta(bucket: PlatformBucket): string {
  const play = `${PLAY_STORE_URL}${PLAY_REFERRER_MARK}`;
  if (bucket === 'android') {
    return `<a class="btn btn-ghost" href="${play}">Get Videx on Android</a>`;
  }
  if (bucket === 'ios') {
    return IOS_APP_STORE_LIVE && APP_STORE_URL
      ? `<a class="btn btn-ghost" href="${esc(APP_STORE_URL)}">Get Videx on iOS</a>`
      : `<span class="btn btn-ghost btn-disabled" aria-disabled="true">Coming soon to the App Store</span>`;
  }
  return (
    `<a class="btn btn-ghost" href="${play}">Get Videx</a>` +
    (IOS_APP_STORE_LIVE && APP_STORE_URL ? '' : `<span class="cta-hint">iOS coming soon</span>`)
  );
}

/**
 * iOS Safari smart app banner. Safari shows it only once the app is on the
 * App Store in the visitor's region, so it is safe to ship before approval;
 * app-argument hands the canonical URL to the app when opened from it.
 */
export function smartBannerMeta(canonicalUrl: string): string {
  return `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${esc(canonicalUrl)}">`;
}

export const BASE_CSS = `:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0a0a0f;color:#f5f1e8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5}
.wrap{max-width:640px;margin:0 auto;padding:24px 20px 48px}
h1{font-size:26px;line-height:1.15;margin:0 0 6px}
.muted{color:rgba(245,241,232,.6)}
h2{font-size:13px;letter-spacing:1.4px;text-transform:uppercase;color:rgba(245,241,232,.6);margin:24px 0 8px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;align-items:center}
.btn{display:inline-block;padding:12px 20px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px}
.btn-primary{background:#e85d25;color:#fff}
.btn-ghost{background:#14141c;color:#f5f1e8;border:1px solid rgba(245,241,232,.16)}
.btn-disabled{opacity:.55;cursor:default}
.cta-hint{font-size:13px;color:rgba(245,241,232,.5)}
footer{margin-top:40px;font-size:12px;color:rgba(245,241,232,.4)}
footer a{color:rgba(245,241,232,.5)}`;

export const ATTRIBUTION_FOOTER = `<footer>
    <p>Streaming availability from the Streaming Availability API (Movie of the Night).</p>
    <p>This product uses the TMDb API but is not endorsed or certified by <a href="https://www.themoviedb.org/">TMDb</a>.</p>
  </footer>`;

export function renderDocument(opts: {
  title: string;
  /** Pre-escaped head markup (meta, link, extra style). */
  head?: string;
  /** Extra CSS appended to BASE_CSS. */
  css?: string;
  body: string;
  noindex?: boolean;
}): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
${opts.noindex ? '<meta name="robots" content="noindex">\n' : ''}${opts.head ?? ''}
<style>
${BASE_CSS}
${opts.css ?? ''}
</style>
</head>
<body>
<div class="wrap">
${opts.body}
</div>
</body>
</html>`;
}

/** Branded, noindex 404 with the platform CTA. */
export function renderNotFoundPage(heading: string, message: string, bucket: PlatformBucket): string {
  return renderDocument({
    title: `${heading} | Videx`,
    noindex: true,
    body: `  <h1>${esc(heading)}</h1>
  <p class="muted">${esc(message)}</p>
  <div class="cta">${storeCta(bucket)}</div>`,
  });
}
