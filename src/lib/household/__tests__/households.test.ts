import { describe, expect, it } from 'vitest';

import { assembleHouseholds, validHouseholdName, type HouseholdRow, type MemberRow } from '../households';

const households: HouseholdRow[] = [
  {
    id: 'h2',
    name: 'Flat',
    owner_id: 'other',
    created_at: '2026-09-02',
    watchlists: [
      { id: 'w2b', name: 'Later', created_at: '2026-09-05' },
      { id: 'w2a', name: 'Shared', created_at: '2026-09-02' },
    ],
  },
  { id: 'h1', name: 'Sofa', owner_id: 'me', created_at: '2026-09-01', watchlists: [{ id: 'w1', name: 'Shared', created_at: '2026-09-01' }] },
  { id: 'h3', name: 'Stale', owner_id: 'x', created_at: '2026-09-03', watchlists: null },
];

const members: MemberRow[] = [
  { household_id: 'h1', user_id: 'me', role: 'owner', joined_at: '2026-09-01' },
  { household_id: 'h1', user_id: 'b', role: 'member', joined_at: '2026-09-04' },
  { household_id: 'h2', user_id: 'other', role: 'owner', joined_at: '2026-09-02' },
  { household_id: 'h2', user_id: 'me', role: 'member', joined_at: '2026-09-06' },
  { household_id: 'h2', user_id: 'c', role: 'member', joined_at: '2026-09-07' },
];

describe('assembleHouseholds', () => {
  it('joins memberships, counts members and picks the earliest list', () => {
    expect(assembleHouseholds(households, members, 'me')).toEqual([
      { id: 'h1', name: 'Sofa', ownerId: 'me', isOwner: true, watchlistId: 'w1', listName: 'Shared', memberCount: 2, joinedAt: '2026-09-01' },
      { id: 'h2', name: 'Flat', ownerId: 'other', isOwner: false, watchlistId: 'w2a', listName: 'Shared', memberCount: 3, joinedAt: '2026-09-06' },
    ]);
  });

  it('skips a household the caller has no member row in', () => {
    expect(assembleHouseholds(households, members, 'b').map((h) => h.id)).toEqual(['h1']);
  });
});

describe('validHouseholdName', () => {
  it('trims and bounds by character', () => {
    expect(validHouseholdName('  Sofa ')).toBe('Sofa');
    expect(validHouseholdName('   ')).toBeNull();
    expect(validHouseholdName('x'.repeat(40))).toBe('x'.repeat(40));
    expect(validHouseholdName('x'.repeat(41))).toBeNull();
    expect(validHouseholdName('\u{1F3E0}'.repeat(40))).toBe('\u{1F3E0}'.repeat(40));
  });
});
