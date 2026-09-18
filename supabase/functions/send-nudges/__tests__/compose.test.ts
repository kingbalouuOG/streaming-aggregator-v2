// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  composeNudge,
  NUDGE_BODY,
  nudgeHeadline,
  selectNudges,
  type NudgeInputs,
  type NudgeItemRow,
  type NudgePlan,
  type NudgeRecentRow,
} from '../compose';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const minAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const A = 'user-a';
const B = 'user-b';
const C = 'user-c';
const D = 'user-d';
const LIST = '8c1e3f2b-4e6f-4a9d-8b7a-5a6b1c2d3e4f';
const LIST2 = '9d2f4a3c-5f7a-4b0e-9c8b-6b7c2d3e4f5a';
const HH = 'hh-1';
const HH2 = 'hh-2';

const item = (by: string | null, mAgo: number, title = `Title ${mAgo}`, list = LIST): NudgeItemRow => ({
  watchlist_id: list,
  title,
  added_by: by,
  added_at: minAgo(mAgo),
});

function inputs(over: Partial<NudgeInputs> = {}): NudgeInputs {
  return {
    now: NOW,
    items: [],
    lists: [
      { id: LIST, household_id: HH },
      { id: LIST2, household_id: HH2 },
    ],
    households: [
      { id: HH, name: 'Sofa' },
      { id: HH2, name: 'Flat' },
    ],
    members: [A, B, C, D].map((user_id) => ({ household_id: HH, user_id })),
    tokenUsers: new Set([A, B, C, D]),
    disabledUsers: new Set(),
    recent: [],
    usernames: new Map([
      [A, 'joe'],
      [B, 'sam'],
      [C, 'alex'],
      [D, 'kim'],
    ]),
    ...over,
  };
}

const planFor = (plans: NudgePlan[], userId: string) => plans.find((p) => p.userId === userId);

describe('selectNudges', () => {
  it('nudges every other member, never the adder', () => {
    const plans = selectNudges(inputs({ items: [item(A, 5), item(A, 10)] }));
    expect(plans.map((p) => p.userId).sort()).toEqual([B, C, D]);
    expect(planFor(plans, B)).toMatchObject({ listId: LIST, householdName: 'Sofa', titleCount: 2, singleTitle: null });
    expect(planFor(plans, B)!.adders).toEqual([{ userId: A, name: 'joe', count: 2 }]);
  });

  it('covers only the last 60 minutes', () => {
    const plans = selectNudges(inputs({ items: [item(A, 60), item(A, 61)] }));
    expect(plans).toEqual([]);
    const one = selectNudges(inputs({ items: [item(A, 59, 'Dune'), item(A, 90)] }));
    expect(planFor(one, B)).toMatchObject({ titleCount: 1, singleTitle: 'Dune' });
  });

  it('a nudge in the last hour holds that recipient; the others still get every item', () => {
    // The per-list cutoff (items after the last nudge) is a second guard: with
    // one household nudge per 20 hours the group cap always binds first.
    const recent: NudgeRecentRow[] = [
      { user_id: B, notification_type: 'household_nudge', sent_at: minAgo(30), push_id: 'p', list_id: LIST },
    ];
    const plans = selectNudges(inputs({ items: [item(A, 40), item(A, 10)], recent }));
    expect(planFor(plans, B)).toBeUndefined();
    expect(planFor(plans, C)!.titleCount).toBe(2);
  });

  it('a last nudge for a different list does not move the cutoff', () => {
    const recent: NudgeRecentRow[] = [
      // Past the 20-hour group cap, inside the 24-hour read.
      { user_id: B, notification_type: 'household_nudge', sent_at: minAgo(21 * 60), push_id: 'p', list_id: LIST2 },
    ];
    const plans = selectNudges(inputs({ items: [item(A, 40), item(A, 10)], recent }));
    expect(planFor(plans, B)!.titleCount).toBe(2);
  });

  it('skips members with nudges off or no push token', () => {
    const plans = selectNudges(
      inputs({ items: [item(A, 5)], disabledUsers: new Set([B]), tokenUsers: new Set([A, C]) }),
    );
    expect(plans.map((p) => p.userId)).toEqual([C]);
  });

  it('skips items whose adder has gone (added_by null)', () => {
    expect(selectNudges(inputs({ items: [item(null, 5)] }))).toEqual([]);
  });

  it('an arrival earlier today does not hold a nudge; a nudge earlier today does', () => {
    const recent: NudgeRecentRow[] = [
      { user_id: B, notification_type: 'arrival', sent_at: minAgo(4 * 60), push_id: 'x' },
      { user_id: C, notification_type: 'household_nudge', sent_at: minAgo(4 * 60), push_id: 'y', list_id: LIST },
    ];
    const plans = selectNudges(inputs({ items: [item(A, 5)], recent }));
    expect(plans.map((p) => p.userId).sort()).toEqual([B, D]);
  });

  it('the global floor holds a nudge after 3 pushes in 24 hours', () => {
    const recent: NudgeRecentRow[] = [
      { user_id: B, notification_type: 'arrival', sent_at: minAgo(23 * 60), push_id: '1' },
      { user_id: B, notification_type: 'household_nudge', sent_at: minAgo(22 * 60), push_id: '2', list_id: LIST },
      { user_id: B, notification_type: 'arrival', sent_at: minAgo(21 * 60), push_id: '3' },
    ];
    const plans = selectNudges(inputs({ items: [item(A, 5)], recent }));
    expect(planFor(plans, B)).toBeUndefined();
    expect(planFor(plans, C)).toBeDefined();
  });

  it('one nudge per recipient per run: the list with the most recent add wins', () => {
    const members = [
      ...[A, B].map((user_id) => ({ household_id: HH, user_id })),
      ...[C, B].map((user_id) => ({ household_id: HH2, user_id })),
    ];
    const plans = selectNudges(
      inputs({ members, items: [item(A, 30, 'Old', LIST), item(C, 5, 'New', LIST2)] }),
    );
    expect(planFor(plans, B)).toMatchObject({ listId: LIST2, householdName: 'Flat', singleTitle: 'New' });
    expect(plans.filter((p) => p.userId === B)).toHaveLength(1);
  });

  it('orders adders by titles added, then recency', () => {
    const plans = selectNudges(inputs({ items: [item(C, 50), item(B, 40), item(B, 30), item(C, 5), item(C, 6)] }));
    expect(planFor(plans, A)!.adders.map((a) => a.name)).toEqual(['alex', 'sam']);
    expect(planFor(plans, A)!.titleCount).toBe(5);
  });

  it('caps the batch, longest-waiting first', () => {
    const members = [A, B, C, D].map((user_id) => ({ household_id: HH, user_id }));
    const plans = selectNudges(
      inputs({ members, items: [item(A, 50), item(B, 10)], maxRecipients: 2 }),
    );
    // B, C and D all see A's 50-minute-old item; A only sees B's newer one.
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.userId !== A)).toBe(true);
  });

  it('falls back to "Someone" when an adder has no username', () => {
    const plans = selectNudges(inputs({ items: [item(A, 5, 'Dune')], usernames: new Map() }));
    expect(nudgeHeadline(planFor(plans, B)!)).toBe('Someone added Dune to Sofa');
  });
});

