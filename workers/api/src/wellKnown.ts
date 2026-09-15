/**
 * Association files for iOS universal links and Android app links
 * (Growth G0-3, ADR-015).
 *
 * Served by the Worker because the apex videxstreaming.com is the Vercel
 * marketing site: the dashboard route videxstreaming.com/.well-known/*
 * must point at videx-api or both files 404 and link verification fails
 * silently. Apple fetches the AASA through its CDN and refuses redirects,
 * so the route answers directly with application/json.
 *
 * Pure module (no Hono/Workers imports), tested from the root vitest rig.
 */

export const IOS_APP_ID = 'CT8F3578W8.app.videx.streaming';
export const ANDROID_PACKAGE = 'app.videx.streaming';

/** Path prefixes the app claims. native/app.json intentFilters must match. */
export const LINK_PATH_PREFIXES = ['/t/', '/room/', '/list/'] as const;

export const WELL_KNOWN_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * `components` is the iOS 13+ form; `appID` + `paths` and the empty
 * `apps` array are the legacy form older iOS reads. Newer iOS ignores
 * the legacy keys when `components` is present.
 */
export function appleAppSiteAssociation() {
  return {
    applinks: {
      apps: [] as string[],
      details: [
        {
          appIDs: [IOS_APP_ID],
          components: LINK_PATH_PREFIXES.map((p) => ({ '/': `${p}*` })),
          appID: IOS_APP_ID,
          paths: LINK_PATH_PREFIXES.map((p) => `${p}*`),
        },
      ],
    },
  };
}

const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * ASSETLINKS_FINGERPRINTS ([vars], comma-separated): the upload key and
 * the Play App Signing key. Malformed entries are dropped rather than
 * served, so a typo shows up as a missing key in `pm get-app-links`
 * instead of a JSON file Google rejects wholesale.
 */
export function parseFingerprints(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const fp = part.trim().toUpperCase();
    if (FINGERPRINT_RE.test(fp) && !out.includes(fp)) out.push(fp);
  }
  return out;
}

export function assetLinks(fingerprints: string[]) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
