/**
 * Public share / SEO title page renderer (H0 Stream B — Share v1).
 *
 * Pure module — NO Hono/Workers imports — so it runs under the root
 * vitest rig (see workers/api/src/__tests__/titlePage.test.ts), same as
 * policyPages.ts. index.ts wires it into the /t/:type/:id route.
 *
 * The store CTA is User-Agent aware (beta feedback 2026-07-09: the page
 * said "Get Videx on Android" to iPhone visitors). We bucket the UA into
 * a coarse platform (android | ios | other) and render the matching CTA.
 * That same bucket must be folded into the edge cache key (index.ts) so
 * an Android-rendered page is never served to an iOS visitor from cache.
 */

/** Android is live on Google Play. */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=app.videx.streaming';

/**
 * iOS is TestFlight-only today. When the App Store listing goes live,
 * set this to the real https://apps.apple.com/... URL and flip
 * IOS_APP_STORE_LIVE to true — the iOS CTA then becomes a real link
 * instead of the "coming soon" copy. Single-const switch, no other edits.
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
 * most 3 variants per title.
 */
export function platformBucket(userAgent: string | null | undefined): PlatformBucket {
  const ua = userAgent ?? '';
  // iOS first: an iPad/iPhone UA can also contain "Mac OS X" wording.
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

// service_id → display label (mirrors the native SERVICE_LABELS map).
export const SHARE_SERVICE_LABELS: Record<string, string> = {
  netflix: 'Netflix', prime: 'Prime Video', disney: 'Disney+', apple: 'Apple TV+',
  now: 'NOW', paramount: 'Paramount+', itvx: 'ITVX', channel4: 'Channel 4',
  bbc: 'BBC iPlayer', skygo: 'Sky Go',
};

/** Minimal HTML escaper for interpolating cached title/overview text. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface TitlePageData {
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  subscription: string[]; // service labels you can stream on
  rentBuy: string[]; // service labels for rent/buy
}

/**
 * Render the store-download CTA button(s) for a platform bucket.
 *  - android: Play link (existing behaviour).
 *  - ios: App Store link if live, else "Coming soon to the App Store".
 *  - other (desktop/unknown): neutral "Get Videx" (Play link) plus an
 *    "iOS coming soon" hint so both audiences see themselves.
 */
export function storeCta(bucket: PlatformBucket): string {
  if (bucket === 'android') {
    return `<a class="btn btn-ghost" href="${PLAY_STORE_URL}">Get Videx on Android</a>`;
  }
  if (bucket === 'ios') {
    return IOS_APP_STORE_LIVE && APP_STORE_URL
      ? `<a class="btn btn-ghost" href="${esc(APP_STORE_URL)}">Get Videx on iOS</a>`
      : `<span class="btn btn-ghost btn-disabled" aria-disabled="true">Coming soon to the App Store</span>`;
  }
  // Desktop / unknown: neutral primary label with the working Play link,
  // plus a note that iOS is on the way.
  return (
    `<a class="btn btn-ghost" href="${PLAY_STORE_URL}">Get Videx</a>` +
    `<span class="cta-hint">iOS coming soon</span>`
  );
}

export function renderTitlePage(
  type: string,
  id: number,
  d: TitlePageData,
  origin: string,
  bucket: PlatformBucket,
): string {
  const yearStr = d.year ? ` (${d.year})` : '';
  const pageTitle = `Where to watch ${d.title}${yearStr} in the UK | Videx`;
  const desc =
    d.subscription.length > 0
      ? `Stream ${d.title} on ${d.subscription.join(', ')}. See where to watch in the UK on Videx.`
      : `See where to watch ${d.title} in the UK on Videx.`;
  const deepLink = `videx://detail/${type}-${id}`;
  // Derived from the serving host (workers.dev today) — swap to the real
  // domain automatically once one fronts the Worker.
  const canonical = `${origin}/t/${type}/${id}`;

  const watchBlock =
    d.subscription.length > 0 || d.rentBuy.length > 0
      ? `
      ${d.subscription.length > 0
        ? `<section><h2>Stream now</h2><ul class="svc">${d.subscription
            .map((s) => `<li>${esc(s)}</li>`)
            .join('')}</ul></section>`
        : ''}
      ${d.rentBuy.length > 0
        ? `<section><h2>Rent or buy</h2><ul class="svc">${d.rentBuy
            .map((s) => `<li>${esc(s)}</li>`)
            .join('')}</ul></section>`
        : ''}`
      : `<section><p class="muted">We don't have current UK streaming info for this title yet.</p></section>`;

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="Videx">
<meta property="og:title" content="${esc(`${d.title}${yearStr}`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
${d.posterUrl ? `<meta property="og:image" content="${esc(d.posterUrl)}">` : ''}
<meta name="twitter:card" content="${d.posterUrl ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(`${d.title}${yearStr}`)}">
<meta name="twitter:description" content="${esc(desc)}">
${d.posterUrl ? `<meta name="twitter:image" content="${esc(d.posterUrl)}">` : ''}
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0a0a0f;color:#f5f1e8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5}
.wrap{max-width:640px;margin:0 auto;padding:24px 20px 48px}
.hero{display:flex;gap:16px;align-items:flex-start}
.poster{width:120px;height:180px;border-radius:12px;object-fit:cover;background:#14141c;flex:none}
h1{font-size:26px;line-height:1.15;margin:0 0 6px}
.year{color:rgba(245,241,232,.6);font-weight:400}
.muted{color:rgba(245,241,232,.6)}
h2{font-size:13px;letter-spacing:1.4px;text-transform:uppercase;color:rgba(245,241,232,.6);margin:24px 0 8px}
ul.svc{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
ul.svc li{background:#14141c;border:1px solid rgba(245,241,232,.12);border-radius:999px;padding:6px 14px;font-size:14px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;align-items:center}
.btn{display:inline-block;padding:12px 20px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px}
.btn-primary{background:#e85d25;color:#fff}
.btn-ghost{background:#14141c;color:#f5f1e8;border:1px solid rgba(245,241,232,.16)}
.btn-disabled{opacity:.55;cursor:default}
.cta-hint{font-size:13px;color:rgba(245,241,232,.5)}
.overview{margin-top:20px;color:rgba(245,241,232,.85)}
footer{margin-top:40px;font-size:12px;color:rgba(245,241,232,.4)}
footer a{color:rgba(245,241,232,.5)}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    ${d.posterUrl ? `<img class="poster" src="${esc(d.posterUrl)}" alt="${esc(d.title)} poster" width="120" height="180">` : ''}
    <div>
      <h1>${esc(d.title)} <span class="year">${esc(yearStr.trim())}</span></h1>
      <p class="muted">Where to watch in the UK</p>
    </div>
  </div>

  ${watchBlock}

  ${d.overview ? `<p class="overview">${esc(d.overview)}</p>` : ''}

  <div class="cta">
    <a class="btn btn-primary" href="${deepLink}">Open in the Videx app</a>
    ${storeCta(bucket)}
  </div>

  <footer>
    <p>Streaming availability from the Streaming Availability API (Movie of the Night).</p>
    <p>This product uses the TMDb API but is not endorsed or certified by <a href="https://www.themoviedb.org/">TMDb</a>.</p>
  </footer>
</div>
</body>
</html>`;
}

/** Small branded 404 for /t/ requests whose title isn't in the cache. */
export function renderTitleNotFoundPage(bucket: PlatformBucket): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Title not found | Videx</title>
<meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}
body{margin:0;background:#0a0a0f;color:#f5f1e8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5}
.wrap{max-width:640px;margin:0 auto;padding:48px 20px}
h1{font-size:26px;margin:0 0 8px}
.muted{color:rgba(245,241,232,.6)}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px;align-items:center}
.btn{display:inline-block;padding:12px 20px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px;background:#e85d25;color:#fff}
.btn-disabled{background:#14141c;color:#f5f1e8;border:1px solid rgba(245,241,232,.16);opacity:.55;cursor:default}
.cta-hint{font-size:13px;color:rgba(245,241,232,.5)}
</style>
</head>
<body>
<div class="wrap">
  <h1>Title not found</h1>
  <p class="muted">We don't have this title in the Videx catalogue.</p>
  <div class="cta">${storeCta(bucket)}</div>
</div>
</body>
</html>`;
}
