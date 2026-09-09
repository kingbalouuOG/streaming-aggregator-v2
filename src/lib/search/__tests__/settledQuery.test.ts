/**
 * Tests for src/lib/search/settledQuery.ts.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect } from "vitest";
import {
  collapsesInto,
  reconcileSettled,
  type SettledQuery,
} from "../settledQuery.ts";

const q = (query: string, resultCount: number, route = "lookup"): SettledQuery => ({
  query,
  route,
  resultCount,
});

describe("collapsesInto", () => {
  it("collapses a query still being typed", () => {
    expect(collapsesInto("sev", "severance")).toBe(true);
  });

  it("collapses a query being corrected by backspacing", () => {
    // The direction that a forward-only prefix test misses, and the one
    // the real 2026-09-08 capture actually did.
    expect(collapsesInto("severence", "sever")).toBe(true);
  });

  it("collapses a query that settles twice unchanged", () => {
    expect(collapsesInto("severance", "severance")).toBe(true);
  });

  it("does NOT collapse two unrelated searches", () => {
    expect(collapsesInto("severance", "the bear")).toBe(false);
    expect(collapsesInto("the bear", "lord of the")).toBe(false);
  });

  it("collapses a typo corrected mid-word, where neither is a prefix", () => {
    // The second real capture. `severenc` and `severance` diverge at
    // character six, so the prefix test alone called them unrelated and
    // wrote the abandoned typo as a row.
    expect("severance".startsWith("severenc")).toBe(false);
    expect("severenc".startsWith("severance")).toBe(false);
    expect(collapsesInto("severenc", "severance")).toBe(true);
  });

  it("does not fuzzy-match short queries, where two edits is the word", () => {
    expect(collapsesInto("cars", "bars")).toBe(true); // distance 1, still one word being fixed
    expect(collapsesInto("cat", "dog")).toBe(false); // under the length floor
    expect(collapsesInto("severance", "severed")).toBe(false); // distance 3
  });

  it("ignores case and surrounding space, as the daily aggregate does", () => {
    expect(collapsesInto("Sev", "  severance ")).toBe(true);
  });
});

describe("reconcileSettled", () => {
  it("holds the first settled query rather than writing it", () => {
    const r = reconcileSettled(null, q("sev", 56));
    expect(r.emit).toBe(null);
    expect(r.pending.query).toBe("sev");
  });

  it("writes the held query when an unrelated search settles", () => {
    const r = reconcileSettled(q("severance", 13), q("the bear", 18));
    expect(r.emit?.query).toBe("severance");
    expect(r.pending.query).toBe("the bear");
  });

  it("flushes rather than collapses when only the route changed", () => {
    // "Search titles instead" re-answers the same text through a different
    // retrieval path, with a different result count. That is a second
    // search, not the first one still being typed.
    const r = reconcileSettled(
      q("severance", 60, "described"),
      q("severance", 13, "title"),
    );
    expect(r.emit?.route).toBe("described");
    expect(r.pending.route).toBe("title");
  });

  it("collapses the real 2026-09-08 capture to the one query meant", () => {
    // Verbatim from production: four rows, ~2.8s apart, for one search.
    //   sev 56 -> severence 0 -> sever 41 -> severance 13
    const typed = [q("sev", 56), q("severence", 0), q("sever", 41), q("severance", 13)];

    const written: SettledQuery[] = [];
    let pending: SettledQuery | null = null;
    for (const candidate of typed) {
      const r = reconcileSettled(pending, candidate);
      if (r.emit) written.push(r.emit);
      pending = r.pending;
    }
    // Nothing written while the user was still typing...
    expect(written).toEqual([]);
    // ...and a terminal signal writes only what they landed on.
    expect(pending).toEqual(q("severance", 13));

    // The point of the fix: the abandoned typo never becomes a data point.
    // Before it, this session reported a 25% zero-result rate against a
    // 10% "retrieval bug" threshold (recommendation §6). Now it reports 0%.
    const finalRows: SettledQuery[] = pending ? [...written, pending] : written;
    const zeroRate = finalRows.filter((r) => r.resultCount === 0).length / finalRows.length;
    expect(zeroRate).toBe(0);
  });

  it("collapses the second capture — a mid-word correction — to one row", () => {
    // Verbatim from production: severenc (0) then severance (13), which
    // the prefix-only rule split into two rows and a fake 50% zero rate.
    const r = reconcileSettled(q("severenc", 0), q("severance", 13));
    expect(r.emit).toBe(null);
    expect(r.pending).toEqual(q("severance", 13));
  });

  it("still separates two genuine searches in one session", () => {
    const typed = [q("sev", 56), q("severance", 13), q("the bear", 18), q("the bear s3", 6)];

    const written: SettledQuery[] = [];
    let pending: SettledQuery | null = null;
    for (const candidate of typed) {
      const r = reconcileSettled(pending, candidate);
      if (r.emit) written.push(r.emit);
      pending = r.pending;
    }
    expect(written.map((r) => r.query)).toEqual(["severance"]);
    expect(pending?.query).toBe("the bear s3");
  });
});
