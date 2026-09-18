/**
 * send-notifications Edge Function (H0 Stream B — Notifications v1)
 *
 * Daily cron (08:00 UTC, migration 059) — runs AFTER the 06:00 UTC content
 * sync so that day's streaming_history 'added' events are in place.
 *
 * Two free, opt-in alert types, both scoped to the user's own watchlist ×
 * their subscribed services:
 *   - arrival:      a watchlist title just landed on a service they have.
 *                   Source: streaming_history WHERE event_type='added'.
 *   - leaving_soon: a watchlist title on a service they have is expiring
 *                   within ~7 days. Source: streaming_availability.expires_on
 *                   (NEVER inferred from history — the sync writes SA
 *                   'expiring' as event_type='updated', an unusable signal).
 *
 * Guarantees:
 *   - Dedup: never notify twice for the same (user, type, title). Enforced by
 *     the UNIQUE index on notification_deliveries via ON CONFLICT DO NOTHING.
 *   - Cap: at most ONE title push per user per 20 hours (the 'titles' cap
 *     group in _shared/pushPolicy.ts), plus the global floor of 3 pushes per
 *     24 hours across groups. Household nudges (send-nudges) are their own
 *     group, so a nudge never blocks an arrival. Today's matches are BUNDLED
 *     into a single notification, so a catch-up sync that adds 50 titles
 *     still produces one push — no mass-firing. Title alerts keep their 08:00
 *     run and are exempt from the nudge quiet hours.
 *   - Consent: filters notification_preferences server-side (a disabled type is
 *     never sent, even from a stale client). Absent pref row = enabled (default-on).
 *   - Leaving-soon is kept cleanly separable (its own type + tier flag) so a
 *     future Premium gate is a one-line config change, not surgery.
 *
 * Also, at the start of each run: polls Expo push receipts for earlier sends
 * (title alerts and nudges share the table) and prunes dead tokens
 * (DeviceNotRegistered) from user_push_tokens. The Expo transport lives in
 * _shared/expoPush.ts (Growth G2 H4).
 *
 * Every push carries a push_id (migration 095): written on each claimed row
 * and sent in the payload, so a bundle's opens are counted once (IN-GR-026).
 *
 * Deploy: npx supabase functions deploy send-notifications --project-ref fmusugdcnnwiuzkbjquo
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

import {
  expoSend,
  pollReceiptsAndPrune,
  pruneSendTimeErrors,
  type ExpoMessage,
  type ExpoPushOptions,
  type PushToken,
} from '../_shared/expoPush.ts';
import { capBlock, GLOBAL_FLOOR_WINDOW_MS, type RecentDelivery } from '../_shared/pushPolicy.ts';
import {
  composeMessage,
  type Candidate,
  type ClaimedCandidate,
  type NotificationType,
  type PushData,
} from './compose.ts';

// ── Config ───────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Optional. When set, Expo enforces that only this project's server can send
// to its tokens (recommended once "Enhanced Security for Push" is on).
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
const EXPO: ExpoPushOptions = { accessToken: EXPO_ACCESS_TOKEN, logTag: '[send-notifications]' };

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Notification-type registry ───────────────────────────
// The single place gating lives. Leaving-soon ships FREE in v1; making it a
// Premium anchor later means flipping `tier: 'free'` → `tier: 'premium'` here
// and implementing userIsPremium() — no schema/pipeline surgery.
const NOTIFICATION_TYPES: Record<NotificationType, { tier: 'free' | 'premium' }> = {
  arrival: { tier: 'free' }, // free forever (retention loop + taste signal), strategy §5
  leaving_soon: { tier: 'free' }, // free in v1; future Premium anchor — flip tier here
};

// Placeholder for the future Premium gate. Everyone passes the 'free' tier;
// 'premium' types will additionally require this to return true.
function userTierAllows(type: NotificationType, _userId: string): boolean {
  const tier = NOTIFICATION_TYPES[type].tier;
  if (tier === 'free') return true;
  // TODO(premium): return await userIsPremium(userId)
  return false;
}

// ── Windows / caps ───────────────────────────────────────
// Arrival lookback: one daily cycle + margin for cron jitter / sync resume.
// Dedup makes a slightly wide window harmless (no double-sends).
const ARRIVAL_LOOKBACK_MS = 26 * 3600 * 1000;
// Leaving-soon horizon: alert when a title is within this many days of expiry.
const LEAVING_SOON_HORIZON_DAYS = 7;
// Caps (group rule and global floor) live in _shared/pushPolicy.ts.

// ── Per-user candidate gathering ─────────────────────────

/** Titles on the user's watchlist as a lookup set + display titles. */
async function getWatchlist(userId: string): Promise<Map<string, string>> {
  // Key: `${media_type}-${tmdb_id}` → title. Alerts are watchlist-scoped, so
  // this is the join spine for both alert types. Only "want to watch" rows —
  // no point alerting about something the user already marked watched.
  const { data, error } = await supabase
    .from('watchlist')
    .select('tmdb_id, media_type, title')
    .eq('user_id', userId)
    .eq('status', 'want_to_watch');
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(`${row.media_type}-${row.tmdb_id}`, row.title ?? 'A title');
  }
  return map;
}

