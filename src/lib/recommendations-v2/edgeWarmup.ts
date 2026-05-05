/**
 * IN-466 Variant A — fire-and-forget warmup for render-foryou-rows.
 *
 * App.tsx calls this once at boot (after auth + userPrefs resolve). It
 * fires the actual `render-foryou-rows` Edge Function with the user's
 * services, throws away the result, and lets the Deno instance + DB
 * connection + pgvector HNSW index stay hot for the user's first For You
 * navigation. Subsequent `tryRenderForYouEdge` call hits a warm path
 * (~800ms) instead of cold (5-12s).
 *
 * Earlier attempt warmed a separate `warmup-foryou` function — that
 * doesn't help, because Edge Function instances are per-function.
 *
 * Auth + token extraction logic deduplicated from `edgeRender.ts` —
 * both call sites used to have the same 15-line localStorage scan.
 */

import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';

const FUNCTION_PATH = '/functions/v1/render-foryou-rows';

/**
 * Read the supabase-js auth token from localStorage. Returns null if
 * no session exists or the entry is malformed.
 */
export function readAccessToken(): string | null {
  const tokenKey = Object.keys(localStorage).find(
    (k) => k.startsWith('sb-') && k.endsWith('-auth-token'),
  );
  if (!tokenKey) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(tokenKey) ?? 'null');
    return stored?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget hit on render-foryou-rows for warmup. Returns a
 * promise that resolves when the request completes (caller should
 * not await). Logs server status on success or warning on failure;
 * never throws.
 */
export async function warmRenderForYou(providerIds: number[]): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return;

  const accessToken = readAccessToken();
  if (!accessToken) return;

  const services = providerIds
    .map((id) => providerIdToServiceId(id))
    .filter(Boolean) as string[];
  if (services.length === 0) return;

  const t0 = Date.now();
  try {
    const res = await fetch(`${supabaseUrl}${FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ services }),
    });
    console.log(`[warmup] render-foryou-rows fire-and-forget: ${Date.now() - t0}ms (${res.status})`);
  } catch (err) {
    console.warn('[warmup] failed (harmless):', err);
  }
}
