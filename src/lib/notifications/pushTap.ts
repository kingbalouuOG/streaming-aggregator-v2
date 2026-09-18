/**
 * What a push tap means (Growth S4; household nudges G2 H4).
 *
 * The pure half of native/src/providers/notifications.tsx: where the tap
 * routes, which push type the session origin records, and the
 * notification_opened metadata. Lives in the shared lib only so the root
 * vitest rig can test it (native has no runner).
 *
 * The push `data` is written by supabase/functions/send-notifications/compose.ts
 * (arrival, leaving_soon, bundle) and supabase/functions/send-nudges/compose.ts
 * (household_nudge).
 */

import type { GrowthMetadata } from '../growth/growthEvents';
import { parseInboundLink, type InboundObject } from '../growth/inboundLink';
import type { PushOriginType } from '../instrumentation/sessionOrigin';

export interface PushPayload {
  url?: unknown;
  type?: unknown;
  delivery_id?: unknown;
  push_id?: unknown;
  service_id?: unknown;
  expires_on?: unknown;
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Unknown types still count as a bundle, as before; a nudge is its own. */
export function pushOriginType(type: string | null): PushOriginType {
  return type === 'arrival' || type === 'leaving_soon' || type === 'household_nudge' ? type : 'bundle';
}

/**
 * The expo-router path for a push url. Object links (title, room, list) go
 * through parseInboundLink, so videx://list/{id} lands on /list/{id} (G2 H3's
 * route); anything else keeps the old string strip (videx://watchlist →
 * /watchlist). Null when there is nothing routable.
 */
export function pushRoute(url: string): string | null {
  const parsed = parseInboundLink(url);
  if (parsed.object) return parsed.route;
  const path = url.startsWith('videx://') ? `/${url.slice('videx://'.length)}` : url;
  return path.startsWith('/') ? path : null;
}

export interface PushOpen {
  object: InboundObject | null;
  deliveryId: string | null;
  metadata: GrowthMetadata;
}

/**
 * notification_opened fields. metadata.type is the push type; push_id rides
 * when the push carried one (095), so a bundle's opens count once (IN-GR-026);
 * a nudge adds kind = 'household_nudge' (plan D13).
 */
export function pushOpen(payload: PushPayload, url: string): PushOpen {
  const { object } = parseInboundLink(url);
  const type = str(payload.type);
  const pushId = str(payload.push_id);
  const metadata: GrowthMetadata = { type };
  if (pushId) metadata.push_id = pushId;
  if (type === 'household_nudge') metadata.kind = 'household_nudge';
  return { object, deliveryId: str(payload.delivery_id), metadata };
}
