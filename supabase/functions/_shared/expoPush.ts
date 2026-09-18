/**
 * Expo push transport shared by send-notifications and send-nudges
 * (extracted unchanged from send-notifications in Growth G2 H4).
 *
 *   expoSend              chunked POST /push/send; one ticket per message, in order
 *   pollReceiptsAndPrune  receipts for earlier sends, then dead-token pruning
 *   pruneSendTimeErrors   DeviceNotRegistered at send time, pruned at once
 *
 * The caller passes its service-role client and a log tag; nothing here
 * reads Deno.env, so the module owns no configuration of its own.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_PUSH_CHUNK = 100; // Expo accepts up to 100 messages per request.

// Receipt polling: only poll sends old enough for a receipt to exist, and
// young enough to still matter.
const RECEIPT_MIN_AGE_MS = 15 * 60 * 1000;
const RECEIPT_MAX_AGE_MS = 3 * 24 * 3600 * 1000;

export interface PushToken {
  id: string;
  expo_push_token: string;
  platform: string;
}

export interface ExpoMessage<D = Record<string, unknown>> {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: D;
  channelId?: string;
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushOptions {
  /** Optional. When set, Expo enforces that only this project's server can send to its tokens. */
  accessToken: string;
  /** Prefix for console lines, e.g. '[send-notifications]'. */
  logTag: string;
}

export async function expoSend(messages: ExpoMessage<unknown>[], opts: ExpoPushOptions): Promise<ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_PUSH_CHUNK);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    };
    if (opts.accessToken) headers['Authorization'] = `Bearer ${opts.accessToken}`;
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
      console.error(`${opts.logTag} expoSend chunk failed:`, (err as Error).message);
      // Mark the whole chunk as errored so callers don't record phantom sends.
      for (let j = 0; j < chunk.length; j++) tickets.push({ status: 'error', message: 'network' });
    }
  }
  return tickets;
}

// ── Receipt polling + dead-token pruning ─────────────────
// send-notifications runs this at the START of each daily run against earlier
// tickets (its own and send-nudges'; the table is shared).
export async function pollReceiptsAndPrune(
  supabase: SupabaseClient,
  opts: ExpoPushOptions,
): Promise<{ polled: number; pruned: number }> {
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
    if (opts.accessToken) headers['Authorization'] = `Bearer ${opts.accessToken}`;
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: ticketIds }),
    });
    const json = await res.json();
    receipts = (json?.data ?? {}) as Record<string, ExpoTicket>;
  } catch (err) {
    console.error(`${opts.logTag} getReceipts failed:`, (err as Error).message);
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

/**
 * DeviceNotRegistered at SEND time (an immediate ticket error): prune the
 * token now. tickets[i] answers the message sent to tokens[i]. Returns the
 * number pruned.
 */
export async function pruneSendTimeErrors(
  supabase: SupabaseClient,
  tickets: readonly ExpoTicket[],
  tokens: readonly PushToken[],
): Promise<number> {
  let pruned = 0;
  for (let i = 0; i < tickets.length; i++) {
    if (tickets[i].status === 'error' && tickets[i].details?.error === 'DeviceNotRegistered' && tokens[i]) {
      await supabase.from('user_push_tokens').delete().eq('id', tokens[i].id);
      pruned++;
    }
  }
  return pruned;
}
