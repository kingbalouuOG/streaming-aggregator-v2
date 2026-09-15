/**
 * growth_events rows from the Worker (Growth G0-6, migration 090).
 *
 *  - validateGrowthEventBody: the only gate on POST /v1/growth/events. The
 *    insert is service-role, so nothing reaches the table that did not pass
 *    here. user_id is never read from the body; index.ts sets it from the
 *    verified JWT.
 *  - previewEventRow: the page handlers' preview_fetched / preview_opened.
 *  - rateLimitKey: the GROWTH_RATELIMIT key.
 *
 * Pure module, tested from the root vitest rig. The event contract itself
 * (names, body keys, object shapes) is src/lib/growth/growthEvents.ts, shared
 * with the app's emitter.
 */

import {
  APP_PLATFORMS,
  CLIENT_EVENT_NAMES,
  GROWTH_EVENT_BODY_KEYS,
  GROWTH_METADATA_MAX_BYTES,
  isGrowthObject,
  OBJECT_REQUIRED_EVENTS,
  PAGE_EVENT_NAMES,
  type GrowthEventName,
} from '../../../src/lib/growth/growthEvents';
import {
  normaliseSrc,
  normaliseVia,
  type InboundObject,
  type InboundObjectType,
  type SrcOrigin,
  type ViaChannel,
} from '../../../src/lib/growth/inboundLink';
import type { PlatformBucket } from './pageShell';
import type { UaClass } from './uaClass';

export const GROWTH_EVENT_BODY_MAX_BYTES = 4 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GrowthEventRow {
  event_name: GrowthEventName;
  install_id: string | null;
  user_id: string | null;
  via: ViaChannel | null;
  src: SrcOrigin | null;
  object_type: InboundObjectType | null;
  object_id: string | null;
  platform: string | null;
  ua_class: UaClass | null;
  delivery_id: string | null;
  metadata: Record<string, unknown>;
}

export type GrowthEventValidation =
  | { ok: true; value: Omit<GrowthEventRow, 'user_id'> }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** A string in the contract, dropped to null outside it; a non-string is an error. */
function contractValue<T>(
  raw: unknown,
  normalise: (v: string) => T | null,
): { ok: true; value: T | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  return { ok: true, value: normalise(raw) };
}

export function validateGrowthEventBody(body: unknown): GrowthEventValidation {
  if (!isRecord(body)) return { ok: false, error: 'body must be an object' };

  const allowed = GROWTH_EVENT_BODY_KEYS as readonly string[];
  const unknownKey = Object.keys(body).find((k) => !allowed.includes(k));
  if (unknownKey !== undefined) return { ok: false, error: `unknown key: ${unknownKey.slice(0, 40)}` };

  const name = body.event_name;
  if (typeof name !== 'string') return { ok: false, error: 'event_name must be a string' };
  if ((PAGE_EVENT_NAMES as readonly string[]).includes(name)) {
    return { ok: false, error: 'event_name is recorded by the server only' };
  }
  const eventName = CLIENT_EVENT_NAMES.find((n) => n === name);
  if (!eventName) return { ok: false, error: 'unknown event_name' };

  if (typeof body.install_id !== 'string' || !UUID_RE.test(body.install_id)) {
    return { ok: false, error: 'install_id must be a uuid' };
  }

  const platform = APP_PLATFORMS.find((p) => p === body.platform);
  if (!platform) return { ok: false, error: "platform must be 'ios' or 'android'" };

  const via = contractValue(body.via, normaliseVia);
  if (!via.ok) return { ok: false, error: 'via must be a string or null' };
  const src = contractValue(body.src, normaliseSrc);
  if (!src.ok) return { ok: false, error: 'src must be a string or null' };

  const objectType = body.object_type ?? null;
  const objectId = body.object_id ?? null;
  let object: InboundObject | null = null;
  if (objectType !== null || objectId !== null) {
    if (!isGrowthObject(objectType, objectId)) {
      return { ok: false, error: 'object_type and object_id do not describe an object' };
    }
    const type = objectType as InboundObjectType;
    const id = objectId as string;
    object = { type, id: type === 'room' ? id.toLowerCase() : id };
  }
  if (!object && OBJECT_REQUIRED_EVENTS.includes(eventName)) {
    return { ok: false, error: `${eventName} needs object_type and object_id` };
  }

  const deliveryId = body.delivery_id ?? null;
  if (deliveryId !== null && (typeof deliveryId !== 'string' || !UUID_RE.test(deliveryId))) {
    return { ok: false, error: 'delivery_id must be a uuid or null' };
  }

  const metadata = body.metadata ?? {};
  if (!isRecord(metadata)) return { ok: false, error: 'metadata must be an object' };
  if (utf8Length(JSON.stringify(metadata)) > GROWTH_METADATA_MAX_BYTES) {
    return { ok: false, error: `metadata exceeds ${GROWTH_METADATA_MAX_BYTES} bytes` };
  }

  return {
    ok: true,
    value: {
      event_name: eventName,
      install_id: body.install_id.toLowerCase(),
      via: via.value,
      src: src.value,
      object_type: object?.type ?? null,
      object_id: object?.id ?? null,
      platform,
      ua_class: null,
      delivery_id: typeof deliveryId === 'string' ? deliveryId.toLowerCase() : null,
      metadata,
    },
  };
}

/** Per install when the body names one, else per client IP. */
export function rateLimitKey(body: unknown, ip: string | null | undefined): string {
  const installId =
    isRecord(body) && typeof body.install_id === 'string' && UUID_RE.test(body.install_id)
      ? body.install_id.toLowerCase()
      : null;
  return installId ? `install:${installId}` : `ip:${ip || 'unknown'}`;
}

export function previewEventRow(input: {
  uaClass: UaClass;
  agent: string | null;
  platform: PlatformBucket;
  via: string | null | undefined;
  src: string | null | undefined;
  object: InboundObject;
}): GrowthEventRow {
  return {
    event_name: input.uaClass === 'crawler' ? 'preview_fetched' : 'preview_opened',
    install_id: null,
    user_id: null,
    via: normaliseVia(input.via),
    src: normaliseSrc(input.src),
    object_type: input.object.type,
    object_id: input.object.id,
    platform: input.platform,
    ua_class: input.uaClass,
    delivery_id: null,
    metadata: input.agent ? { agent: input.agent } : {},
  };
}
