/**
 * Tests for src/lib/search/recentSearches.ts.
 *
 * Run via: npm test (vitest)
 *
 * vitest's jsdom environment provides localStorage, so the Node
 * polyfill the old tsx-script version carried is no longer needed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "../recentSearches.ts";

describe("recentSearches", () => {
  // Reset storage between tests so state doesn't leak.
  beforeEach(() => {
    clearRecentSearches();
  });

  it("empty store returns an empty array", () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it("add inserts at the front", () => {
    addRecentSearch("first");
    addRecentSearch("second");
    expect(getRecentSearches()).toEqual(["second", "first"]);
  });

  it("add trims whitespace", () => {
    addRecentSearch("   saltburn   ");
    expect(getRecentSearches()).toEqual(["saltburn"]);
  });

  it("add ignores empty / whitespace-only queries", () => {
    addRecentSearch("");
    addRecentSearch("   ");
    expect(getRecentSearches()).toEqual([]);
  });

  it("dedupe is case-insensitive; new casing wins", () => {
    addRecentSearch("lord of the rings");
    addRecentSearch("other");
    addRecentSearch("Lord of the Rings");
    expect(getRecentSearches()).toEqual(["Lord of the Rings", "other"]);
  });

  it("dedupe moves the existing entry to the front", () => {
    addRecentSearch("a");
    addRecentSearch("b");
    addRecentSearch("c");
    addRecentSearch("a");
    expect(getRecentSearches()).toEqual(["a", "c", "b"]);
  });

  it("capped at 20 entries", () => {
    for (let i = 0; i < 25; i++) addRecentSearch(`query ${i}`);
    const list = getRecentSearches();
    expect(list.length).toBe(20);
    // Most recent first
    expect(list[0]).toBe("query 24");
    // Oldest five dropped
    expect(list.includes("query 0")).toBe(false);
    expect(list.includes("query 4")).toBe(false);
    expect(list.includes("query 5")).toBe(true);
  });

  it("remove drops the entry by case-insensitive match", () => {
    addRecentSearch("Saltburn");
    addRecentSearch("Other");
    removeRecentSearch("saltburn");
    expect(getRecentSearches()).toEqual(["Other"]);
  });

  it("remove of a missing entry is a no-op", () => {
    addRecentSearch("a");
    removeRecentSearch("nope");
    expect(getRecentSearches()).toEqual(["a"]);
  });

  it("clear empties the store", () => {
    addRecentSearch("a");
    addRecentSearch("b");
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });

  it("malformed JSON in storage is treated as empty", () => {
    localStorage.setItem("videx_recent_searches", "{not valid json");
    expect(getRecentSearches()).toEqual([]);
  });

  it("non-array JSON in storage is treated as empty", () => {
    localStorage.setItem("videx_recent_searches", JSON.stringify({ a: 1 }));
    expect(getRecentSearches()).toEqual([]);
  });

  it("non-string entries in storage are filtered out", () => {
    localStorage.setItem("videx_recent_searches", JSON.stringify(["a", 5, null, "b"]));
    expect(getRecentSearches()).toEqual(["a", "b"]);
  });
});
