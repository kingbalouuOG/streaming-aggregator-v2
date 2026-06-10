/**
 * Tests for src/lib/taste-v2/searchAttribution.ts.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  recordSearchTimestamp,
  getMostRecentSearchAt,
  resetSearchAttributionCache,
  isWithinAttributionWindow,
} from "../searchAttribution.ts";
import { SEARCH_ATTRIBUTION_WINDOW_SECONDS } from "../types.ts";

describe("recordSearchTimestamp + getMostRecentSearchAt", () => {
  beforeEach(() => {
    resetSearchAttributionCache();
  });

  it("returns null when no search has been recorded for the session", () => {
    expect(getMostRecentSearchAt("session-a")).toBe(null);
  });

  it("returns null for null/undefined session id", () => {
    recordSearchTimestamp("session-a");
    expect(getMostRecentSearchAt(null)).toBe(null);
    expect(getMostRecentSearchAt(undefined)).toBe(null);
  });

  it("null/undefined session id on record is a no-op", () => {
    recordSearchTimestamp(null);
    recordSearchTimestamp(undefined);
    recordSearchTimestamp("");
    expect(getMostRecentSearchAt("session-a")).toBe(null);
  });

  it("records and retrieves a timestamp for a session", () => {
    const before = Date.now();
    recordSearchTimestamp("session-a");
    const ts = getMostRecentSearchAt("session-a");
    expect(ts).not.toBe(null);
    expect((ts as number) >= before).toBe(true);
    expect((ts as number) <= Date.now()).toBe(true);
  });

  it("sessions are isolated from each other", () => {
    recordSearchTimestamp("session-a");
    expect(getMostRecentSearchAt("session-a")).not.toBe(null);
    expect(getMostRecentSearchAt("session-b")).toBe(null);
  });

  it("re-recording overwrites the prior timestamp", () => {
    recordSearchTimestamp("session-a");
    const first = getMostRecentSearchAt("session-a");
    // Force a tick — Map.set will overwrite with a strictly later Date.now.
    const after = Date.now() + 1;
    // Stub Date.now via a thin closure: re-record after computing `after`.
    const originalNow = Date.now;
    (globalThis as { Date: typeof Date }).Date.now = () => after;
    try {
      recordSearchTimestamp("session-a");
    } finally {
      (globalThis as { Date: typeof Date }).Date.now = originalNow;
    }
    const second = getMostRecentSearchAt("session-a");
    expect(second).toBe(after);
    expect(second).not.toBe(first);
  });

  it("resetSearchAttributionCache clears all sessions", () => {
    recordSearchTimestamp("session-a");
    recordSearchTimestamp("session-b");
    resetSearchAttributionCache();
    expect(getMostRecentSearchAt("session-a")).toBe(null);
    expect(getMostRecentSearchAt("session-b")).toBe(null);
  });
});

describe("isWithinAttributionWindow", () => {
  beforeEach(() => {
    resetSearchAttributionCache();
  });

  it("returns false when search timestamp is null", () => {
    expect(isWithinAttributionWindow(Date.now(), null)).toBe(false);
  });

  it("returns true for event right after search", () => {
    const t = 1000;
    expect(isWithinAttributionWindow(t + 100, t)).toBe(true);
  });

  it("returns true for event at exact window boundary", () => {
    const t = 1000;
    const exactEdge = t + SEARCH_ATTRIBUTION_WINDOW_SECONDS * 1000;
    expect(isWithinAttributionWindow(exactEdge, t)).toBe(true);
  });

  it("returns false just past the window edge", () => {
    const t = 1000;
    const justPast = t + SEARCH_ATTRIBUTION_WINDOW_SECONDS * 1000 + 1;
    expect(isWithinAttributionWindow(justPast, t)).toBe(false);
  });

  it("returns false when event precedes search (lower bound guard)", () => {
    const t = 1000;
    expect(isWithinAttributionWindow(t - 100, t)).toBe(false);
  });

  it("returns true when event and search are simultaneous", () => {
    const t = 1000;
    expect(isWithinAttributionWindow(t, t)).toBe(true);
  });
});
