/**
 * Structural regression check for A5's ContentCard search-variant
 * props (`offService`, `rentBuyPriceLabel`).
 *
 * The codebase has no React test renderer (no vitest, no testing-
 * library), so a real snapshot test isn't possible without adding
 * substantial infra. The actual regression risk A5 introduced is
 * narrower than "every variant looks the same": it's that the new
 * props could leak to non-search call-sites and produce surprise
 * behaviour on Home / For You / Watchlist.
 *
 * This test enforces the allowlist at the source level — only the
 * search surface and BrowseCard (the pass-through wrapper) are
 * permitted to pass `offService=` or `rentBuyPriceLabel=`. Any new
 * call-site that does will fail the test loudly.
 *
 * Run via: npm run test:contentcard-search-props
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// __dirname is src/lib/search/__tests__; go up four to project root.
const PROJECT_ROOT = resolve(__dirname, "../../../..");
const COMPONENTS_DIR = join(PROJECT_ROOT, "src", "components");
const HOOKS_DIR = join(PROJECT_ROOT, "src", "hooks");

const SEARCH_PROPS = ["offService", "rentBuyPriceLabel"] as const;

// Files allowed to mention these props:
//   - ContentCard.tsx: defines them
//   - BrowseCard.tsx: forwards them via spread props
//   - BrowsePage.tsx: the only surface that passes them
//   - useSearch.ts: comments and refs reference the related state
const ALLOWED_FILES = new Set([
  "ContentCard.tsx",
  "BrowseCard.tsx",
  "BrowsePage.tsx",
  "useSearch.ts",
]);

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsxFiles(full));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

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

// Collect violations: files outside the allowlist that mention either
// prop in a way that suggests they're passing it as a JSX prop.
function findViolations(dir: string): Array<{ file: string; prop: string; lines: number[] }> {
  const violations: Array<{ file: string; prop: string; lines: number[] }> = [];
  for (const path of listTsxFiles(dir)) {
    const filename = path.split(/[\/\\]/).pop()!;
    if (ALLOWED_FILES.has(filename)) continue;
    const text = readFileSync(path, "utf-8");
    const lines = text.split("\n");
    for (const prop of SEARCH_PROPS) {
      // JSX-prop pattern: ` propName=` or ` propName: `. We're loose
      // here — false positives are unlikely outside of intentional use.
      const propMatches: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`${prop}=`) || lines[i].includes(`${prop}: `)) {
          propMatches.push(i + 1);
        }
      }
      if (propMatches.length > 0) {
        violations.push({ file: path, prop, lines: propMatches });
      }
    }
  }
  return violations;
}

// ── Tests ───────────────────────────────────────────────────────────

test("no non-search file passes offService / rentBuyPriceLabel to ContentCard", () => {
  const componentsViolations = findViolations(COMPONENTS_DIR);
  const hooksViolations = findViolations(HOOKS_DIR);
  const all = [...componentsViolations, ...hooksViolations];
  if (all.length > 0) {
    const detail = all
      .map((v) => `  ${v.file} (lines ${v.lines.join(", ")}): ${v.prop}`)
      .join("\n");
    assert.fail(
      `Found ${all.length} unexpected usage(s) of search-only ContentCard props ` +
      `outside the allowlist (${[...ALLOWED_FILES].join(", ")}):\n${detail}\n` +
      `\nIf this is intentional, add the file to ALLOWED_FILES in this test ` +
      `AND document the rationale in ContentCard's JSDoc.`,
    );
  }
});

test("ContentCard's prop defaults preserve non-search visual behaviour", () => {
  const path = join(COMPONENTS_DIR, "ContentCard.tsx");
  const text = readFileSync(path, "utf-8");
  // The default values must remain falsy so existing call-sites that
  // don't pass either prop get the legacy anatomy.
  assert.match(text, /offService\s*=\s*false/, "offService must default to false");
  // rentBuyPriceLabel: no default declared (undefined). Verify the
  // prop is destructured without a default.
  assert.match(text, /rentBuyPriceLabel,/, "rentBuyPriceLabel must not have a non-falsy default");
});

test("BrowseCard surfaces the props via interface AND forwards via spread", () => {
  const path = join(COMPONENTS_DIR, "BrowseCard.tsx");
  const text = readFileSync(path, "utf-8");
  assert.match(text, /offService\?: boolean/, "offService must appear in BrowseCardProps");
  assert.match(text, /rentBuyPriceLabel\?: string/, "rentBuyPriceLabel must appear in BrowseCardProps");
  assert.match(text, /\{\.\.\.rest\}/, "BrowseCard must spread {...rest} to ContentCard");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
