/**
 * Tests for src/lib/featureFlags.ts.
 *
 * Two properties, both of which stopped being cosmetic when `search_logging`
 * started riding this accessor on every settled query:
 *
 *   1. The identity read is LOCAL. `getUser()` is a call to /auth/v1/user;
 *      `getSession()` reads what is already in storage. The flag ran ahead
 *      of its own memo, so the "flag-off user costs no network" promise was
 *      false by one auth request per query.
 *   2. The memo EXPIRES. A flag turned off mid-session — consent withdrawn —
 *      has to reach the app before its next restart.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSessionMock = vi.fn();
const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();

// One chainable stub for `.from().select().eq().eq().maybeSingle()`.
const from = vi.fn(() => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => maybeSingleMock(),
  };
  return chain;
});

vi.mock("../supabase.ts", () => ({
  supabase: {
    auth: {
      getSession: () => getSessionMock(),
      getUser: () => getUserMock(),
    },
    from: (...args: unknown[]) => from(...(args as [])),
  },
}));

import { getFlag, resetFlagCache, FLAG_TTL_MS } from "../featureFlags.ts";

const signedIn = { data: { session: { user: { id: "user-under-test" } } } };

describe("getFlag", () => {
  beforeEach(() => {
    resetFlagCache();
    getSessionMock.mockReset().mockResolvedValue(signedIn);
    getUserMock.mockReset();
    maybeSingleMock.mockReset().mockResolvedValue({ data: { enabled: true }, error: null });
    from.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the local session and never calls getUser", () => {
    // getUser() is a network round trip. Nothing on the settled-query path
    // may make one for a user whose flag is off.
    return getFlag("search_logging", false).then((v) => {
      expect(v).toBe(true);
      expect(getSessionMock).toHaveBeenCalledTimes(1);
      expect(getUserMock).not.toHaveBeenCalled();
    });
  });

  it("returns the fallback, and queries nothing, when signed out", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    expect(await getFlag("search_logging", false)).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("memoises: a second read inside the TTL does not hit the table", async () => {
    await getFlag("search_logging", false);
    await getFlag("search_logging", false);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("re-reads once the TTL has passed, and sees the new value", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T10:00:00Z"));

    expect(await getFlag("search_logging", false)).toBe(true);
    expect(from).toHaveBeenCalledTimes(1);

    // Consent withdrawn: the operator turns the flag off mid-session.
    maybeSingleMock.mockResolvedValue({ data: { enabled: false }, error: null });

    // One millisecond short of the TTL the memo still stands, which is the
    // half of this that keeps the read off the hot path.
    vi.setSystemTime(Date.now() + FLAG_TTL_MS - 1);
    expect(await getFlag("search_logging", false)).toBe(true);
    expect(from).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2);
    expect(await getFlag("search_logging", false)).toBe(false);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("caches per flag name, not per user alone", async () => {
    await getFlag("search_logging", false);
    await getFlag("search_semantic", false);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("falls back silently when the row is missing or the read errors", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await getFlag("search_logging", false)).toBe(false);

    resetFlagCache();
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getFlag("search_semantic", true)).toBe(true);
  });

  it("resetFlagCache forces the next read to go back to the table", async () => {
    await getFlag("search_logging", false);
    resetFlagCache();
    await getFlag("search_logging", false);
    expect(from).toHaveBeenCalledTimes(2);
  });
});
