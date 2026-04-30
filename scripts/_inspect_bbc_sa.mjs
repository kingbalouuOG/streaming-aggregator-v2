/**
 * Probe 3: full show object shape from the catalog filter.
 * Determines whether the catalog response carries IDs we can join
 * back to our `titles` table — that decides whether the re-sync
 * iterates the catalog (fast) or every title in our DB (slow).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

const ENV = loadEnv();
const SA_API_KEY = ENV.SA_API_KEY;
const SA_HOST = 'streaming-availability.p.rapidapi.com';
const SA_HEADERS = {
  'X-RapidAPI-Key': SA_API_KEY,
  'X-RapidAPI-Host': SA_HOST,
};

async function saFetch(path) {
  const res = await fetch(`https://${SA_HOST}${path}`, { headers: SA_HEADERS });
  return { status: res.status, body: res.ok ? await res.json() : await res.text() };
}

const { status, body } = await saFetch(
  '/shows/search/filters?country=gb&catalogs=iplayer&seriesGranularity=show&output_language=en&limit=3',
);
if (status !== 200) {
  console.log('HTTP', status, body);
  process.exit(1);
}
const shows = body?.shows ?? [];
console.log(`shows: ${shows.length}, hasMore: ${body?.hasMore}`);
console.log('\nFull first show:');
console.log(JSON.stringify(shows[0], null, 2).slice(0, 2000));
console.log('\nKeys on each show:');
console.log(Object.keys(shows[0] ?? {}).sort());
