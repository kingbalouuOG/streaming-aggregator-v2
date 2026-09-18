/**
 * send-nudges selection, copy and payload (Growth G2 H4, plan D9).
 *
 * Pure: no Deno, Supabase or network APIs, so the root vitest rig tests it
 * (supabase/functions/send-nudges/__tests__/compose.test.ts) and index.ts
 * imports it. index.ts reads the rows; selectNudges decides who gets what.
 *
 * Who gets a nudge, per run:
 *   - items on a shared list whose added_at is after the later of
 *     (now minus 60 minutes) and the recipient's last household_nudge for
 *     that list;
 *   - every member of the list's household except the adder, with a push
 *     token and household_nudge not turned off (absent row = on, 056);
 *   - one nudge per recipient per run: when two of their lists have news, the
 *     one with the most recent add wins (the other is held by the cap);
 *   - the household cap group and the global floor (pushPolicy.ts) are
 *     applied here, before anything is claimed;
 *   - at most `maxRecipients`, the longest-waiting first, so a run stays
 *     well inside pg_net's 30 seconds and the next run takes the rest.
 *
 * The push `data` the app reads on tap (native/src/providers/notifications.tsx):
 *   url          videx://list/{listId} (never the invite token)
 *   type         'household_nudge'
 *   delivery_id  the claimed notification_deliveries row
 *   push_id      one id per push (095)
 *   via          'push'
 */

import { capBlock, type RecentDelivery } from '../_shared/pushPolicy.ts';

export const NUDGE_LOOKBACK_MS = 60 * 60 * 1000;
export const MAX_RECIPIENTS_PER_RUN = 200;
export const NUDGE_BODY = 'Open Videx to react.';
const UNKNOWN_NAME = 'Someone';

// ── Input rows (what index.ts reads) ─────────────────────
export interface NudgeItemRow {
  watchlist_id: string;
  title: string;
  added_by: string | null;
  added_at: string;
}
export interface NudgeListRow {
  id: string;
  household_id: string;
}
export interface NudgeHouseholdRow {
  id: string;
  name: string;
}
export interface NudgeMemberRow {
  household_id: string;
  user_id: string;
}
export interface NudgeRecentRow extends RecentDelivery {
  user_id: string;
  list_id?: string | null;
}

export interface NudgeInputs {
  now: Date;
  items: readonly NudgeItemRow[];
  lists: readonly NudgeListRow[];
  households: readonly NudgeHouseholdRow[];
  members: readonly NudgeMemberRow[];
  /** Users with at least one push token. */
  tokenUsers: ReadonlySet<string>;
  /** Users with household_nudge turned off. */
  disabledUsers: ReadonlySet<string>;
  /** Every delivery of the candidate users in the last 24 hours, any type. */
  recent: readonly NudgeRecentRow[];
  /** profiles.username by user id. */
  usernames: ReadonlyMap<string, string | null>;
  maxRecipients?: number;
}

export interface NudgeAdder {
  userId: string;
  name: string;
  count: number;
}

export interface NudgePlan {
  userId: string;
  listId: string;
  householdName: string;
  /** Most titles first, then the most recent adder. */
  adders: NudgeAdder[];
  titleCount: number;
  /** The title, when the nudge covers exactly one. */
  singleTitle: string | null;
  /** added_at of the newest item covered. */
  latestAddAt: string;
  /** added_at of the oldest item covered: the batch order. */
  oldestAddAt: string;
}

const ms = (iso: string) => Date.parse(iso);

