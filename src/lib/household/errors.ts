/**
 * Household RPC error codes and their copy (Growth G2, H2).
 *
 * Every household RPC fails with RAISE EXCEPTION whose message is exactly one
 * stable code (SQLSTATE P0001); an RLS refusal on the tables is 42501. The
 * contract is plan §11b (docs/plans/2026-09-17-004) plus migration 094's
 * cannot_remove_self. The app never shows a raw message: every code maps to
 * one line of copy here.
 *
 * Tone guide: no exclamation marks, no em dashes, British English.
 * Pure: no React Native imports, so it runs under the root vitest rig.
 */

export const HOUSEHOLD_ERROR_CODES = [
  'not_authenticated',
  'invalid_name',
  'household_limit',
  'not_owner',
  'rate_limited',
  'invite_invalid',
  'invite_expired',
  'invite_exhausted',
  'household_full',
  'not_member',
  // Migration 094 (remove_member).
  'cannot_remove_self',
] as const;
export type HouseholdErrorCode = (typeof HOUSEHOLD_ERROR_CODES)[number];

export type HouseholdFailure = HouseholdErrorCode | 'rls_denied' | 'unknown';

/** Thrown by the rpc.ts and items.ts wrappers. */
export class HouseholdError extends Error {
  readonly code: HouseholdFailure;
  constructor(code: HouseholdFailure, cause?: unknown) {
    super(code);
    this.name = 'HouseholdError';
    this.code = code;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

function field(error: unknown, key: 'message' | 'code'): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/** The stable code behind any error a household call can produce. */
export function householdErrorCode(error: unknown): HouseholdFailure {
  if (error instanceof HouseholdError) return error.code;
  const message = field(error, 'message')?.trim() ?? '';
  const known = HOUSEHOLD_ERROR_CODES.find((c) => c === message);
  if (known) return known;
  if (field(error, 'code') === '42501') return 'rls_denied';
  return 'unknown';
}

const COPY: Record<HouseholdFailure, string> = {
  not_authenticated: 'Sign in to continue.',
  invalid_name: 'Give the household a name between 1 and 40 characters.',
  household_limit: 'You can run up to 3 households. Leave one to start another.',
  not_owner: 'Only the household owner can do that.',
  rate_limited: "You've made a lot of invites today. Try again later.",
  invite_invalid: "This invite link doesn't work any more. Ask for a new one.",
  invite_expired: 'This invite has expired. Ask for a new one.',
  invite_exhausted: 'This invite has been used up. Ask for a new one.',
  household_full: 'This household is full.',
  not_member: "You're not in this household.",
  cannot_remove_self: 'To leave the household yourself, use Leave household.',
  rls_denied: "You can't change that.",
  unknown: "Couldn't do that. Check your connection and try again.",
};

export function householdErrorCopy(code: HouseholdFailure): string {
  return COPY[code];
}
