/**
 * Tests for src/lib/taste-v2/searchAttribution.ts.
 *
 * Run via: npm run test:search-attribution
 *
 * Uses node:assert/strict — same pattern as filterState.test.ts.
 */

import assert from "node:assert/strict";
import {
  recordSearchTimestamp,
  getMostRecentSearchAt,
  resetSearchAttributionCache,
  isWithinAttributionWindow,
} from "../searchAttribution.ts";
import { SEARCH_ATTRIBUTION_WINDOW_SECONDS } from "../types.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    resetSearchAttributionCache();
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── recordSearchTimestamp + getMostRecentSearchAt ────────────────────

test("returns null when no search has been recorded for the session", () => {
  assert.equal(getMostRecentSearchAt("session-a"), null);
});

test("returns null for null/undefined session id", () => {
  recordSearchTimestamp("session-a");
  assert.equal(getMostRecentSearchAt(null), null);
  assert.equal(getMostRecentSearchAt(undefined), null);
});

test("null/undefined session id on record is a no-op", () => {
  recordSearchTimestamp(null);
  recordSearchTimestamp(undefined);
  recordSearchTimestamp("");
  assert.equal(getMostRecentSearchAt("session-a"), null);
});

test("records and retrieves a timestamp for a session", () => {
  const before = Date.now();
  recordSearchTimestamp("session-a");
  const ts = getMostRecentSearchAt("session-a");
  assert.notEqual(ts, null);
  assert.ok((ts as number) >= before);
  assert.ok((ts as number) <= Date.now());
});

test("sessions are isolated from each other", () => {
  recordSearchTimestamp("session-a");
  assert.notEqual(getMostRecentSearchAt("session-a"), null);
  assert.equal(getMostRecentSearchAt("session-b"), null);
});

test("re-recording overwrites the prior timestamp", () => {
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
  assert.equal(second, after);
  assert.notEqual(first, second);
});

test("resetSearchAttributionCache clears all sessions", () => {
  recordSearchTimestamp("session-a");
  recordSearchTimestamp("session-b");
  resetSearchAttributionCache();
  assert.equal(getMostRecentSearchAt("session-a"), null);
  assert.equal(getMostRecentSearchAt("session-b"), null);
});

// ── isWithinAttributionWindow ────────────────────────────────────────

test("returns false when search timestamp is null", () => {
  assert.equal(isWithinAttributionWindow(Date.now(), null), false);
});

test("returns true for event right after search", () => {
  const t = 1000;
  assert.equal(isWithinAttributionWindow(t + 100, t), true);
});

test("returns true for event at exact window boundary", () => {
  const t = 1000;
  const exactEdge = t + SEARCH_ATTRIBUTION_WINDOW_SECONDS * 1000;
  assert.equal(isWithinAttributionWindow(exactEdge, t), true);
});

test("returns false just past the window edge", () => {
  const t = 1000;
  const justPast = t + SEARCH_ATTRIBUTION_WINDOW_SECONDS * 1000 + 1;
  assert.equal(isWithinAttributionWindow(justPast, t), false);
});

test("returns false when event precedes search (lower bound guard)", () => {
  const t = 1000;
  assert.equal(isWithinAttributionWindow(t - 100, t), false);
});

test("returns true when event and search are simultaneous", () => {
  const t = 1000;
  assert.equal(isWithinAttributionWindow(t, t), true);
});

// ── Summary ──────────────────────────────────────────────────────────

console.log("");
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