/** Service ids the user subscribes to. */
async function getUserServices(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_services')
    .select('service_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.service_id));
}

/** Per-type enabled state. Absent row = enabled (default-on). */
async function getEnabledTypes(userId: string): Promise<Set<NotificationType>> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('notification_type, enabled')
    .eq('user_id', userId);
  if (error) throw error;
  const disabled = new Set(
    (data ?? []).filter((r) => r.enabled === false).map((r) => r.notification_type),
  );
  const enabled = new Set<NotificationType>();
  for (const t of Object.keys(NOTIFICATION_TYPES) as NotificationType[]) {
    if (!disabled.has(t) && userTierAllows(t, userId)) enabled.add(t);
  }
  return enabled;
}

/** Arrival candidates: watchlist × subscribed services × recent 'added' events. */
async function getArrivalCandidates(
  watchlist: Map<string, string>,
  services: Set<string>,
): Promise<Candidate[]> {
  if (watchlist.size === 0 || services.size === 0) return [];
  const sinceIso = new Date(Date.now() - ARRIVAL_LOOKBACK_MS).toISOString();
  const { data, error } = await supabase
    .from('streaming_history')
    .select('tmdb_id, media_type, service_id, recorded_at')
    .eq('event_type', 'added')
    // Watchable-included types only — rent/buy/addon catalogue churn must not fire "now streaming" alerts.
    .in('stream_type', ['subscription', 'free'])
    .in('service_id', [...services])
    .gte('recorded_at', sinceIso)
    .order('recorded_at', { ascending: false });
  if (error) throw error;

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const row of data ?? []) {
    const key = `${row.media_type}-${row.tmdb_id}`;
    if (!watchlist.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: 'arrival',
      tmdb_id: row.tmdb_id,
      media_type: row.media_type as 'movie' | 'tv',
      service_id: row.service_id,
      title: watchlist.get(key)!,
    });
  }
  return out;
}

/** Leaving-soon candidates: watchlist × subscribed services × expires_on window.
 *  Reads expires_on directly — never inferred from streaming_history. */
async function getLeavingSoonCandidates(
  watchlist: Map<string, string>,
  services: Set<string>,
): Promise<Candidate[]> {
  if (watchlist.size === 0 || services.size === 0) return [];
  const nowIso = new Date().toISOString();
  const horizonIso = new Date(
    Date.now() + LEAVING_SOON_HORIZON_DAYS * 24 * 3600 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from('streaming_availability')
    .select('tmdb_id, media_type, service_id, expires_on')
    // Watchable-included types only — an expiring rent/buy listing is not "leaving your subscription".
    .in('stream_type', ['subscription', 'free'])
    .in('service_id', [...services])
    .not('expires_on', 'is', null)
    .gte('expires_on', nowIso)
    .lte('expires_on', horizonIso);
  if (error) throw error;

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const row of data ?? []) {
    const key = `${row.media_type}-${row.tmdb_id}`;
    if (!watchlist.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: 'leaving_soon',
      tmdb_id: row.tmdb_id,
      media_type: row.media_type as 'movie' | 'tv',
      service_id: row.service_id,
      title: watchlist.get(key)!,
      expires_on: row.expires_on,
    });
  }
  return out;
}

