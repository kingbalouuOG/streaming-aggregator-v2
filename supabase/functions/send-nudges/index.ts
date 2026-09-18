/**
 * send-nudges Edge Function (Growth G2 H4, plan D9)
 *
 * Every 15 minutes (cron 'send-nudges-15m', migration 095). When a member
 * adds titles to a shared list, the other members get one bundled push:
 * "joe added 3 titles to Sofa", body "Open Videx to react.", landing on the
 * list. Selection, copy and payload are the pure compose.ts; the cap and
 * quiet-hour rules are _shared/pushPolicy.ts; the Expo transport is
 * _shared/expoPush.ts (shared with send-notifications).
 *
 * Per run:
 *   1. Quiet hours (22:00 to 08:00 Europe/London): return at once.
 *   2. Read the last hour's shared-list adds, their lists, households and
 *      members, and for those members: push tokens, household_nudge
 *      preferences, 24 hours of deliveries (the caps) and adders' usernames.
 *   3. selectNudges: who gets which list, the household cap group and the
 *      global floor applied, at most 200 recipients (the next run takes the rest).
 *   4. Claim then send, as send-notifications does: upsert one delivery row per
 *      recipient (household_nudge, list_id, nudge_window, push_id) with
 *      ignoreDuplicates, so the (user, type, list, window) unique index refuses
 *      a second nudge in the same hour; push only for rows claimed; roll the
 *      claim back when nothing was delivered.
 *
 * Budget: pg_net cuts the cron's call at 30 seconds. A run is a fixed handful
 * of reads, one claim upsert, ceil(messages / 100) Expo requests, one ticket
 * upsert and at most one rollback delete. Receipts are polled by the daily
 * send-notifications run (same table), not here.
 *
 * Deploy: npx supabase functions deploy send-nudges --project-ref fmusugdcnnwiuzkbjquo
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

import {
  expoSend,
  pruneSendTimeErrors,
  type ExpoMessage,
  type ExpoPushOptions,
  type PushToken,
} from '../_shared/expoPush.ts';
import { GLOBAL_FLOOR_WINDOW_MS, isQuietHour, nudgeWindowStart } from '../_shared/pushPolicy.ts';
import {
  composeNudge,
  NUDGE_LOOKBACK_MS,
  selectNudges,
  type NudgeItemRow,
  type NudgePlan,
  type NudgePushData,
  type NudgeRecentRow,
} from './compose.ts';

// ── Config ───────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO: ExpoPushOptions = {
  accessToken: Deno.env.get('EXPO_ACCESS_TOKEN') ?? '',
  logTag: '[send-nudges]',
};
// Reads are bounded so a burst of adds cannot stretch a run.
const MAX_ITEMS_PER_RUN = 2000;

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface RunReport {
  skipped?: 'quiet_hours';
  itemsScanned: number;
  recipientsSelected: number;
  claimed: number;
  pushesSent: number;
  tokensPruned: number;
  errors: number;
}

const unique = <T>(xs: T[]) => [...new Set(xs)];

async function run(now: Date): Promise<RunReport> {
  const report: RunReport = {
    itemsScanned: 0, recipientsSelected: 0, claimed: 0,
    pushesSent: 0, tokensPruned: 0, errors: 0,
  };
  if (isQuietHour(now)) return { ...report, skipped: 'quiet_hours' };

  // 1. The last hour's adds.
  const sinceIso = new Date(now.getTime() - NUDGE_LOOKBACK_MS).toISOString();
  const { data: itemRows, error: itemErr } = await supabase
    .from('watchlist_items')
    .select('watchlist_id, title, added_by, added_at')
    .gt('added_at', sinceIso)
    .not('added_by', 'is', null)
    .order('added_at', { ascending: true })
    .limit(MAX_ITEMS_PER_RUN);
  if (itemErr) throw itemErr;
  const items = (itemRows ?? []) as NudgeItemRow[];
  report.itemsScanned = items.length;
  if (items.length === 0) return report;

  // 2. Lists → households → members.
  const { data: lists, error: listErr } = await supabase
    .from('watchlists')
    .select('id, household_id')
    .in('id', unique(items.map((i) => i.watchlist_id)));
  if (listErr) throw listErr;
  const householdIds = unique((lists ?? []).map((l) => l.household_id as string));
  if (householdIds.length === 0) return report;

  const [householdsRes, membersRes] = await Promise.all([
    supabase.from('households').select('id, name').in('id', householdIds),
    supabase.from('household_members').select('household_id, user_id').in('household_id', householdIds),
  ]);
  if (householdsRes.error) throw householdsRes.error;
  if (membersRes.error) throw membersRes.error;
  const members = membersRes.data ?? [];
  const memberIds = unique(members.map((m) => m.user_id as string));
  const adderIds = unique(items.map((i) => i.added_by as string));

  // 3. Per-member state, in parallel.
  const floorSinceIso = new Date(now.getTime() - GLOBAL_FLOOR_WINDOW_MS).toISOString();
  const [tokensRes, prefsRes, recentRes, profilesRes] = await Promise.all([
    supabase.from('user_push_tokens').select('id, user_id, expo_push_token, platform').in('user_id', memberIds),
    supabase.from('notification_preferences').select('user_id')
      .eq('notification_type', 'household_nudge').eq('enabled', false).in('user_id', memberIds),
    supabase.from('notification_deliveries').select('user_id, notification_type, sent_at, push_id, list_id')
      .in('user_id', memberIds).gte('sent_at', floorSinceIso),
    supabase.from('profiles').select('id, username').in('id', adderIds),
  ]);
  for (const r of [tokensRes, prefsRes, recentRes, profilesRes]) if (r.error) throw r.error;

  const tokensByUser = new Map<string, PushToken[]>();
  for (const t of tokensRes.data ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push({ id: t.id, expo_push_token: t.expo_push_token, platform: t.platform });
    tokensByUser.set(t.user_id, list);
  }

  const plans = selectNudges({
    now,
    items,
    lists: lists ?? [],
    households: householdsRes.data ?? [],
    members,
    tokenUsers: new Set(tokensByUser.keys()),
    disabledUsers: new Set((prefsRes.data ?? []).map((p) => p.user_id as string)),
    recent: (recentRes.data ?? []) as NudgeRecentRow[],
    usernames: new Map((profilesRes.data ?? []).map((p) => [p.id as string, p.username as string | null])),
  });
  report.recipientsSelected = plans.length;
  if (plans.length === 0) return report;

  // 4. Claim. One row per recipient, one push_id per push.
  const nudgeWindow = nudgeWindowStart(now).toISOString();
  const rows = plans.map((p) => ({
    user_id: p.userId,
    notification_type: 'household_nudge',
    list_id: p.listId,
    nudge_window: nudgeWindow,
    push_id: crypto.randomUUID(),
    title: p.householdName,
    delivery_status: 'pending',
  }));
  const { data: claimedRows, error: claimErr } = await supabase
    .from('notification_deliveries')
    .upsert(rows, { onConflict: 'user_id,notification_type,list_id,nudge_window', ignoreDuplicates: true })
    .select('id, user_id, list_id, push_id');
  if (claimErr) throw claimErr;
  if (!claimedRows || claimedRows.length === 0) return report;
  report.claimed = claimedRows.length;

  // 5. Compose and send in one batch; remember which messages belong to whom.
  const planByUser = new Map<string, NudgePlan>(plans.map((p) => [p.userId, p]));
  const rowByUser = new Map(rows.map((r) => [r.user_id, r]));
  const messages: ExpoMessage<NudgePushData>[] = [];
  const sends: { claimedId: string; userId: string; tokens: PushToken[]; from: number }[] = [];
  for (const c of claimedRows) {
    const plan = planByUser.get(c.user_id as string);
    const tokens = tokensByUser.get(c.user_id as string) ?? [];
    if (!plan || tokens.length === 0) continue;
    const { title, body, data } = composeNudge(plan, { deliveryId: c.id as string, pushId: c.push_id as string });
    sends.push({ claimedId: c.id as string, userId: plan.userId, tokens, from: messages.length });
    for (const tok of tokens) {
      messages.push({ to: tok.expo_push_token, title, body, sound: 'default', data, channelId: 'default' });
    }
  }
  const tickets = await expoSend(messages, EXPO);

  // 6. Record tickets, prune dead tokens, roll back what was not delivered.
  const delivered: Record<string, unknown>[] = [];
  const undelivered: string[] = [];
  for (const s of sends) {
    const mine = tickets.slice(s.from, s.from + s.tokens.length);
    try {
      report.tokensPruned += await pruneSendTimeErrors(supabase, mine, s.tokens);
    } catch (err) {
      report.errors++;
      console.error(`[send-nudges] prune for ${s.userId} failed:`, (err as Error).message);
    }
    const okTicket = mine.find((t) => t.status === 'ok' && t.id);
    if (!mine.some((t) => t.status === 'ok')) {
      undelivered.push(s.claimedId);
      continue;
    }
    report.pushesSent++;
    if (okTicket?.id) {
      // The full row so the upsert's INSERT arm passes the shape CHECK; on
      // conflict (id) only these columns are updated.
      delivered.push({
        id: s.claimedId,
        ...rowByUser.get(s.userId)!,
        expo_ticket_id: okTicket.id,
        push_token_id: s.tokens.length === 1 ? s.tokens[0].id : null,
      });
    }
  }
  // Claimed rows with no send at all (a token vanished between reads) go too.
  const sentIds = new Set(sends.map((s) => s.claimedId));
  for (const c of claimedRows) if (!sentIds.has(c.id as string)) undelivered.push(c.id as string);

  if (delivered.length) {
    const { error } = await supabase.from('notification_deliveries').upsert(delivered, { onConflict: 'id' });
    if (error) {
      report.errors++;
      console.error('[send-nudges] ticket update failed:', error.message);
    }
  }
  if (undelivered.length) {
    // Nothing reached the person: free the window so the next run can retry.
    const { error } = await supabase.from('notification_deliveries').delete().in('id', undelivered);
    if (error) {
      report.errors++;
      console.error('[send-nudges] claim rollback failed:', error.message);
    }
  }
  return report;
}

// ── Handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  // Assert the caller carries a service_role JWT (as send-notifications does).
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
    const report = await run(new Date());
    console.log(
      `[send-nudges] ${report.skipped ?? 'ran'} items=${report.itemsScanned} ` +
      `selected=${report.recipientsSelected} claimed=${report.claimed} pushes=${report.pushesSent} ` +
      `pruned=${report.tokensPruned} errors=${report.errors}`,
    );
    return new Response(JSON.stringify({ status: 'ok', ...report }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-nudges] fatal:', (err as Error).message);
    return new Response(JSON.stringify({ status: 'error', message: (err as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
