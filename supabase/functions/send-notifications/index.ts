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
 *   - Cap: at most ONE push per user per day. Today's matches are BUNDLED into
 *     a single notification, so a catch-up sync that adds 50 titles still
 *     produces one push — no mass-firing.
 *   - Consent: filters notification_preferences server-side (a disabled type is
 *     never sent, even from a stale client). Absent pref row = enabled (default-on).
 *   - Leaving-soon is kept cleanly separable (its own type + tier flag) so a
 *     future Premium gate is a one-line config change, not surgery.
 *
 * Also, at the start of each run: polls Expo push receipts for the previous
 * run's sends and prunes dead tokens (DeviceNotRegistered) from user_push_tokens.
 *
 * Deploy: npx supabase functions deploy send-notifications --project-ref fmusugdcnnwiuzkbjquo
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config ───────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Optional. When set, Expo enforces that only this project's server can send
// to its tokens (recommended once "Enhanced Security for Push" is on).
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_PUSH_CHUNK = 100; // Expo accepts up to 100 messages per request.

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Notification-type registry ───────────────────────────
// The single place gating lives. Leaving-soon ships FREE in v1; making it a
// Premium anchor later means flipping `tier: 'free'` → `tier: 'premium'` here
// and implementing userIsPremium() — no schema/pipeline surgery.
type NotificationType = 'arrival' | 'leaving_soon';
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
// Cap: if the user already received a push in this window, skip them today.
const DAILY_CAP_WINDOW_MS = 20 * 3600 * 1000;
// Receipt polling: only poll sends old enough for a receipt to exist, and
// young enough to still matter.
const RECEIPT_MIN_AGE_MS = 15 * 60 * 1000;
const RECEIPT_MAX_AGE_MS = 3 * 24 * 3600 * 1000;

// ── Types ────────────────────────────────────────────────
interface PushToken {
  id: string;
  expo_push_token: string;
  platform: string;
}
interface Candidate {
  type: NotificationType;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  service_id: string;
  title: string;
}
interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { url: string; type: NotificationType | 'bundle' };
  channelId?: string;
}

// Content-id format shared with the client router: `${mediaType}-${tmdbId}`
// (memory: "movie-12345" / "tv-12345"). Deep link → videx://detail/<contentId>.
const contentId = (mediaType: string, tmdbId: number) => `${mediaType}-${tmdbId}`;
const detailUrl = (mediaType: string, tmdbId: number) =>
  `videx://detail/${contentId(mediaType, tmdbId)}`;
const watchlistUrl = () => `videx://watchlist`;

// ── Service-name display map (for copy) ──────────────────
const SERVICE_LABELS: Record<string, string> = {
  netflix: 'Netflix', prime: 'Prime Video', disney: 'Disney+', apple: 'Apple TV+',
  now: 'NOW', paramount: 'Paramount+', itvx: 'ITVX', channel4: 'Channel 4',
  bbc: 'BBC iPlayer', skygo: 'Sky Go',
};
const serviceLabel = (id: string) => SERVICE_LABELS[id] ?? id;

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
    .eq('user_id', userId);
  if (error) throw error;
  const sent = new Set(
    (data ?? []).map((r) => `${r.notification_type}:${r.media_type}-${r.tmdb_id}`),
  );
  return cands.filter((c) => !sent.has(`${c.type}:${c.media_type}-${c.tmdb_id}`));
}

/** True if the user already got a push inside the cap window. */
async function hitDailyCap(userId: string): Promise<boolean> {
  const sinceIso = new Date(Date.now() - DAILY_CAP_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('notification_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', sinceIso);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Copy composition (one push, bundled) ─────────────────
function composeMessage(cands: Candidate[]): {
  title: string;
  body: string;
  data: ExpoMessage['data'];
} {
  // Lead with arrivals (retention loop). Only fall to leaving-soon if there
  // are no arrivals — keeps the daily push positive-first.
  const arrivals = cands.filter((c) => c.type === 'arrival');
  const leaving = cands.filter((c) => c.type === 'leaving_soon');
  const lead = arrivals.length > 0 ? arrivals : leaving;
  const isArrival = arrivals.length > 0;
  const first = lead[0];
  const extra = lead.length - 1;

  if (isArrival) {
    const title =
      lead.length === 1
        ? `${first.title} is now streaming`
        : `${first.title} and ${extra} more just landed`;
    const body =
      lead.length === 1
        ? `Now on ${serviceLabel(first.service_id)} — on your watchlist.`
        : `New on your subscriptions. Open Videx to watch.`;
    const url = lead.length === 1 ? detailUrl(first.media_type, first.tmdb_id) : watchlistUrl();
    return { title, body, data: { url, type: lead.length === 1 ? 'arrival' : 'bundle' } };
  }

  const title =
    lead.length === 1
      ? `${first.title} is leaving soon`
      : `${first.title} and ${extra} more are leaving soon`;
  const body =
    lead.length === 1
      ? `Leaving ${serviceLabel(first.service_id)} within a week — watch it before it goes.`
      : `Watchlist titles are expiring within a week.`;
  const url = lead.length === 1 ? detailUrl(first.media_type, first.tmdb_id) : watchlistUrl();
  return { title, body, data: { url, type: lead.length === 1 ? 'leaving_soon' : 'bundle' } };
}

// ── Expo push send (chunked) ─────────────────────────────
interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function expoSend(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_PUSH_CHUNK);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    };
    if (EXPO_ACCESS_TOKEN) headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
    try {
      const res = await fetch(EXPO_SEND_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      const json = await res.json();
      // Response shape: { data: ExpoTicket[] } (order matches the request).
      const data = (json?.data ?? []) as ExpoTicket[];
      tickets.push(...data);
    } catch (err) {
      console.error('[send-notifications] expoSend chunk failed:', (err as Error).message);
      // Mark the whole chunk as errored so callers don't record phantom sends.
      for (let j = 0; j < chunk.length; j++) tickets.push({ status: 'error', message: 'network' });
    }
  }
  return tickets;
}

