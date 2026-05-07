/**
 * Visual-test harness for the v3 redesign debug surfaces.
 *
 * Drives a Playwright Chromium against the running dev server,
 * captures full-page screenshots and DOM measurements, writes them
 * to tmp/visual/. Both outputs are gitignored.
 *
 * Usage:
 *   node scripts/visual.mjs                 # all routes, dark + light
 *   node scripts/visual.mjs contentcard     # one route, both themes
 *   node scripts/visual.mjs all dark        # all routes, dark only
 *   node scripts/visual.mjs servicestack light
 *
 * Routes match the ?debug=<name> gate in src/App.tsx.
 *
 * Requires the dev server at http://localhost:3000. Start with `npm run dev`
 * in another terminal first.
 */

import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = ["icons", "sectionhead", "contentcard", "servicestack"];
const THEMES = ["dark", "light"];
const BASE = "http://localhost:3000";
const OUT = "tmp/visual";
const VIEWPORT = { width: 390, height: 844 };

const args = process.argv.slice(2);
const routeArg = args[0] ?? "all";
const themeArg = args[1] ?? "both";
const routes = routeArg === "all" ? ROUTES : [routeArg];
const themes = themeArg === "both" ? THEMES : [themeArg];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const results = [];

for (const route of routes) {
  for (const theme of themes) {
    const url = `${BASE}/?debug=${route}`;
    process.stdout.write(`→ ${route} (${theme})  `);

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      document.documentElement.setAttribute("data-theme", t);
    }, theme);
    // Allow fonts + images to settle before snapshotting.
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(400);

    const file = join(OUT, `${route}-${theme}.png`);
    await page.screenshot({ path: file, fullPage: true });

    // Light DOM measurement summary — useful for sanity checks.
    const summary = await page.evaluate(() => {
      const counts = {
        svg: document.querySelectorAll("svg").length,
        kicker: document.querySelectorAll(".t-kicker").length,
      };
      const svgs = [...document.querySelectorAll("svg.w-5.h-5")].map((s) => {
        const r = s.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      return { counts, svgs };
    });

    results.push({ route, theme, file, summary });
    process.stdout.write(`saved ${file}\n`);
  }
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify(results, null, 2));
console.log(`\nWrote ${results.length} screenshot(s) to ${OUT}/`);

await browser.close();
