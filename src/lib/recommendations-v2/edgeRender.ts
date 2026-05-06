/**
 * Client wrapper around the render-foryou-rows Edge Function (IN-466).
 *
 * Primary path for For You first paint. Returns a fully-built payload
 * that useForYouContent populates state from in one go. On any failure
 * (timeout, 5xx, malformed JSON), returns null so the hook can fall
 * through to the existing client-side pipeline.
 *
 * Timeout: 1.5s. Cold Edge Function instances take 5-12s; we don't want
 * to block the user that long when the client-fallback path completes
 * in 2-3s. The 1.5s ceiling lets warm requests succeed (~800ms typical)
 * while bailing fast on cold instances. See IN-466 phase summary for
 * the latency profile that informed this number.
 */

import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { readAccessToken } from './edgeWarmup';
import type { ContentItem } from '@/components/ContentCard';
import type { SliderState } from '@/lib/taste-v2/types';
import type { CandidatePool, ExtendedTitleRow, MatchedTitle, PipelineContext } from './types';
import type { AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';

const FUNCTION_PATH = '/functions/v1/render-foryou-rows';
const TIMEOUT_MS = 1500;

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
interface EdgePoolWire {
  matched: MatchedTitle[];
  metadata: Record<string, ExtendedTitleRow>;
  fetchedAt: number;
}

export interface EdgeRenderPayload {
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

export async function tryRenderForYouEdge(
  providerIds: number[],
  ctx?: PipelineContext,
): Promise<EdgeRenderPayload | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const services = providerIds
    .map((id) => providerIdToServiceId(id))
    .filter(Boolean) as string[];
  if (services.length === 0) return null;

  const accessToken = readAccessToken();
  if (!accessToken) return null;

  const t0 = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Phase 5 decision 9: pass the client's local hourOfDay (and
  // dayOfWeek for calendar-boundary safety) in the body so the Edge
  // path scores against the same time-of-day bucket as the client
  // would. Edge falls back to UTC if absent.
  const body: { services: string[]; hourOfDay?: number; dayOfWeek?: number } = { services };
  if (ctx?.hourOfDay != null) body.hourOfDay = ctx.hourOfDay;
  if (ctx?.dayOfWeek != null) body.dayOfWeek = ctx.dayOfWeek;

  try {
    const res = await fetch(`${supabaseUrl}${FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[edgeRender] HTTP ${res.status}; falling back to client pipeline`);
      return null;
    }

    const data = await res.json();
    const wallclockMs = Date.now() - t0;

    const pool = reconstructPool(data.pool as EdgePoolWire);
    if (!pool) return null;

    return {
      ...data,
      pool,
      wallclockMs,
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      console.warn(`[edgeRender] timed out after ${TIMEOUT_MS}ms; falling back to client pipeline`);
    } else {
      console.warn('[edgeRender] failed; falling back to client pipeline:', err);
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
function reconstructPool(wire: EdgePoolWire): CandidatePool | null {
  const metaEntries = Object.entries(wire.metadata);
  if (wire.matched.length > 0 && metaEntries.length === 0) {
    console.warn('[edgeRender] pool wire format drift: matched non-empty but metadata empty');
    return null;
  }
  return {
    matched: wire.matched,
    metadata: new Map(metaEntries),
    fetchedAt: wire.fetchedAt,
  };
}