// ── Receipt polling + dead-token pruning ─────────────────
// Runs at the START of each daily run against the PREVIOUS run's tickets.
async function pollReceiptsAndPrune(): Promise<{ polled: number; pruned: number }> {
  const minIso = new Date(Date.now() - RECEIPT_MAX_AGE_MS).toISOString();
  const maxIso = new Date(Date.now() - RECEIPT_MIN_AGE_MS).toISOString();
  const { data: pending, error } = await supabase
    .from('notification_deliveries')
    .select('id, expo_ticket_id, push_token_id')
    .eq('delivery_status', 'pending')
    .not('expo_ticket_id', 'is', null)
    .gte('sent_at', minIso)
    .lte('sent_at', maxIso)
    .limit(1000);
  if (error) throw error;
  if (!pending || pending.length === 0) return { polled: 0, pruned: 0 };

  // Poll receipts by unique ticket id (many delivery rows can share a ticket).
  const ticketIds = [...new Set(pending.map((p) => p.expo_ticket_id as string))];
  let receipts: Record<string, ExpoTicket> = {};
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (EXPO_ACCESS_TOKEN) headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: ticketIds }),
    });
    const json = await res.json();
    receipts = (json?.data ?? {}) as Record<string, ExpoTicket>;
  } catch (err) {
    console.error('[send-notifications] getReceipts failed:', (err as Error).message);
    return { polled: 0, pruned: 0 };
  }

  const okDeliveryIds: string[] = [];
  const errDeliveryIds: string[] = [];
  const deadTokenIds = new Set<string>();
  for (const p of pending) {
    const r = receipts[p.expo_ticket_id as string];
    if (!r) continue; // receipt not ready yet — leave pending for next run
    if (r.status === 'ok') {
      okDeliveryIds.push(p.id);
    } else {
      errDeliveryIds.push(p.id);
      // The token is gone. push_token_id is set for single-device users; prune it.
      if (r.details?.error === 'DeviceNotRegistered' && p.push_token_id) {
        deadTokenIds.add(p.push_token_id as string);
      }
    }
  }

  if (okDeliveryIds.length) {
    await supabase.from('notification_deliveries')
      .update({ delivery_status: 'ok' }).in('id', okDeliveryIds);
  }
  if (errDeliveryIds.length) {
    await supabase.from('notification_deliveries')
      .update({ delivery_status: 'error', error_detail: 'receipt error' })
      .in('id', errDeliveryIds);
  }

  let pruned = 0;
  if (deadTokenIds.size) {
    const { data: deleted } = await supabase
      .from('user_push_tokens')
      .delete()
      .in('id', [...deadTokenIds])
      .select('id');
    pruned = deleted?.length ?? 0;
  }
  return { polled: pending.length, pruned };
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
    const { pruned } = await pollReceiptsAndPrune();
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
      const rows = candidates.map((c) => ({
        user_id: userId,
        notification_type: c.type,
        tmdb_id: c.tmdb_id,
        media_type: c.media_type,
        service_id: c.service_id,
        title: c.title,
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

      // Only compose from titles we actually claimed this run.
      const claimedKeys = new Set(
        claimed.map((r) => `${r.notification_type}:${r.media_type}-${r.tmdb_id}`),
      );
      const claimedCandidates = candidates.filter((c) =>
        claimedKeys.has(`${c.type}:${c.media_type}-${c.tmdb_id}`));
      const { title, body, data } = composeMessage(claimedCandidates);

      // Fan out to every device the user has.
      const messages: ExpoMessage[] = tokens.map((tok) => ({
        to: tok.expo_push_token,
        title,
        body,
        sound: 'default',
        data,
        channelId: 'default',
      }));
      const tickets = await expoSend(messages);

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
      for (let i = 0; i < tickets.length; i++) {
        if (tickets[i].status === 'error' && tickets[i].details?.error === 'DeviceNotRegistered') {
          await supabase.from('user_push_tokens').delete().eq('id', tokens[i].id);
          report.tokensPruned++;
        }
      }

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
