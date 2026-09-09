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
  isContentIntentSearch,
  isWithinAttributionWindow,
} from "../searchAttribution.ts";
import { SEARCH_ATTRIBUTION_WINDOW_SECONDS } from "../types.ts";
import { DEFAULT_FILTERS } from "../../content/browseFilters.ts";
import { refineLogMetadata } from "../../content/refineChips.ts";

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

describe("isContentIntentSearch", () => {
  // The four cases that decide whether a `search` row hands the next
  // interaction in its session a 1.3x taste boost. Both the emit path
  // (emitSearch) and the batch recompute (recomputeFromInteractionsScoped)
  // route through this one predicate, so these four cover both.

  it("boosts a typed lookup", () => {
    expect(
      isContentIntentSearch({
        query: "heat 1995",
        result_count: 11,
        mode: "lookup",
        category: "Movies",
      }),
    ).toBe(true);
  });

  it("boosts a semantic mood tap", () => {
    expect(
      isContentIntentSearch({
        query: "an eerie, unsettling and atmospheric horror or thriller",
        result_count: 48,
        mode: "semantic",
        mood_key: "late",
        semantic: true,
      }),
    ).toBe(true);
  });

  it("boosts a mood preset tap with the semantic flag off", () => {
    // Same user intent as the semantic case — a described vibe — just a
    // different retrieval path, so it must not be treated differently.
    expect(
      isContentIntentSearch({
        query: null,
        result_count: 26,
        mode: "filter",
        mood_key: "comfort",
        semantic: false,
      }),
    ).toBe(true);
  });

  it("does NOT boost a bare filter apply (no mood_key)", () => {
    // This is the case that matters: Session 2's quick-filter chips emit
    // one of these on every chip change on New and For You. Boosting them
    // would turn an idle browse into a taste event.
    expect(
      isContentIntentSearch({
        query: null,
        result_count: 26,
        mode: "filter",
        filters: { contentType: "movie" },
      }),
    ).toBe(false);
  });

  it("treats an explicitly null mood_key the same as an absent one", () => {
    expect(
      isContentIntentSearch({ query: null, mode: "filter", mood_key: null }),
    ).toBe(false);
  });

  it("keeps rows that predate the mode field rather than dropping history", () => {
    expect(isContentIntentSearch({ query: "the bear", result_count: 3 })).toBe(true);
    expect(isContentIntentSearch(null)).toBe(true);
    expect(isContentIntentSearch(undefined)).toBe(true);
  });
});

describe("isContentIntentSearch — refine chips are never intent", () => {
  // The defect this closes: Browse's refine row shipped stamping
  // `mood_key: intent.moodKey` on every toggle, so a chip tapped while a
  // preset was lit satisfied the "mood preset with the flag off" line above
  // and re-armed the 60 s 1.3x taste boost on what is a re-slice of the page
  // already on screen. Three sessions apart — a later one writing metadata an
  // earlier one's rule read as intent.
  //
  // The call site no longer sends `mood_key` (see `refineLogMetadata`), and
  // this predicate excludes the row anyway. Both, deliberately: the batch
  // recompute still has to judge every row already written to production, and
  // a rule that holds only while each caller remembers is not a rule.

  const FILTERS = { contentType: "movie", released: "last_12_months" };

  it("does NOT boost a refine row that still carries a mood_key", () => {
    expect(
      isContentIntentSearch({
        query: null,
        result_count: 12,
        mode: "filter",
        refine: "released",
        on: true,
        filters: FILTERS,
        // The rows already in production, written before 2026-09-09.
        mood_key: "comfort",
      }),
    ).toBe(false);
  });

  it("does NOT boost a refine row that carries the typed text", () => {
    expect(
      isContentIntentSearch({
        query: "severance",
        result_count: 4,
        mode: "filter",
        refine: "runtime",
        on: true,
        filters: FILTERS,
      }),
    ).toBe(false);
  });

  it("does NOT boost a refine row switching a chip OFF", () => {
    expect(
      isContentIntentSearch({
        query: null,
        mode: "filter",
        refine: "cost",
        on: false,
        filters: FILTERS,
      }),
    ).toBe(false);
  });

  it("still boosts a preset tap with a mood_key and no refine key", () => {
    // The line the exclusion must not swallow: same `mode`, same shape, and
    // a real statement of what the user wants.
    expect(
      isContentIntentSearch({
        query: null,
        result_count: 26,
        mode: "filter",
        mood_key: "comfort",
        semantic: false,
      }),
    ).toBe(true);
  });

  it("what the call site actually emits is not intent, and carries no term", () => {
    // Bound to the real builder rather than a copy of its output, because
    // what makes this row safe is the fields it does NOT have.
    const metadata = refineLogMetadata("released", true, {
      ...DEFAULT_FILTERS,
      released: "last_12_months",
    });
    const row = { query: null, result_count: 12, mode: "filter", ...metadata };

    expect(isContentIntentSearch(row)).toBe(false);
    expect("mood_key" in metadata).toBe(false);
    // The 079 nightly rollup aggregates on `metadata->>'query' IS NOT NULL`,
    // so a null term is what keeps a refine toggle out of the search-term
    // counts entirely — no double-counting the text of the typed query the
    // user was refining.
    expect(row.query).toBe(null);
  });
});

