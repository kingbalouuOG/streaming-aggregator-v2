/**
 * The signed-out face of a shared list (Growth G2; H2/H3 contract).
 *
 * H3 serves GET /v1/list/:id/preview from the videx-api Worker: public,
 * cached 60s, never a member name or the invite token. The list screen shows
 * it to a person who is signed out, or signed in but not a member. Until H3's
 * route is live the call 404s and the screen falls back to a generic preview;
 * the type below is the contract both sides build to.
 *
 * Pure apart from the one fetch (injectable), so it runs under the root
 * vitest rig.
 */

export interface ListPreview {
  id: string;
  name: string;
  household_name: string;
  count: number;
  /** Up to 6 TMDb poster paths ("/abc.jpg"). */
  posters: string[];
  members: number;
}

export const LIST_PREVIEW_MAX_POSTERS = 6;

export function listPreviewPath(listId: string): string {
  return `/v1/list/${encodeURIComponent(listId)}/preview`;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Validates a response body; null when it is not the contract shape. */
export function parseListPreview(body: unknown): ListPreview | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id) return null;
  if (typeof b.name !== 'string' || typeof b.household_name !== 'string') return null;
  if (!isCount(b.count) || !isCount(b.members)) return null;
  if (!Array.isArray(b.posters)) return null;
  const posters = b.posters
    .filter((p): p is string => typeof p === 'string' && p.startsWith('/'))
    .slice(0, LIST_PREVIEW_MAX_POSTERS);
  // Exactly the contract keys: anything else the Worker sent is dropped.
  return {
    id: b.id,
    name: b.name,
    household_name: b.household_name,
    count: b.count,
    posters,
    members: b.members,
  };
}

export interface ListPreviewOptions {
  /** env.API_PROXY_URL; null when unset. */
  baseUrl: string | null | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The preview, or null when there is none to show (no base URL, 404, a bad
 * body). Throws only on a network failure or a 5xx, so the screen can offer
 * a retry.
 */
export async function fetchListPreview(listId: string, opts: ListPreviewOptions): Promise<ListPreview | null> {
  const base = opts.baseUrl?.replace(/\/+$/, '');
  if (!base) return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000) : null;
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${base}${listPreviewPath(listId)}`, {
      signal: controller?.signal,
    });
    if (res.status >= 500) throw new Error(`list preview failed: ${res.status}`);
    if (!res.ok) return null;
    return parseListPreview(await res.json().catch(() => null));
  } finally {
    if (timer) clearTimeout(timer);
  }
}