/** Drop candidates already delivered (dedup pre-filter; the UNIQUE-index
 *  insert is the real guarantee, this just avoids composing sent titles). */
async function filterAlreadySent(userId: string, cands: Candidate[]): Promise<Candidate[]> {
  if (cands.length === 0) return [];
  const { data, error } = await supabase
    .from('notification_deliveries')
    .select('notification_type, tmdb_id, media_type')
    .eq('user_id', userId)
    .in('notification_type', ['arrival', 'leaving_soon']);
  if (error) throw error;
  const sent = new Set(
    (data ?? []).map((r) => `${r.notification_type}:${r.media_type}-${r.tmdb_id}`),
  );
  return cands.filter((c) => !sent.has(`${c.type}:${c.media_type}-${c.tmdb_id}`));
}

/**
 * True if a title push may not go to this user now: a title alert inside the
 * group's 20 hours, or 3 pushes of any type inside 24 hours (pushPolicy.ts).
 * A household nudge earlier today does not block it.
 */
async function hitDailyCap(userId: string): Promise<boolean> {
  const now = new Date();
  const sinceIso = new Date(now.getTime() - GLOBAL_FLOOR_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('notification_deliveries')
    .select('notification_type, sent_at, push_id')
    .eq('user_id', userId)
    .gte('sent_at', sinceIso);
  if (error) throw error;
  return capBlock((data ?? []) as RecentDelivery[], 'arrival', now) !== null;
}

// ── Main run ─────────────────────────────────────────────
interface RunReport {
  usersScanned: number;
  usersNotified: number;
  pushesSent: number;
  titlesCovered: number;
  tokensPruned: number;
  errors: number;
}

async function run(): Promise<RunReport> {
  const report: RunReport = {
    usersScanned: 0, usersNotified: 0, pushesSent: 0,
    titlesCovered: 0, tokensPruned: 0, errors: 0,
  };

  // 1. Prune dead tokens from the previous run's receipts.
  try {
    const { pruned } = await pollReceiptsAndPrune(supabase, EXPO);
    report.tokensPruned = pruned;
  } catch (err) {
    console.error('[send-notifications] receipt pass failed:', (err as Error).message);
    report.errors++;
  }

  // 2. Candidate users = anyone with ≥1 push token. v1 user base is tiny, so a
  //    per-user loop is fine; if it grows, batch by service/watchlist instead.
  const { data: tokenRows, error: tokErr } = await supabase
    .from('user_push_tokens')
    .select('id, user_id, expo_push_token, platform');
  if (tokErr) throw tokErr;

  const tokensByUser = new Map<string, PushToken[]>();
  for (const t of tokenRows ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push({ id: t.id, expo_push_token: t.expo_push_token, platform: t.platform });
    tokensByUser.set(t.user_id, list);
  }

  for (const [userId, tokens] of tokensByUser) {
    report.usersScanned++;
    try {
      if (await hitDailyCap(userId)) continue;

      const enabledTypes = await getEnabledTypes(userId);
      if (enabledTypes.size === 0) continue;

      const [watchlist, services] = await Promise.all([
        getWatchlist(userId),
        getUserServices(userId),
      ]);
      if (watchlist.size === 0 || services.size === 0) continue;

      let candidates: Candidate[] = [];
      if (enabledTypes.has('arrival')) {
        candidates.push(...(await getArrivalCandidates(watchlist, services)));
      }
      if (enabledTypes.has('leaving_soon')) {
        candidates.push(...(await getLeavingSoonCandidates(watchlist, services)));
      }
      candidates = await filterAlreadySent(userId, candidates);
      if (candidates.length === 0) continue;

      // Claim the deliveries FIRST (idempotent). Insert with ignoreDuplicates so
      // a concurrent/re-run can't double-send. Only push for rows we claimed.
      // One push_id for every row of this push (095, IN-GR-026).
      const pushId = crypto.randomUUID();
      const rows = candidates.map((c) => ({
        user_id: userId,
        notification_type: c.type,
        tmdb_id: c.tmdb_id,
        media_type: c.media_type,
        service_id: c.service_id,
        title: c.title,
        push_id: pushId,
        delivery_status: 'pending',
      }));
      const { data: claimed, error: claimErr } = await supabase
        .from('notification_deliveries')
        .upsert(rows, {
          onConflict: 'user_id,notification_type,tmdb_id,media_type',
          ignoreDuplicates: true,
        })
        .select('id, notification_type, tmdb_id, media_type');
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) continue; // all raced away

      // Only compose from titles we actually claimed this run, each carrying
      // its delivery row id (a single-title push sends it as delivery_id).
      const claimedIds = new Map(
        claimed.map((r) => [`${r.notification_type}:${r.media_type}-${r.tmdb_id}`, r.id as string]),
      );
      const claimedCandidates: ClaimedCandidate[] = [];
      for (const c of candidates) {
        const deliveryId = claimedIds.get(`${c.type}:${c.media_type}-${c.tmdb_id}`);
        if (deliveryId) claimedCandidates.push({ ...c, delivery_id: deliveryId });
      }
      const composed = composeMessage(claimedCandidates);
      const { title, body } = composed;
      const data: PushData = { ...composed.data, push_id: pushId };

      // Fan out to every device the user has.
      const messages: ExpoMessage<PushData>[] = tokens.map((tok) => ({
        to: tok.expo_push_token,
        title,
        body,
        sound: 'default',
        data,
        channelId: 'default',
      }));
      const tickets = await expoSend(messages, EXPO);

      // Record the first ticket id against the claimed rows for receipt polling.
      // (One user → one logical push; tickets share fate. Store the first ok id.)
      // push_token_id enables receipt-driven pruning, but only unambiguously when
      // the user has a single device — otherwise leave it null (send-time pruning
      // still covers immediate DeviceNotRegistered errors below).
      const okTicket = tickets.find((t) => t.status === 'ok' && t.id);
      const anyDelivered = tickets.some((t) => t.status === 'ok');
      const singleTokenId = tokens.length === 1 ? tokens[0].id : null;
      if (okTicket?.id) {
        await supabase.from('notification_deliveries')
          .update({ expo_ticket_id: okTicket.id, push_token_id: singleTokenId })
          .in('id', claimed.map((r) => r.id));
      }

      // DeviceNotRegistered at SEND time (immediate ticket error) → prune token now.
      report.tokensPruned += await pruneSendTimeErrors(supabase, tickets, tokens);

      if (anyDelivered) {
        report.usersNotified++;
        report.pushesSent++;
        report.titlesCovered += claimed.length;
      } else {
        // Nothing delivered — roll back the claim so titles remain eligible.
        await supabase.from('notification_deliveries')
          .delete().in('id', claimed.map((r) => r.id));
      }
    } catch (err) {
      report.errors++;
      console.error(`[send-notifications] user ${userId} failed:`, (err as Error).message);
    }
  }

  return report;
}

// ── Handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  // Assert the caller carries a service_role JWT (matches sync-incremental).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const payload = JSON.parse(atob(authHeader.split(' ')[1].split('.')[1]));
    if (payload.role !== 'service_role') throw new Error('not service_role');
  } catch {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const report = await run();
    console.log(
      `[send-notifications] scanned=${report.usersScanned} notified=${report.usersNotified} ` +
      `pushes=${report.pushesSent} titles=${report.titlesCovered} ` +
      `pruned=${report.tokensPruned} errors=${report.errors}`,
    );
    return new Response(JSON.stringify({ status: 'ok', ...report }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-notifications] fatal:', (err as Error).message);
    return new Response(JSON.stringify({ status: 'error', message: (err as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
