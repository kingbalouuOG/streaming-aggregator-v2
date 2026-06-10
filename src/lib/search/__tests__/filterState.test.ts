/**
 * Tests for src/lib/search/filterState.ts.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect } from "vitest";
import {
  defaultFor,
  isDefault,
  serialize,
  deserialize,
  hash,
  type FilterState,
} from "../filterState.ts";
import type { ServiceId } from "../../../components/platformLogos.ts";

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

describe("defaultFor", () => {
  it("pre-selects all user services", () => {
    const s = defaultFor(USER);
    expect(s.services.sort()).toEqual(["apple", "netflix"]);
    expect(s.onlyOnMyServices).toBe(true);
  });

  it("with no services yields an empty array, not undefined", () => {
    const s = defaultFor([]);
    expect(s.services).toEqual([]);
  });

  it("scalars match brief defaults", () => {
    const s = defaultFor(USER);
    expect(s.contentType).toBe("all");
    expect(s.costs).toEqual([]);
    expect(s.runtime).toBe("any");
    expect(s.minRating).toBe(0);
    expect(s.showWatched).toBe("all");
    expect(s.genres).toEqual([]);
    expect(s.languages).toEqual([]);
  });
});

describe("isDefault", () => {
  it("true for freshly-built default", () => {
    expect(isDefault(defaultFor(USER), USER)).toBe(true);
  });

  it("false when a single axis is set", () => {
    const s = defaultFor(USER);
    s.minRating = 6.8;
    expect(isDefault(s, USER)).toBe(false);
  });

  it("false when services drift from user set", () => {
    const s = defaultFor(USER);
    s.services = ["netflix"];
    expect(isDefault(s, USER)).toBe(false);
  });

  it("false when onlyOnMyServices flipped", () => {
    const s = defaultFor(USER);
    s.onlyOnMyServices = false;
    expect(isDefault(s, USER)).toBe(false);
  });
});

describe("serialize / deserialize round-trip", () => {
  function roundTrip(state: FilterState): FilterState {
    const params = serialize(state, USER);
    return deserialize(params, USER, GENRES, LANGUAGES);
  }

  it("round-trip: default state yields empty URL and reconstructs identically", () => {
    const s = defaultFor(USER);
    const params = serialize(s, USER);
    expect(params.toString()).toBe("");
    expect(roundTrip(s)).toEqual(s);
  });

  it("round-trip: fully-populated state", () => {
    const s: FilterState = {
      services: ["netflix"],
      contentType: "movie",
      costs: ["free", "rent"],
      runtime: "60_120",
      genres: ["Drama", "Thriller"],
      minRating: 6.8,
      showWatched: "hide",
      languages: ["English", "Korean"],
      onlyOnMyServices: false,
    };
    const rt = roundTrip(s);
    expect(rt.services.sort()).toEqual(["netflix"]);
    expect(rt.contentType).toBe("movie");
    expect(rt.costs.sort()).toEqual(["free", "rent"]);
    expect(rt.runtime).toBe("60_120");
    expect(rt.genres.sort()).toEqual(["Drama", "Thriller"]);
    expect(rt.minRating).toBe(6.8);
    expect(rt.showWatched).toBe("hide");
    expect(rt.languages.sort()).toEqual(["English", "Korean"]);
    expect(rt.onlyOnMyServices).toBe(false);
  });

  it("serialize omits default values from URL", () => {
    const s = defaultFor(USER);
    s.minRating = 7.0;
    const params = serialize(s, USER);
    expect(params.get("min")).toBe("7.0");
    expect(params.get("type")).toBe(null);
    expect(params.get("services")).toBe(null);
  });

  it("serialize emits services= when user opts a service out", () => {
    const s = defaultFor(USER);
    s.services = ["netflix"];
    const params = serialize(s, USER);
    expect(params.get("services")).toBe("netflix");
  });

  it("deserialize ignores unknown enum values", () => {
    const params = new URLSearchParams("type=bogus&cost=rent,buy");
    const s = deserialize(params, USER, GENRES, LANGUAGES);
    expect(s.contentType).toBe("all");
    expect(s.costs.sort()).toEqual(["buy", "rent"]);
  });

  it("deserialize ignores unknown service ids", () => {
    const params = new URLSearchParams("services=netflix,fakehulu");
    const s = deserialize(params, USER, GENRES, LANGUAGES);
    expect(s.services).toEqual(["netflix"]);
  });

  it("deserialize clamps minRating into 0–10", () => {
    const high = deserialize(new URLSearchParams("min=15"), USER, GENRES, LANGUAGES);
    expect(high.minRating).toBe(0);
    const ok = deserialize(new URLSearchParams("min=6.8"), USER, GENRES, LANGUAGES);
    expect(ok.minRating).toBe(6.8);
  });

  it("deserialize unsulgs genres against catalogue", () => {
    const s = deserialize(new URLSearchParams("genre=sci-fi,drama"), USER, GENRES, LANGUAGES);
    expect(s.genres.sort()).toEqual(["Drama", "Sci-Fi"]);
  });
});

describe("hash stability", () => {
  it("hash is stable across irrelevant key order in genres", () => {
    const a: FilterState = { ...defaultFor(USER), genres: ["Drama", "Thriller"] };
    const b: FilterState = { ...defaultFor(USER), genres: ["Thriller", "Drama"] };
    expect(hash(a)).toBe(hash(b));
  });

  it("hash is stable across irrelevant key order in services", () => {
    const a: FilterState = { ...defaultFor(USER), services: ["netflix", "apple"] };
    const b: FilterState = { ...defaultFor(USER), services: ["apple", "netflix"] };
    expect(hash(a)).toBe(hash(b));
  });

  it("hash differs across material changes", () => {
    const a = defaultFor(USER);
    const b: FilterState = { ...a, minRating: 6.8 };
    expect(hash(a)).not.toBe(hash(b));
  });

  it("hash output is 8-char hex", () => {
    const h = hash(defaultFor(USER));
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});
