/**
 * Tests for src/lib/search/filterState.ts.
 *
 * Run via: npm run test:search
 *           (which is: npx tsx src/lib/search/__tests__/filterState.test.ts)
 *
 * Uses node:assert/strict — same pattern as scripts/fingerprints/__tests__.
 */

import assert from "node:assert/strict";
import {
  defaultFor,
  isDefault,
  serialize,
  deserialize,
  hash,
  type FilterState,
} from "../filterState.ts";
import type { ServiceId } from "../../../components/platformLogos.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
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

const GENRES: readonly string[] = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Sci-Fi", "Thriller", "War", "Western",
];

const LANGUAGES: readonly string[] = [
  "English", "Japanese", "Korean", "Spanish", "French", "German", "Hindi",
  "Italian", "Turkish", "Danish", "Norwegian", "Swedish",
];

const USER: readonly ServiceId[] = ["netflix", "apple"];

// ── defaultFor ─────────────────────────────────────────────────────

test("defaultFor pre-selects all user services", () => {
  const s = defaultFor(USER);
  assert.deepStrictEqual(s.services.sort(), ["apple", "netflix"]);
  assert.equal(s.onlyOnMyServices, true);
});

test("defaultFor with no services yields an empty array, not undefined", () => {
  const s = defaultFor([]);
  assert.deepStrictEqual(s.services, []);
});

test("defaultFor scalars match brief defaults", () => {
  const s = defaultFor(USER);
  assert.equal(s.contentType, "all");
  assert.equal(s.cost, "all");
  assert.equal(s.runtime, "any");
  assert.equal(s.minRating, 0);
  assert.equal(s.showWatched, "all");
  assert.deepStrictEqual(s.genres, []);
  assert.deepStrictEqual(s.languages, []);
});

// ── isDefault ─────────────────────────────────────────────────────

test("isDefault true for freshly-built default", () => {
  assert.equal(isDefault(defaultFor(USER), USER), true);
});

test("isDefault false when a single axis is set", () => {
  const s = defaultFor(USER);
  s.minRating = 6.8;
  assert.equal(isDefault(s, USER), false);
});

test("isDefault false when services drift from user set", () => {
  const s = defaultFor(USER);
  s.services = ["netflix"];
  assert.equal(isDefault(s, USER), false);
});

test("isDefault false when onlyOnMyServices flipped", () => {
  const s = defaultFor(USER);
  s.onlyOnMyServices = false;
  assert.equal(isDefault(s, USER), false);
});

// ── serialize / deserialize round-trip ────────────────────────────

function roundTrip(state: FilterState): FilterState {
  const params = serialize(state, USER);
  return deserialize(params, USER, GENRES, LANGUAGES);
}

test("round-trip: default state yields empty URL and reconstructs identically", () => {
  const s = defaultFor(USER);
  const params = serialize(s, USER);
  assert.equal(params.toString(), "");
  assert.deepStrictEqual(roundTrip(s), s);
});

test("round-trip: fully-populated state", () => {
  const s: FilterState = {
    services: ["netflix"],
    contentType: "movie",
    cost: "rent",
    runtime: "60_120",
    genres: ["Drama", "Thriller"],
    minRating: 6.8,
    showWatched: "hide",
    languages: ["English", "Korean"],
    onlyOnMyServices: false,
  };
  const rt = roundTrip(s);
  assert.deepStrictEqual(rt.services.sort(), ["netflix"]);
  assert.equal(rt.contentType, "movie");
  assert.equal(rt.cost, "rent");
  assert.equal(rt.runtime, "60_120");
  assert.deepStrictEqual(rt.genres.sort(), ["Drama", "Thriller"]);
  assert.equal(rt.minRating, 6.8);
  assert.equal(rt.showWatched, "hide");
  assert.deepStrictEqual(rt.languages.sort(), ["English", "Korean"]);
  assert.equal(rt.onlyOnMyServices, false);
});

test("serialize omits default values from URL", () => {
  const s = defaultFor(USER);
  s.minRating = 7.0;
  const params = serialize(s, USER);
  assert.equal(params.get("min"), "7.0");
  assert.equal(params.get("type"), null);
  assert.equal(params.get("services"), null);
});

test("serialize emits services= when user opts a service out", () => {
  const s = defaultFor(USER);
  s.services = ["netflix"];
  const params = serialize(s, USER);
  assert.equal(params.get("services"), "netflix");
});

test("deserialize ignores unknown enum values", () => {
  const params = new URLSearchParams("type=bogus&cost=rent");
  const s = deserialize(params, USER, GENRES, LANGUAGES);
  assert.equal(s.contentType, "all");
  assert.equal(s.cost, "rent");
});

test("deserialize ignores unknown service ids", () => {
  const params = new URLSearchParams("services=netflix,fakehulu");
  const s = deserialize(params, USER, GENRES, LANGUAGES);
  assert.deepStrictEqual(s.services, ["netflix"]);
});

test("deserialize clamps minRating into 0–10", () => {
  const high = deserialize(new URLSearchParams("min=15"), USER, GENRES, LANGUAGES);
  assert.equal(high.minRating, 0);
  const ok = deserialize(new URLSearchParams("min=6.8"), USER, GENRES, LANGUAGES);
  assert.equal(ok.minRating, 6.8);
});

test("deserialize unsulgs genres against catalogue", () => {
  const s = deserialize(new URLSearchParams("genre=sci-fi,drama"), USER, GENRES, LANGUAGES);
  assert.deepStrictEqual(s.genres.sort(), ["Drama", "Sci-Fi"]);
});

// ── hash stability ───────────────────────────────────────────────

test("hash is stable across irrelevant key order in genres", () => {
  const a: FilterState = { ...defaultFor(USER), genres: ["Drama", "Thriller"] };
  const b: FilterState = { ...defaultFor(USER), genres: ["Thriller", "Drama"] };
  assert.equal(hash(a), hash(b));
});

test("hash is stable across irrelevant key order in services", () => {
  const a: FilterState = { ...defaultFor(USER), services: ["netflix", "apple"] };
  const b: FilterState = { ...defaultFor(USER), services: ["apple", "netflix"] };
  assert.equal(hash(a), hash(b));
});

test("hash differs across material changes", () => {
  const a = defaultFor(USER);
  const b: FilterState = { ...a, minRating: 6.8 };
  assert.notEqual(hash(a), hash(b));
});

test("hash output is 8-char hex", () => {
  const h = hash(defaultFor(USER));
  assert.match(h, /^[0-9a-f]{8}$/);
});

// ── Summary ────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
