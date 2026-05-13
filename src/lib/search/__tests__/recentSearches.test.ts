/**
 * Tests for src/lib/search/recentSearches.ts.
 *
 * Run via: npm run test:search-recents
 *           (which is: npx tsx src/lib/search/__tests__/recentSearches.test.ts)
 *
 * Uses node:assert/strict + a localStorage polyfill since tsx runs in
 * plain Node.
 */

import assert from "node:assert/strict";

// ── localStorage polyfill ──────────────────────────────────────────
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
  get length(): number { return this.map.size; }
  key(i: number): string | null { return Array.from(this.map.keys())[i] ?? null; }
}
(globalThis as any).localStorage = new MemoryStorage();

// Wrap in async main so the dynamic import (which must run AFTER the
// polyfill is in place) doesn't need top-level await — tsx targets
// CJS for `.ts` files run directly, and CJS forbids it.
async function main() {
const {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} = await import("../recentSearches.ts");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  // Reset storage between tests so state doesn't leak.
  clearRecentSearches();
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

test("empty store returns an empty array", () => {
  assert.deepStrictEqual(getRecentSearches(), []);
});

test("add inserts at the front", () => {
  addRecentSearch("first");
  addRecentSearch("second");
  assert.deepStrictEqual(getRecentSearches(), ["second", "first"]);
});

test("add trims whitespace", () => {
  addRecentSearch("   saltburn   ");
  assert.deepStrictEqual(getRecentSearches(), ["saltburn"]);
});

test("add ignores empty / whitespace-only queries", () => {
  addRecentSearch("");
  addRecentSearch("   ");
  assert.deepStrictEqual(getRecentSearches(), []);
});

test("dedupe is case-insensitive; new casing wins", () => {
  addRecentSearch("lord of the rings");
  addRecentSearch("other");
  addRecentSearch("Lord of the Rings");
  assert.deepStrictEqual(getRecentSearches(), ["Lord of the Rings", "other"]);
});

test("dedupe moves the existing entry to the front", () => {
  addRecentSearch("a");
  addRecentSearch("b");
  addRecentSearch("c");
  addRecentSearch("a");
  assert.deepStrictEqual(getRecentSearches(), ["a", "c", "b"]);
});

test("capped at 20 entries", () => {
  for (let i = 0; i < 25; i++) addRecentSearch(`query ${i}`);
  const list = getRecentSearches();
  assert.equal(list.length, 20);
  // Most recent first
  assert.equal(list[0], "query 24");
  // Oldest five dropped
  assert.equal(list.includes("query 0"), false);
  assert.equal(list.includes("query 4"), false);
  assert.equal(list.includes("query 5"), true);
});

test("remove drops the entry by case-insensitive match", () => {
  addRecentSearch("Saltburn");
  addRecentSearch("Other");
  removeRecentSearch("saltburn");
  assert.deepStrictEqual(getRecentSearches(), ["Other"]);
});

test("remove of a missing entry is a no-op", () => {
  addRecentSearch("a");
  removeRecentSearch("nope");
  assert.deepStrictEqual(getRecentSearches(), ["a"]);
});

test("clear empties the store", () => {
  addRecentSearch("a");
  addRecentSearch("b");
  clearRecentSearches();
  assert.deepStrictEqual(getRecentSearches(), []);
});

test("malformed JSON in storage is treated as empty", () => {
  localStorage.setItem("videx_recent_searches", "{not valid json");
  assert.deepStrictEqual(getRecentSearches(), []);
});

test("non-array JSON in storage is treated as empty", () => {
  localStorage.setItem("videx_recent_searches", JSON.stringify({ a: 1 }));
  assert.deepStrictEqual(getRecentSearches(), []);
});

test("non-string entries in storage are filtered out", () => {
  localStorage.setItem("videx_recent_searches", JSON.stringify(["a", 5, null, "b"]));
  assert.deepStrictEqual(getRecentSearches(), ["a", "b"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
