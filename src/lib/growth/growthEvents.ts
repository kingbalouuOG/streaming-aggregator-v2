/**
 * growth_events: the contract shared by the app emitter and the Worker
 * ingest, plus the app's one fetch (Growth G0-6, migration 090, plan D10).
 *
 * Every event lands in one table, written only by the videx-api Worker:
 *  - preview_fetched / preview_opened come from the Worker's own page
 *    handlers (a crawler unfurling a link vs a person opening it);
 *  - everything else is posted by the app to POST /v1/growth/events.
 *
 * postGrowthEvent is fire-and-forget: no retry queue, a failure is dropped,
 * it never throws and nothing awaits it before rendering. The app never sends
 * a user id; the Worker attaches one from the verified Bearer token.
 *
 * Pure apart from that one fetch: no React Native or env imports, so it runs
 * under the root vitest rig and inside the Worker bundle.
 */

import type { FirstTouchSource } from './attribution';
import {
  isRoomId,
  normaliseSrc,
  normaliseVia,
  type InboundObject,
  type InboundObjectType,
  type SrcOrigin,
  type ViaChannel,
} from './inboundLink';

export const GROWTH_EVENT_NAMES = [
  'preview_fetched',
  'preview_opened',
  'link_opened',
  'first_open',
  'signup_completed',
  'share_initiated',
  'share_completed',
  'notification_opened',
] as const;
export type GrowthEventName = (typeof GROWTH_EVENT_NAMES)[number];

/** Written by the Worker's page handlers only; the ingest refuses them. */
export const PAGE_EVENT_NAMES = ['preview_fetched', 'preview_opened'] as const;
export type PageEventName = (typeof PAGE_EVENT_NAMES)[number];
export type ClientEventName = Exclude<GrowthEventName, PageEventName>;

export const CLIENT_EVENT_NAMES: readonly ClientEventName[] = [
  'link_opened',
  'first_open',
  'signup_completed',
  'share_initiated',
  'share_completed',
  'notification_opened',
];

/** Events about one object must name it. */
export const OBJECT_REQUIRED_EVENTS: readonly ClientEventName[] = [
  'link_opened',
  'share_initiated',
  'share_completed',
];

export const APP_PLATFORMS = ['ios', 'android'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

export const GROWTH_METADATA_MAX_BYTES = 2048;
export const GROWTH_EVENTS_PATH = '/v1/growth/events';

export type GrowthMetadata = Record<string, string | number | boolean | null>;

// ADR-015 object shapes: title content id, room uuid, reserved list id.
const TITLE_OBJECT_RE = /^(movie|tv)-[1-9]\d{0,9}$/;
const LIST_OBJECT_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isGrowthObject(type: unknown, id: unknown): boolean {
  if (typeof id !== 'string') return false;
  if (type === 'title') return TITLE_OBJECT_RE.test(id);
  if (type === 'room') return isRoomId(id);
  if (type === 'list') return LIST_OBJECT_RE.test(id);
  return false;
}

interface Attributed {
  via: ViaChannel | null;
  src: SrcOrigin | null;
}

export type GrowthEvent =
  | (Attributed & { name: 'link_opened'; object: InboundObject })
  | (Attributed & {
      name: 'first_open';
      object: InboundObject | null;
      metadata: { touch: FirstTouchSource | null; prior_install: boolean };
    })
  | (Attributed & {
      name: 'signup_completed';
      object: InboundObject | null;
      metadata: { touch: FirstTouchSource | null };
    })
  | (Attributed & {
      name: 'share_initiated' | 'share_completed';
      object: InboundObject;
      metadata?: GrowthMetadata;
    })
  | (Attributed & {
      name: 'notification_opened';
      object: InboundObject | null;
      deliveryId: string | null;
      metadata?: GrowthMetadata;
    });

/** The POST body. Exactly these keys; the Worker rejects any other. */
export interface GrowthEventBody {
  event_name: ClientEventName;
  install_id: string;
  platform: AppPlatform;
  via: ViaChannel | null;
  src: SrcOrigin | null;
  object_type: InboundObjectType | null;
  object_id: string | null;
  delivery_id: string | null;
  metadata: GrowthMetadata;
}

export const GROWTH_EVENT_BODY_KEYS: readonly (keyof GrowthEventBody)[] = [
  'event_name',
  'install_id',
  'platform',
  'via',
  'src',
  'object_type',
  'object_id',
  'delivery_id',
  'metadata',
];

export interface GrowthEventContext {
  installId: string;
  platform: AppPlatform;
}

export function buildGrowthEventBody(event: GrowthEvent, ctx: GrowthEventContext): GrowthEventBody {
  return {
    event_name: event.name,
    install_id: ctx.installId,
    platform: ctx.platform,
    via: normaliseVia(event.via),
    src: normaliseSrc(event.src),
    object_type: event.object?.type ?? null,
    object_id: event.object?.id ?? null,
    delivery_id: event.name === 'notification_opened' ? event.deliveryId : null,
    metadata: 'metadata' in event && event.metadata ? { ...event.metadata } : {},
  };
}

export interface GrowthPostContext extends GrowthEventContext {
  /** env.API_PROXY_URL; nothing is sent when unset. */
  baseUrl: string | null | undefined;
  /** The Supabase access token when a session exists. */
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
}

const POST_TIMEOUT_MS = 10_000;

/** Fire-and-forget POST. Resolves (never rejects) whether or not it landed. */
export async function postGrowthEvent(event: GrowthEvent, ctx: GrowthPostContext): Promise<void> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), POST_TIMEOUT_MS) : null;
  try {
    const base = ctx.baseUrl?.replace(/\/+$/, '');
    if (!base) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ctx.accessToken) headers.Authorization = `Bearer ${ctx.accessToken}`;
    await (ctx.fetchImpl ?? fetch)(`${base}${GROWTH_EVENTS_PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildGrowthEventBody(event, ctx)),
      signal: controller?.signal,
    });
  } catch {
    // Dropped by design: telemetry never retries and never surfaces.
  } finally {
    if (timer) clearTimeout(timer);
  }
}