describe('nudgeHeadline', () => {
  const plan = (names: string[], titleCount: number, singleTitle: string | null = null) => ({
    adders: names.map((name, i) => ({ userId: `u${i}`, name, count: 1 })),
    titleCount,
    singleTitle,
    householdName: 'Sofa',
  });

  it('one title names it', () => {
    expect(nudgeHeadline(plan(['joe'], 1, 'Severance'))).toBe('joe added Severance to Sofa');
  });
  it('one adder, several titles', () => {
    expect(nudgeHeadline(plan(['joe'], 3))).toBe('joe added 3 titles to Sofa');
  });
  it('two adders', () => {
    expect(nudgeHeadline(plan(['joe', 'sam'], 4))).toBe('joe and sam added 4 titles to Sofa');
  });
  it('three or more adders', () => {
    expect(nudgeHeadline(plan(['joe', 'sam', 'alex'], 5))).toBe('joe and 2 others added 5 titles to Sofa');
    expect(nudgeHeadline(plan(['joe', 'sam', 'alex', 'kim'], 6))).toBe('joe and 3 others added 6 titles to Sofa');
  });

  it('no template uses an em or en dash or an exclamation mark (tone guide)', () => {
    const lines = [
      nudgeHeadline(plan(['joe'], 1, 'Dune')),
      nudgeHeadline(plan(['joe'], 2)),
      nudgeHeadline(plan(['joe', 'sam'], 2)),
      nudgeHeadline(plan(['joe', 'sam', 'alex'], 3)),
      NUDGE_BODY,
    ];
    for (const line of lines) expect(line).not.toMatch(/[–—!]/);
  });
});

describe('composeNudge', () => {
  it('lands on the list, carries the delivery and push ids, never an invite', () => {
    const [p] = selectNudges(inputs({ items: [item(A, 5, 'Dune')], tokenUsers: new Set([B]) }));
    const msg = composeNudge(p, { deliveryId: 'd-1', pushId: 'p-1' });
    expect(msg).toEqual({
      title: 'joe added Dune to Sofa',
      body: 'Open Videx to react.',
      data: {
        url: `videx://list/${LIST}`,
        type: 'household_nudge',
        delivery_id: 'd-1',
        push_id: 'p-1',
        via: 'push',
      },
    });
    expect(msg.data.url).not.toContain('invite');
  });
});
