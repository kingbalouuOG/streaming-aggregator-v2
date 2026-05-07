// ============================================
// Shared CORS helper for user-callable Edge Functions
// IN-XPS-013 — pre-launch CORS tightening
// ============================================
//
// Replaces the prior `'Access-Control-Allow-Origin': '*'` posture on
// `render-foryou-rows` and `label-anchor-room`. Echoes the request
// origin only when it is allow-listed. Preflight from any other
// origin returns CORS-less, which the browser treats as rejected.
//
// Allow-list rules:
//   - Capacitor production WebView origins:
//       capacitor://localhost  (Android default)
//       https://localhost      (iOS default — included even though
//                               this build is Android-only, in case
//                               the pre-launch hardening lands ahead
//                               of an iOS spike)
//   - Local web dev: http://localhost(:port) — covers Vite (5173),
//     debug-server (3000), and any other localhost dev port.
//   - Live-reload over LAN IP (LIVE_RELOAD env in capacitor.config.ts):
//     read from VIDEX_ALLOWED_DEV_ORIGINS env var (comma-separated)
//     so dev origins can be added without code edits, and the prod
//     allow-list stays narrow.
//
// Cron-invoked Edge Functions (embed-new-titles, enrich-new-titles,
// refresh-service-fingerprints, sync-incremental) never face a
// browser and therefore do not need this helper.

const STATIC_ALLOWED_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
]);

const LOCALHOST_REGEX = /^http:\/\/localhost(:\d+)?$/;

function readDevOriginsFromEnv(): string[] {
  // Deno is the runtime in Edge Functions. Guarded for type-safety:
  // referencing Deno when running under tsc would error.
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  if (!env) return [];
  const raw = env.get('VIDEX_ALLOWED_DEV_ORIGINS');
  if (!raw) return [];
  return raw
    .split(',')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED_ORIGINS.has(origin)) return true;
  if (LOCALHOST_REGEX.test(origin)) return true;
  const devOrigins = readDevOriginsFromEnv();
  return devOrigins.includes(origin);
}

/** Build CORS response headers, echoing origin only when allow-listed. */
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin as string;
  }
  return headers;
}
