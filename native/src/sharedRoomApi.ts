/**
 * Shared room snapshots over the videx-api Worker (Growth G0-4).
 *
 *  - fetchSharedRoom: GET /v1/room/:id, the same read path as the public
 *    page at https://videxstreaming.com/room/:id. No auth: a snapshot is
 *    public by design, and a signed-out recipient can see it.
 *  - createRoomShare: POST /v1/share/room with the user's Supabase JWT;
 *    returns the canonical room URL, or null when it could not be made.
 */

import { env } from '@/lib/env';
import type {
  ShareRoomRequest,
  ShareRoomResponse,
  SharedRoomPayload,
} from '@/lib/growth/roomSnapshot';
import { readAccessToken } from '@/lib/recommendations-v2/edgeRender';

const TIMEOUT_MS = 10_000;

export class SharedRoomNotFoundError extends Error {}

function apiBase(): string | null {
  return env.API_PROXY_URL?.replace(/\/$/, '') ?? null;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSharedRoom(id: string): Promise<SharedRoomPayload> {
  const base = apiBase();
  if (!base) throw new Error('API proxy not configured');
  const res = await fetchWithTimeout(`${base}/v1/room/${encodeURIComponent(id)}`);
  if (res.status === 404) throw new SharedRoomNotFoundError('room not found');
  if (!res.ok) throw new Error(`room fetch failed: ${res.status}`);
  return (await res.json()) as SharedRoomPayload;
}

export async function createRoomShare(body: ShareRoomRequest): Promise<string | null> {
  const base = apiBase();
  const token = await readAccessToken();
  if (!base || !token) return null;
  try {
    const res = await fetchWithTimeout(`${base}/v1/share/room`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ShareRoomResponse;
    return data.url ?? null;
  } catch {
    return null;
  }
}
