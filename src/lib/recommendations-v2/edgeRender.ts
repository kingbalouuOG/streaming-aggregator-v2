/**
 * Client wrapper around the videx-api Worker's GET /v1/foryou (PLAT-3).
 *
 * Primary path for For You first paint. Returns a fully-built payload
 * that useForYouContent populates state from in one go.
 *
 * Failure contract (two distinct outcomes — do not conflate them):
 *   • Returns `null` when the Worker path DOESN'T APPLY — no proxy
 *     configured, no services selected, or signed out. Nothing to retry;
 *     the caller shows its "not ready" state.
 *   • THROWS a `WorkerRenderError` on a transport/server FAILURE —
 *     network error, non-2xx response, safety timeout, or wire-format
 *     drift. Callers that own a fallback (web: the client-side pipeline,
 *     the D4 one-release fallback) catch it and fall through; callers
 *     that don't (native For You) let it surface so TanStack Query
 *     retries and enters its error state. Previously these returned
 *     `null` too, which resolved the query as a "successful" empty —
 *     retries never fired and the null was cached (10-min staleTime) AND
 *     persisted to disk, so a transient blip could strand native cold
 *     starts in the empty "warming up" state (pre-launch review 2026-07-12).
 *
 * History: this called the render-foryou-rows Supabase Edge Function
 * (IN-466) with a 1.5s bail-fast timeout because cold Deno instances
 * took 5–12s. Workers have no cold-start category and warm KV hits are
 * ~175ms, so the timeout is now a 10s SAFETY net against hung requests,
 * not a latency strategy — we no longer abandon a slow-but-succeeding
 * render to start a 2–3s client pipeline from zero.
 */

import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import type { ContentItem } from '@/lib/types/content';
import type { SliderState } from '@/lib/taste-v2/types';
import type { AnchorRoomPreview, CandidatePool, ExtendedTitleRow, MatchedTitle, PipelineContext } from './types';
import { env } from '../env';
import { supabase } from '../supabase';

const PROXY_URL = env.API_PROXY_URL;
// First-ever render for a user+services key runs ~9-15s (cold DB
// caches — same physics the Edge path had). Abandoning it at 10s just
// pays the equally-cold client pipeline on top (device pass 1 finding:
// the request was Canceled at 10s, then the fallback took another
// ~10s). 20s keeps the net as a hang guard, not a latency strategy;
// warm loads are ~175ms KV hits and never see it.
const SAFETY_TIMEOUT_MS = 20_000;

/**
 * Read the current supabase access token via the official client API.
 * Returns null if no session exists.
 *
 * Was a synchronous localStorage scan (`sb-<ref>-auth-token`) until
 * NATIVE-2 W6 — that broke under Hermes (no localStorage) and tied the
 * engine to a web storage shape. `getSession()` is isomorphic: on web
 * it reads the same localStorage entry, on native it reads the MMKV
 * session store the native client is configured with. Async now.
 */
export async function readAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
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
  /** "New to rent or buy" — newest rent/buy titles on the user's services. */
  paidTitles: ContentItem[];
  anchorRooms: AnchorRoomPreview[];
  perAnchorLatencyMs: number[];
  sliders: SliderState;
  pool: CandidatePool;
  renderMs: number;
  /** Client-measured wallclock — for telemetry vs server renderMs. */
  wallclockMs: number;
}

/**
 * Thrown on a Worker transport/server failure (network error, non-2xx
 * response, safety timeout, or wire-format drift). Distinct from a `null`
 * return, which means the Worker path doesn't apply. See the module
 * doc-comment for the full contract.
 */
export class WorkerRenderError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'WorkerRenderError';
    this.status = status;
  }
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

  const accessToken = await readAccessToken();
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
      throw new WorkerRenderError(`worker responded HTTP ${res.status}`, res.status);
    }

    const data = await res.json();
    const wallclockMs = Date.now() - t0;

    const pool = reconstructPool(data.pool as WorkerPoolWire);
    if (!pool) throw new WorkerRenderError('worker pool wire-format drift');

    return {
      ...data,
      pool,
      wallclockMs,
    };
  } catch (err) {
    // Already classified — re-throw untouched so the status survives.
    if (err instanceof WorkerRenderError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new WorkerRenderError(`worker safety timeout after ${SAFETY_TIMEOUT_MS}ms`);
    }
    // Network error, JSON parse failure, etc.
    throw new WorkerRenderError(`worker request failed: ${(err as Error)?.message ?? String(err)}`);
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
