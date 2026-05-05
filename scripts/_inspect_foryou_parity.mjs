/**
 * IN-466 parity + soundness probe for render-foryou-rows.
 *
 * The brief asked for a one-off probe diffing Edge Function output against
 * the client-pipeline output. The client pipeline depends on browser
 * context (localStorage caches, the Supabase client singleton, hook
 * lifecycle), so a true Node-side diff isn't practical without
 * reimplementing half the runtime. This probe instead does:
 *
 *   1. Calls the Edge Function twice with the same input. Diffs the two
 *      responses to expose any non-determinism in the pipeline (timing-
 *      dependent ordering, recency window crossover, etc.).
 *   2. Cross-checks filter set semantics by querying the user's
 *      thumbsDownIds + dismissedIds + watchlist directly via service-role,
 *      then proving none of those IDs appear in recommendedForYou /
 *      hiddenGems / outsideYourUsual. (The Edge Function should have
 *      filtered them; if any leak through, the port has a bug.)
 *   3. Anchor-selection trace: which tier did each anchor come from?
 *      Are the thumbnail counts non-zero (Cowork's expanded probe item)?
 *   4. Cross-row dedup: no title in two of {rec, gems, outside}.
 *   5. Sanity: pool.matched length, payload size, server vs client wallclock.
 *
 * True client-vs-Edge equivalence comes from the on-device smoke test —
 * load the app, capture a screenshot of the client-fallback path, then
 * the Edge path, eyeball that the rows match.
 *
 * Run:
 *   USER_JWT="<bearer token from app localStorage>" \
 *   USER_ID="<auth.uid()>" \
 *   SERVICES="netflix,prime,disney,apple,itvx,all4,now,iplayer" \
 *   node scripts/_inspect_foryou_parity.mjs
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1).replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const ENV = loadEnv();
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? ENV.SUPABASE_URL;
const SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

const USER_JWT = process.env.USER_JWT;
const USER_ID = process.env.USER_ID;
const SERVICES = (process.env.SERVICES ?? '').split(',').filter(Boolean);

if (!USER_JWT || !USER_ID || SERVICES.length === 0) {
  console.error('Set USER_JWT, USER_ID, and SERVICES env vars. See file header.');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/render-foryou-rows`;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tierName = { 1: 'behavioural', 2: 'cluster-rep', 3: 'top-finalScore' };

// ── Helpers ──

async function callEdgeFunction() {
  const t0 = Date.now();
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${USER_JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ services: SERVICES }),
  });
  const wallMs = Date.now() - t0;
  if (!res.ok) {
    throw new Error(`Edge function HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return { data, wallMs, payloadBytes: Number(res.headers.get('content-length') ?? 0) };
}

async function fetchFilterSetsDirectly() {
  const [thumbsDown, dismissed, watchlist] = await Promise.all([
    supabase
      .from('user_interactions')
      .select('content_id, media_type')
      .eq('user_id', USER_ID)
      .eq('event_type', 'thumbs_down'),
    supabase
      .from('user_interactions')
      .select('content_id, media_type')
      .eq('user_id', USER_ID)
      .eq('event_type', 'not_interested'),
    supabase
      .from('watchlist')
      .select('tmdb_id, media_type')
      .eq('user_id', USER_ID),
  ]);

  return {
    thumbsDown: new Set((thumbsDown.data ?? []).map((r) => `${r.media_type}-${r.content_id}`)),
    dismissed: new Set((dismissed.data ?? []).map((r) => `${r.media_type}-${r.content_id}`)),
    watchlist: new Set((watchlist.data ?? []).map((r) => `${r.media_type}-${r.tmdb_id}`)),
  };
}

function diffOutputs(a, b) {
  const issues = [];
  const rows = ['recommendedForYou', 'hiddenGems', 'outsideYourUsual', 'fromYourWatchlist'];
  for (const row of rows) {
    if (a[row]?.length !== b[row]?.length) {
      issues.push(`${row}: length differs (${a[row]?.length} vs ${b[row]?.length})`);
      continue;
    }
    for (let i = 0; i < (a[row]?.length ?? 0); i++) {
      if (a[row][i].id !== b[row][i].id) {
        issues.push(`${row}[${i}]: id differs (${a[row][i].id} vs ${b[row][i].id})`);
      }
    }
  }
  // Anchor rooms: check id-set equality (order may vary if anchor selection
  // has a tie-breaking step that depends on time).
  const aAnchors = new Set((a.anchorRooms ?? []).map((r) => r.id));
  const bAnchors = new Set((b.anchorRooms ?? []).map((r) => r.id));
  for (const id of aAnchors) {
    if (!bAnchors.has(id)) issues.push(`anchorRooms: ${id} present in run 1 but not run 2`);
  }
  for (const id of bAnchors) {
    if (!aAnchors.has(id)) issues.push(`anchorRooms: ${id} present in run 2 but not run 1`);
  }
  return issues;
}

function checkFilterLeaks(payload, filterSets) {
  const issues = [];
  const rowsToCheck = ['recommendedForYou', 'hiddenGems', 'outsideYourUsual'];
  for (const row of rowsToCheck) {
    for (const item of payload[row] ?? []) {
      if (filterSets.thumbsDown.has(item.id)) issues.push(`${row}: thumbs-down leak ${item.id} (${item.title})`);
      if (filterSets.dismissed.has(item.id)) issues.push(`${row}: dismissed leak ${item.id} (${item.title})`);
      if (filterSets.watchlist.has(item.id)) issues.push(`${row}: watchlist leak ${item.id} (${item.title})`);
    }
  }
  return issues;
}

function checkCrossRowDedup(payload) {
  const issues = [];
  const rec = new Set((payload.recommendedForYou ?? []).map((c) => c.id));
  const gems = new Set((payload.hiddenGems ?? []).map((c) => c.id));
  const outside = new Set((payload.outsideYourUsual ?? []).map((c) => c.id));
  for (const id of rec) {
    if (gems.has(id)) issues.push(`dedup: ${id} in both recommendedForYou and hiddenGems`);
    if (outside.has(id)) issues.push(`dedup: ${id} in both recommendedForYou and outsideYourUsual`);
  }
  for (const id of gems) {
    if (outside.has(id)) issues.push(`dedup: ${id} in both hiddenGems and outsideYourUsual`);
  }
  return issues;
}

function summariseAnchors(anchorRooms) {
  const tierCounts = { 1: 0, 2: 0, 3: 0 };
  for (const room of anchorRooms ?? []) {
    tierCounts[room.anchor.tier] = (tierCounts[room.anchor.tier] ?? 0) + 1;
  }
  return tierCounts;
}

function fmt(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ── Main ──

async function main() {
  console.log(`Probing render-foryou-rows for user ${USER_ID}`);
  console.log(`Services: ${SERVICES.join(', ')}\n`);

  console.log('Run 1...');
  const run1 = await callEdgeFunction();
  console.log(`  wall ${run1.wallMs}ms, server ${run1.data.renderMs}ms, anchors [${run1.data.perAnchorLatencyMs.join(', ')}]ms`);

  console.log('Run 2...');
  const run2 = await callEdgeFunction();
  console.log(`  wall ${run2.wallMs}ms, server ${run2.data.renderMs}ms, anchors [${run2.data.perAnchorLatencyMs.join(', ')}]ms`);

  console.log('\nFetching filter sets directly via service-role for cross-check...');
  const filterSets = await fetchFilterSetsDirectly();
  console.log(`  thumbs-down: ${filterSets.thumbsDown.size}, dismissed: ${filterSets.dismissed.size}, watchlist: ${filterSets.watchlist.size}`);

  // Determinism
  const detIssues = diffOutputs(run1.data, run2.data);

  // Filter-leak check (against run 1)
  const leakIssues = checkFilterLeaks(run1.data, filterSets);

  // Cross-row dedup
  const dedupIssues = checkCrossRowDedup(run1.data);

  // Anchor summary
  const tierCounts = summariseAnchors(run1.data.anchorRooms);

  // Row counts
  const counts = {
    recommendedForYou: run1.data.recommendedForYou?.length ?? 0,
    hiddenGems: run1.data.hiddenGems?.length ?? 0,
    outsideYourUsual: run1.data.outsideYourUsual?.length ?? 0,
    becauseYouWatched: run1.data.becauseYouWatched?.length ?? 0,
    moreFromPerson: run1.data.moreFromPerson ? 1 : 0,
    fromYourWatchlist: run1.data.fromYourWatchlist?.length ?? 0,
    anchorRooms: run1.data.anchorRooms?.length ?? 0,
    pool: run1.data.pool?.matched?.length ?? 0,
  };

  console.log('\n── Row counts ──');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  console.log('\n── Anchor tier breakdown ──');
  for (const [tier, count] of Object.entries(tierCounts)) {
    console.log(`  Tier ${tier} (${tierName[tier]}): ${count}`);
  }
  for (const room of run1.data.anchorRooms ?? []) {
    console.log(`  - "${room.anchorTitle}" (Tier ${room.anchor.tier}, sim ${room.anchor.similarityToUser?.toFixed(3) ?? '?'}, ${room.titleCount} titles)`);
  }

  console.log('\n── Sliders echo ──');
  console.log(`  ${JSON.stringify(run1.data.sliders)}`);

  console.log('\n── Payload size ──');
  console.log(`  raw response: ${fmt(JSON.stringify(run1.data).length)}`);

  console.log('\n── Determinism (run 1 vs run 2) ──');
  if (detIssues.length === 0) {
    console.log('  OK: outputs match');
  } else {
    console.log(`  ${detIssues.length} differences (some may be expected — recency window crossover, time-bucket transitions):`);
    for (const issue of detIssues) console.log(`    - ${issue}`);
  }

  console.log('\n── Filter-set leak check ──');
  if (leakIssues.length === 0) {
    console.log('  OK: no thumbs-down / dismissed / watchlist titles leaked into rec/gems/outside rows');
  } else {
    console.log(`  ${leakIssues.length} LEAKS — port bug:`);
    for (const issue of leakIssues) console.log(`    - ${issue}`);
  }

  console.log('\n── Cross-row dedup ──');
  if (dedupIssues.length === 0) {
    console.log('  OK: no duplicate titles across rec/gems/outside');
  } else {
    console.log(`  ${dedupIssues.length} duplicates — port bug:`);
    for (const issue of dedupIssues) console.log(`    - ${issue}`);
  }

  const totalIssues = leakIssues.length + dedupIssues.length;
  console.log(`\n── Verdict ──`);
  if (totalIssues === 0) {
    console.log('  PASS: structural soundness checks passed.');
    console.log('  Next step: load the app on device, eyeball the Edge-vs-fallback rows.');
  } else {
    console.log(`  FAIL: ${totalIssues} structural issues found. Fix before wiring the client.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
