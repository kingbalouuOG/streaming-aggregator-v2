/**
 * One-off measurement for the "New & actually good" card (2026-09-09).
 *
 * The card shipped with a phrase, so a tap ran a vector search and then
 * post-filtered by recency and rating. On a device that returned 2 titles.
 * With `phrase: null` the tap composes filters only and resolves down
 * /discover, where both predicates are applied server-side.
 *
 * This prints what /discover actually returns for the card's exact filter set
 * and Joe's real service stack, so the change is justified by what the user
 * would see rather than by argument. Mirrors `buildParams` in
 * native/src/hooks/useBrowseDiscover.ts.
 *
 *   node scripts/test/newgood-path-compare.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = {};
for (const line of readFileSync(resolve(root, '.env'), 'utf-8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = env.VITE_TMDB_API_KEY;
if (!KEY) throw new Error('VITE_TMDB_API_KEY missing from .env');

// Joe's stack, as user_services holds it, mapped through platformAdapter.
const PROVIDERS = { apple: 350, bbc: 38, channel4: 103, itvx: 41, netflix: 8, prime: 9, skygo: 29 };
const providerIds = Object.values(PROVIDERS).join('|');

const isoDaysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

// The card: { released: 'last_12_months', minRating: 7 }
const base = {
  watch_region: 'GB',
  sort_by: 'popularity.desc',
  with_watch_providers: providerIds,
  'vote_average.gte': 7,
  'vote_count.gte': 50,
};

async function discover(kind, extra) {
  const params = new URLSearchParams({ api_key: KEY, ...base, ...extra });
  const res = await fetch(`https://api.themoviedb.org/3/discover/${kind}?${params}`);
  if (!res.ok) throw new Error(`${kind}: ${res.status} ${await res.text()}`);
  return res.json();
}

const [movies, tv] = await Promise.all([
  discover('movie', { 'primary_release_date.gte': isoDaysAgo(365) }),
  discover('tv', { 'first_air_date.gte': isoDaysAgo(365) }),
]);

// Interleaved in the order the app builds them (movies then TV, each already
// popularity.desc from TMDb) — sort mode 'best' is identity, so this IS the
// grid order the user sees. Do NOT re-sort by rating here: that would show a
// list nobody is shown.
const rows = [
  ...movies.results.map((m) => ({
    t: m.title, y: (m.release_date || '').slice(0, 4), r: m.vote_average, v: m.vote_count, k: 'film',
  })),
  ...tv.results.map((s) => ({
    t: s.name, y: (s.first_air_date || '').slice(0, 4), r: s.vote_average, v: s.vote_count, k: 'tv',
  })),
];

console.log(`/discover for { released: last_12_months, minRating: 7 } on 7 services`);
console.log(`  movies: ${movies.total_results} total, page 1 = ${movies.results.length}`);
console.log(`  tv:     ${tv.total_results} total, page 1 = ${tv.results.length}`);
console.log(`  grid the card would show (one page of each): ${rows.length}\n`);
console.log('  first 12 as the grid would order them (popularity):');
for (const r of rows.slice(0, 12)) {
  console.log(`  ${String(r.r.toFixed(1)).padStart(4)}  ${r.y}  ${r.k.padEnd(4)}  ${r.t} (${r.v} votes)`);
}
const named = rows.filter((r) => /mousetrap|mayday/i.test(r.t));
console.log(`
  titles named from the New tab that this path returns: ${named.length ? named.map((r) => `${r.t} (${r.y}, ${r.r})`).join(', ') : 'none on page 1'}`);
