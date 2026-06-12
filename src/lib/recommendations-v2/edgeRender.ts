/**
 * Client wrapper around the videx-api Worker's GET /v1/foryou (PLAT-3).
 *
 * Primary path for For You first paint. Returns a fully-built payload
 * that useForYouContent populates state from in one go. On any failure
 * (network error, 5xx, malformed JSON, safety timeout), returns null so
 * the hook falls through to the client-side pipeline — the D4
 * one-release fallback.
 *
 * History: this called the render-foryou-rows Supabase Edge Function
 * (IN-466) with a 1.5s bail-fast timeout because cold Deno instances
 * took 5–12s. Workers have no cold-start category and warm KV hits are
 * ~175ms, so the timeout is now a 10s SAFETY net against hung requests,
 * not a latency strategy — we no longer abandon a slow-but-succeeding
 * render to start a 2–3s client pipeline from zero.
 */

import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import type { ContentItem } from '@/components/ContentCard';
import type { SliderState } from '@/lib/taste-v2/types';
import type { CandidatePool, ExtendedTitleRow, MatchedTitle, PipelineContext } from './types';
import type { AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';

const PROXY_URL = import.meta.env.VITE_API_PROXY_URL as string | undefined;
// First-ever render for a user+services key runs ~9-15s (cold DB
// caches — same physics the Edge path had). Abandoning it at 10s just
// pays the equally-cold client pipeline on top (device pass 1 finding:
// the request was Canceled at 10s, then the fallback took another
// ~10s). 20s keeps the net as a hang guard, not a latency strategy;
// warm loads are ~175ms KV hits and never see it.
const SAFETY_TIMEOUT_MS = 20_000;

/**
 * Read the supabase-js auth token from localStorage. Returns null if
 * no session exists or the entry is malformed. (Lived in edgeWarmup.ts
 * until PLAT-3 deleted the warmup hack.)
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

interface BecauseYouWatchedRow {
  anchor: ContentItem;
  items: ContentItem[];
}

interface MoreFromPersonRow {
  personName: string;
  personType: 'director' | 'actor';
  items: ContentItem[];
}

/** Wire shape of the candidate pool. metadata serialises as Record on
 *  the wire (Map → "{}" via JSON), reconstructed to Map by reconstructPool. */
interface WorkerPoolWire {
  matched: MatchedTitle[];
  metadata: Record<string, ExtendedTitleRow>;
  fetchedAt: number;
  /** ENG-1: true when the server built the pool via the multi-interest path. */
  interleaved?: boolean;
}

export interface WorkerRenderPayload {
  recommendedForYou: ContentItem[];
  hiddenGems: ContentItem[];
  outsideYourUsual: ContentItem[];
  becauseYouWatched: BecauseYouWatchedRow[];
  moreFromPerson: MoreFromPersonRow | null;
  fromYourWatchlist: ContentItem[];
  anchorRooms: AnchorRoomPreview[];
  perAnchorLatencyMs: number[];
  sliders: SliderState;
  pool: CandidatePool;
  renderMs: number;
  /** Client-measured wallclock — for telemetry vs server renderMs. */
  wallclockMs: number;
}

export async function tryRenderForYouWorker(
  providerIds: number[],
  ctx?: PipelineContext,
): Promise<WorkerRenderPayload | null> {
  if (!PROXY_URL) return null;

  const services = providerIds
    .map((id) => providerIdToServiceId(id))
    .filter(Boolean) as string[];
  if (services.length === 0) return null;

  const accessToken = readAccessToken();
  if (!accessToken) return null;

  const t0 = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SAFETY_TIMEOUT_MS);

  // Phase 5 decision 9: pass the client's local hourOfDay (and
  // dayOfWeek for calendar-boundary safety) so the server scores
  // against the same time-of-day bucket. Server falls back to UTC.
  const params = new URLSearchParams({ services: services.join(',') });
  if (ctx?.hourOfDay != null) params.set('hour', String(ctx.hourOfDay));
  if (ctx?.dayOfWeek != null) params.set('dow', String(ctx.dayOfWeek));

  try {
    const res = await fetch(`${PROXY_URL}/v1/foryou?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[workerRender] HTTP ${res.status}; falling back to client pipeline`);
      return null;
    }

    const data = await res.json();
    const wallclockMs = Date.now() - t0;

    const pool = reconstructPool(data.pool as WorkerPoolWire);
    if (!pool) return null;

    return {
      ...data,
      pool,
      wallclockMs,
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      console.warn(`[workerRender] safety timeout after ${SAFETY_TIMEOUT_MS}ms; falling back to client pipeline`);
    } else {
      console.warn('[workerRender] failed; falling back to client pipeline:', err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Wire-shape pool → client shape (metadata Record→Map). Sanity-checks
 *  that a non-empty matched list arrives with non-empty metadata —
 *  if it doesn't, the wire format has drifted and we'd silently render
 *  zero rows. Returns null in that case so the caller falls back. */
function reconstructPool(wire: WorkerPoolWire): CandidatePool | null {
  const metaEntries = Object.entries(wire.metadata);
  if (wire.matched.length > 0 && metaEntries.length === 0) {
    console.warn('[workerRender] pool wire format drift: matched non-empty but metadata empty');
    return null;
  }
  return {
    matched: wire.matched,
    metadata: new Map(metaEntries),
    fetchedAt: wire.fetchedAt,
    interleaved: wire.interleaved,
  };
}
