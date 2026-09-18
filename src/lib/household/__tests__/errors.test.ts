import { describe, expect, it } from 'vitest';

import {
  HOUSEHOLD_ERROR_CODES,
  HouseholdError,
  householdErrorCode,
  householdErrorCopy,
  type HouseholdFailure,
} from '../errors';

describe('householdErrorCode', () => {
  it.each(HOUSEHOLD_ERROR_CODES)('reads the exact code %s from a PostgREST error', (code) => {
    expect(householdErrorCode({ message: code, code: 'P0001', details: null, hint: null })).toBe(code);
  });

  it('tolerates surrounding whitespace', () => {
    expect(householdErrorCode({ message: ' invite_expired\n', code: 'P0001' })).toBe('invite_expired');
  });

  it('does not match a code inside a longer message', () => {
    expect(householdErrorCode({ message: 'not_member of anything', code: 'P0001' })).toBe('unknown');
  });

  it('maps an RLS refusal (42501) to rls_denied', () => {
    expect(
      householdErrorCode({ message: 'new row violates row-level security policy', code: '42501' }),
    ).toBe('rls_denied');
  });

  it('prefers the RPC code over the SQLSTATE', () => {
    expect(householdErrorCode({ message: 'not_owner', code: '42501' })).toBe('not_owner');
  });

  it('passes a HouseholdError through', () => {
    expect(householdErrorCode(new HouseholdError('household_full'))).toBe('household_full');
  });

  it.each([null, undefined, 'invite_expired', 42, new Error('boom'), { message: 3 }])(
    'falls back to unknown for %j',
    (value) => {
      expect(householdErrorCode(value)).toBe('unknown');
    },
  );
});

describe('householdErrorCopy', () => {
  const all: HouseholdFailure[] = [...HOUSEHOLD_ERROR_CODES, 'rls_denied', 'unknown'];

  it.each(all)('%s has tone-guide copy', (code) => {
    const copy = householdErrorCopy(code);
    expect(copy.length).toBeGreaterThan(0);
    expect(copy).not.toMatch(/!/);
    expect(copy).not.toMatch(/—/);
    expect(copy).toMatch(/\.$/);
    expect(copy).not.toContain(code);
  });

  it('uses the agreed lines', () => {
    expect(householdErrorCopy('invite_expired')).toBe('This invite has expired. Ask for a new one.');
    expect(householdErrorCopy('household_full')).toBe('This household is full.');
  });
});
