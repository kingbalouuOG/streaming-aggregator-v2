/**
 * Tests for the `search_logging` gate inside emitSearch
 * (src/lib/storage/interactions.ts).
 *
 * This suite is otherwise pure-function only; this file uses vi.mock
 * deliberately. The gate is a SAFETY property — "no search row unless the
 * user's flag is on" — and it is exactly the kind of thing a later
 * refactor removes without noticing, because nothing else fails when it
 * goes. It shipped as a call-site discipline first, and Session 2's
 * quick-filter chips would have bypassed it. A test is cheaper than
 * rediscovering that on a device.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn((_row: unknown) => Promise.resolve({ error: null }));
const getFlagMock = vi.fn<() => Promise<boolean>>();

// The real lifecycle chain (sessionId -> appState) statically imports
// @capacitor/*, which is not installed for the web tree. Stub the session
// id rather than the whole chain.
vi.mock("../../instrumentation/sessionId.ts", () => ({
  getCurrentSessionId: () => "11111111-2222-3333-4444-555555555555",
}));
vi.mock("../../supabase.ts", () => ({
  supabase: { from: () => ({ insert: insertMock }) },
}));
vi.mock("../../storage.ts", () => ({
  isSupabaseActive: () => true,
  getAuthUserId: () => "user-under-test",
}));
vi.mock("../../featureFlags.ts", () => ({
  getFlag: () => getFlagMock(),
}));
vi.mock("../recommendations.ts", () => ({
  invalidateDismissedIdsCache: () => {},
}));

import { emitSearch } from "../interactions.ts";
import {
  getMostRecentSearchAt,
  resetSearchAttributionCache,
} from "../../taste-v2/searchAttribution.ts";

const SESSION = "11111111-2222-3333-4444-555555555555";

/** Let the fire-and-forget async IIFE inside emitSearch settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("emitSearch — search_logging gate", () => {
  beforeEach(() => {
    insertMock.mockClear();
    getFlagMock.mockReset();
    resetSearchAttributionCache();
  });

  it("writes nothing when the flag is off", async () => {
    getFlagMock.mockResolvedValue(false);
    emitSearch("severance", 13, { mode: "lookup", metadata: { category: "All" } });
    await flush();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not mark the session searched when the flag is off", async () => {
    // Otherwise the incremental path would boost a search the nightly
    // recompute cannot see, and the recompute would then take it away.
    getFlagMock.mockResolvedValue(false);
    emitSearch("severance", 13, { mode: "lookup" });
    await flush();
    expect(getMostRecentSearchAt(SESSION)).toBe(null);
  });

  it("writes the row when the flag is on", async () => {
    getFlagMock.mockResolvedValue(true);
    emitSearch("severance", 13, { mode: "lookup", metadata: { category: "All" } });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      event_type: "search",
      session_id: SESSION,
      metadata: {
        query: "severance",
        result_count: 13,
        mode: "lookup",
        category: "All",
      },
    });
    expect(getMostRecentSearchAt(SESSION)).not.toBe(null);
  });

  it("writes a bare filter apply but does not let it earn the boost", async () => {
    // The content-intent rule, verified through the real emitter rather
    // than against the predicate alone.
    getFlagMock.mockResolvedValue(true);
    emitSearch("", 20, {
      mode: "filter",
      metadata: { query: null, filters: { contentType: "movie" } },
    });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(getMostRecentSearchAt(SESSION)).toBe(null);
  });

  it("lets a mood preset tap earn the boost", async () => {
    getFlagMock.mockResolvedValue(true);
    emitSearch("", 40, {
      mode: "filter",
      metadata: { query: null, mood_key: "slow", semantic: false },
    });
    await flush();
    expect(getMostRecentSearchAt(SESSION)).not.toBe(null);
  });
});
