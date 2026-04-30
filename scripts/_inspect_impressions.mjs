import { readFileSync, unlinkSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Joe's test account user_id (from earlier diagnostic).
const USER_ID = 'ff462bf6';

// Find the full uuid (my diagnostic only had the first 8 chars).
const { data: matchingProfiles } = await admin
  .from('taste_profiles')
  .select('user_id')
  .like('user_id', `${USER_ID}%`)
  .limit(1);

if (!matchingProfiles || matchingProfiles.length === 0) {
  console.error('Could not find user with prefix', USER_ID);
  process.exit(1);
}

const userId = matchingProfiles[0].user_id;
console.log(`Inspecting impressions for ${userId}`);
console.log();

// Pull recent impressions. card_impressions is partitioned by month;
// parent query routes correctly.
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const { data: impressions, error } = await admin
  .from('card_impressions')
  .select('content_id, source_surface, position, session_id, shown_at')
  .eq('user_id', userId)
  .gte('shown_at', since)
  .order('shown_at', { ascending: false })
  .limit(500);

if (error) { console.error('Query error:', error); process.exit(1); }
if (!impressions || impressions.length === 0) {
  console.error('No impressions in the last 24h');
  process.exit(1);
}

console.log(`Total impressions in last 24h: ${impressions.length}`);
console.log();

// Count by source_surface.
const bySurface = new Map();
for (const row of impressions) {
  bySurface.set(row.source_surface, (bySurface.get(row.source_surface) || 0) + 1);
}
console.log('By source_surface:');
for (const [surface, count] of [...bySurface.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${surface.padEnd(20)} ${count}`);
}
console.log();

// Most recent per surface (spot check content_id + shown_at).
console.log('Most recent sample per surface:');
const seenSurfaces = new Set();
for (const row of impressions) {
  if (seenSurfaces.has(row.source_surface)) continue;
  seenSurfaces.add(row.source_surface);
  console.log(`  [${row.source_surface}] content_id=${row.content_id} position=${row.position} shown_at=${row.shown_at}`);
}
console.log();

// Any rows with unexpected surface values?
const expected = new Set(['home', 'for_you', 'mood_room', 'browse', 'watchlist', 'search', 'detail']);
const unexpected = [...bySurface.keys()].filter(s => !expected.has(s));
if (unexpected.length) {
  console.log('UNEXPECTED source_surface values:', unexpected);
} else {
  console.log('All source_surface values within the expected ImpressionSurface union. ✓');
}

unlinkSync('scripts/_inspect_impressions.mjs');
