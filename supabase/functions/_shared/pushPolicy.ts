/**
 * Push policy shared by send-notifications and send-nudges (Growth G2 H4, plan D9).
 *
 *   Cap groups   titles    = arrival, leaving_soon (the 08:00 daily run)
 *                household = household_nudge (the 15-minute send-nudges run)
 *   Group cap    at most one push per group per 20 hours. The 20 hours are the
 *                daily run's window since H0: a slightly late 08:00 run still
 *                sends after yesterday's.
 *   Global floor at most 3 pushes per person per rolling 24 hours, across
 *                every group. With two groups the group caps usually bind
 *                first; the floor is the ceiling any future group inherits.
 *   Quiet hours  22:00 to 08:00 Europe/London, for nudges only. Title alerts
 *                keep their 08:00 UTC run (09:00 in summer) and are exempt.
 *   Nudge window the current UTC hour, truncated. The second unique index on
 *                notification_deliveries (migration 095) refuses a second
 *                nudge for the same person, list and window.
 *
 * Pure: Web APIs only (Date, Intl), no Deno or Supabase imports, so the root
 * vitest rig tests it (supabase/functions/_shared/__tests__/pushPolicy.test.ts).
 */

export type PushType = 'arrival' | 'leaving_soon' | 'household_nudge';
export type CapGroup = 'titles' | 'household';

export const GROUP_CAP_WINDOW_MS = 20 * 3600 * 1000;
export const GLOBAL_FLOOR_WINDOW_MS = 24 * 3600 * 1000;
export const GLOBAL_FLOOR_MAX = 3;

export const QUIET_TIME_ZONE = 'Europe/London';
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 8;

const HOUR_MS = 3600 * 1000;

export function capGroupFor(type: PushType): CapGroup {
  return type === 'household_nudge' ? 'household' : 'titles';
}

/** One notification_deliveries row, as the cap query reads it. */
export interface RecentDelivery {
  notification_type: string;
  sent_at: string;
  /** Null on rows written before 095; a legacy bundle's rows share sent_at instead. */
  push_id?: string | null;
}

const isPushType = (t: string): t is PushType =>
  t === 'arrival' || t === 'leaving_soon' || t === 'household_nudge';

const ageMs = (row: RecentDelivery, now: Date) => now.getTime() - Date.parse(row.sent_at);

/** A group has had a push inside the 20-hour window. */
export function hitGroupCap(recent: readonly RecentDelivery[], group: CapGroup, now: Date): boolean {
  return recent.some(
    (r) =>
      isPushType(r.notification_type) &&
      capGroupFor(r.notification_type) === group &&
      ageMs(r, now) < GROUP_CAP_WINDOW_MS,
  );
}

/**
 * Pushes (not rows) in the last 24 hours. A bundle writes one row per title,
 * all sharing a push_id (or, before 095, one INSERT and so one sent_at).
 */
export function pushesInFloorWindow(recent: readonly RecentDelivery[], now: Date): number {
  const pushes = new Set<string>();
  for (const r of recent) {
    if (ageMs(r, now) >= GLOBAL_FLOOR_WINDOW_MS) continue;
    pushes.add(r.push_id ?? `${r.notification_type}@${r.sent_at}`);
  }
  return pushes.size;
}

export function hitGlobalFloor(recent: readonly RecentDelivery[], now: Date): boolean {
  return pushesInFloorWindow(recent, now) >= GLOBAL_FLOOR_MAX;
}

/** Why a push of this type may not go now, or null when it may. */
export function capBlock(
  recent: readonly RecentDelivery[],
  type: PushType,
  now: Date,
): 'group' | 'global' | null {
  if (hitGroupCap(recent, capGroupFor(type), now)) return 'group';
  if (hitGlobalFloor(recent, now)) return 'global';
  return null;
}

/** The wall-clock hour (0 to 23) in a time zone, via Intl with the zone explicit. */
export function localHour(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number(hour);
}

/** 22:00 to 07:59 local time is quiet; 08:00 is not. */
export function isQuietHour(now: Date, timeZone: string = QUIET_TIME_ZONE): boolean {
  const h = localHour(now, timeZone);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** The current hour truncated in UTC: the nudge dedup bucket. */
export function nudgeWindowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}