export function selectNudges(input: NudgeInputs): NudgePlan[] {
  const { now } = input;
  const lookbackStart = now.getTime() - NUDGE_LOOKBACK_MS;
  const listById = new Map(input.lists.map((l) => [l.id, l]));
  const householdById = new Map(input.households.map((h) => [h.id, h]));
  const membersByHousehold = new Map<string, string[]>();
  for (const m of input.members) {
    const list = membersByHousehold.get(m.household_id) ?? [];
    list.push(m.user_id);
    membersByHousehold.set(m.household_id, list);
  }
  const recentByUser = new Map<string, NudgeRecentRow[]>();
  for (const r of input.recent) {
    const list = recentByUser.get(r.user_id) ?? [];
    list.push(r);
    recentByUser.set(r.user_id, list);
  }
  const itemsByList = new Map<string, NudgeItemRow[]>();
  for (const it of input.items) {
    if (!it.added_by || ms(it.added_at) <= lookbackStart) continue;
    const list = itemsByList.get(it.watchlist_id) ?? [];
    list.push(it);
    itemsByList.set(it.watchlist_id, list);
  }

  // Every (recipient, list) with news for them.
  const best = new Map<string, { listId: string; items: NudgeItemRow[]; latest: number }>();
  for (const [listId, items] of itemsByList) {
    const list = listById.get(listId);
    if (!list || !householdById.has(list.household_id)) continue;
    for (const userId of membersByHousehold.get(list.household_id) ?? []) {
      if (!input.tokenUsers.has(userId) || input.disabledUsers.has(userId)) continue;
      const lastNudge = Math.max(
        -Infinity,
        ...(recentByUser.get(userId) ?? [])
          .filter((r) => r.notification_type === 'household_nudge' && r.list_id === listId)
          .map((r) => ms(r.sent_at)),
      );
      const cutoff = Math.max(lookbackStart, lastNudge);
      const news = items.filter((it) => it.added_by !== userId && ms(it.added_at) > cutoff);
      if (news.length === 0) continue;
      const latest = Math.max(...news.map((it) => ms(it.added_at)));
      const current = best.get(userId);
      const wins =
        !current ||
        latest > current.latest ||
        (latest === current.latest &&
          (news.length > current.items.length ||
            (news.length === current.items.length && listId < current.listId)));
      if (wins) best.set(userId, { listId, items: news, latest });
    }
  }

  const plans: NudgePlan[] = [];
  for (const [userId, pick] of best) {
    if (capBlock(recentByUser.get(userId) ?? [], 'household_nudge', now) !== null) continue;
    const list = listById.get(pick.listId)!;
    const household = householdById.get(list.household_id)!;
    plans.push(buildPlan(userId, pick.listId, household.name, pick.items, input.usernames));
  }

  plans.sort((a, b) => ms(a.oldestAddAt) - ms(b.oldestAddAt) || (a.userId < b.userId ? -1 : 1));
  return plans.slice(0, input.maxRecipients ?? MAX_RECIPIENTS_PER_RUN);
}

function buildPlan(
  userId: string,
  listId: string,
  householdName: string,
  items: NudgeItemRow[],
  usernames: ReadonlyMap<string, string | null>,
): NudgePlan {
  const byAdder = new Map<string, { count: number; latest: number }>();
  for (const it of items) {
    const a = byAdder.get(it.added_by!) ?? { count: 0, latest: -Infinity };
    a.count++;
    a.latest = Math.max(a.latest, ms(it.added_at));
    byAdder.set(it.added_by!, a);
  }
  const adders = [...byAdder.entries()]
    .sort(([ia, a], [ib, b]) => b.count - a.count || b.latest - a.latest || (ia < ib ? -1 : 1))
    .map(([id, a]) => ({ userId: id, name: usernames.get(id)?.trim() || UNKNOWN_NAME, count: a.count }));
  const times = items.map((it) => ms(it.added_at));
  return {
    userId,
    listId,
    householdName,
    adders,
    titleCount: items.length,
    singleTitle: items.length === 1 ? items[0].title : null,
    latestAddAt: new Date(Math.max(...times)).toISOString(),
    oldestAddAt: new Date(Math.min(...times)).toISOString(),
  };
}

// ── Copy ─────────────────────────────────────────────────
/**
 * "{a} added {title} to {household}" for one title; otherwise
 * "{a} added {n} titles to {household}", "{a} and {b} added …",
 * "{a} and {k} others added …". No dashes, no exclamation marks (tone guide).
 */
export function nudgeHeadline(plan: Pick<NudgePlan, 'adders' | 'titleCount' | 'singleTitle' | 'householdName'>): string {
  const [a, b] = plan.adders;
  const where = plan.householdName;
  if (plan.titleCount === 1 && plan.singleTitle) return `${a.name} added ${plan.singleTitle} to ${where}`;
  const who =
    plan.adders.length === 1
      ? a.name
      : plan.adders.length === 2
        ? `${a.name} and ${b.name}`
        : `${a.name} and ${plan.adders.length - 1} others`;
  return `${who} added ${plan.titleCount} titles to ${where}`;
}

export interface NudgePushData {
  url: string;
  type: 'household_nudge';
  delivery_id: string;
  push_id: string;
  via: 'push';
}

export const listUrl = (listId: string) => `videx://list/${listId}`;

export function composeNudge(
  plan: NudgePlan,
  ids: { deliveryId: string; pushId: string },
): { title: string; body: string; data: NudgePushData } {
  return {
    title: nudgeHeadline(plan),
    body: NUDGE_BODY,
    data: {
      url: listUrl(plan.listId),
      type: 'household_nudge',
      delivery_id: ids.deliveryId,
      push_id: ids.pushId,
      via: 'push',
    },
  };
}
