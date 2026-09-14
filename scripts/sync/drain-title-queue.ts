/**
 * Drain the title-ingestion queue faster than the nightly crons do.
 *
 * WHY THIS EXISTS. The nightly pipeline creates titles for availability
 * rows that have none (05:00 backfill-missing-titles), enriches them
 * (06:30 enrich-new-titles) and embeds them (07:15 embed-new-titles), each
 * as ONE chain capped at MAX_CHAIN_DEPTH x SLICE_LIMIT = 3,000 rows. That is
 * ~2,500 titles a night. On 2026-09-11 the IN-SY-001 cleanup walks wrote
 * availability for every catalogue entry Videx lacked a title for
 * (--include-unknown-titles) and `count_missing_title_ids()` went from 411
 * to 58,029 — three to four weeks at cron pace. This runs the same three
 * chains back to back, in parallel, until the queues drain.
 *
 * It starts chains exactly the way the cron does — `enqueue_function_call`
 * (migration 067) — and waits on `sync_log` for each chain to finish, so it
 * inherits every safety rail the functions already have (slice budgets,
 * depth caps, the "chain already running" guard, the watchdog).
 *
 * The three loops are independent: backfill inserts titles; enrich fills
 * `keywords` on existing titles; embed fills `embedding` where keywords are
 * set. Running them concurrently is safe (each chain type refuses to
 * overlap with itself) and the downstream loops naturally trail the
 * upstream ones. Three concurrent 75s slices is nowhere near the Edge
 * Runtime worker allowance that killed twelve 18s slices in 3.5 minutes.
 *
 * Usage:
 *   npx tsx scripts/sync/drain-title-queue.ts --dry-run
 *   npx tsx scripts/sync/drain-title-queue.ts --max-cycles 25
 *
 * Flags:
 *   --dry-run            print the queue sizes and what would run; start nothing
 *   --max-cycles <n>     per-loop ceiling on chains started (default 30)
 *   --max-hours <h>      wall-clock ceiling for the whole run (default 14)
 *   --floor <n>          stop the backfill loop once count_missing_title_ids() < n (default 100)
 *   --only <name>        run only one loop: backfill | enrich | embed
 *
 * It never starts a chain between 04:50 and 07:45 UTC — that window belongs
 * to the crons (backfill 05:00, sync 06:00, enrich 06:30, embed 07:15) and a
 * chain of ours mid-flight there would make the cron's own start be
 * skipped as "already running".
 *
 * Prerequisites (.env): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env ──────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const content = readFileSync(resolve(__dirname, '..', '..', '.env'), 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

const ENV = loadEnv();
if (!ENV.VITE_SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env. Need VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(ENV.VITE_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

// ── CLI ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes('--dry-run');
const maxCycles = flag('max-cycles') ? parseInt(flag('max-cycles')!, 10) : 30;
const maxHours = flag('max-hours') ? parseFloat(flag('max-hours')!) : 14;
const floor = flag('floor') ? parseInt(flag('floor')!, 10) : 100;
const only = flag('only');

// ── Chain descriptors ────────────────────────────────────

type LoopName = 'backfill' | 'enrich' | 'embed';

interface Chain {
  loop: LoopName;
  fn: string;          // Edge Function name (enqueue_function_call target)
  syncType: string;    // sync_log.sync_type the function writes
  /** Rows still waiting for this stage. */
  pending: () => Promise<number>;
}

const CHAINS: Chain[] = [
  {
    loop: 'backfill',
    fn: 'backfill-missing-titles',
    syncType: 'backfill',
    pending: async () => {
      const { data, error } = await supabase.rpc('count_missing_title_ids');
      if (error) throw new Error(`count_missing_title_ids: ${error.message}`);
      return Number(data ?? 0);
    },
  },
  {
    loop: 'enrich',
    fn: 'enrich-new-titles',
    syncType: 'enrich',
    pending: async () => {
      const { count, error } = await supabase
        .from('titles').select('id', { count: 'exact', head: true }).is('keywords', null);
      if (error) throw new Error(`awaiting enrich: ${error.message}`);
      return count ?? 0;
    },
  },
  {
    loop: 'embed',
    fn: 'embed-new-titles',
    syncType: 'embed',
    pending: async () => {
      const { count, error } = await supabase
        .from('titles').select('id', { count: 'exact', head: true }).is('embedding', null);
      if (error) throw new Error(`awaiting embed: ${error.message}`);
      return count ?? 0;
    },
  },
];

// ── Helpers ──────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString().slice(11, 19) + ' UTC';
const log = (loop: LoopName, msg: string) => console.log(`[${now()}] ${loop.padEnd(8)} ${msg}`);

/** 04:50–07:45 UTC belongs to the crons. */
function inCronWindow(d = new Date()): boolean {
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m >= 4 * 60 + 50 && m < 7 * 60 + 45;
}

async function waitOutCronWindow(loop: LoopName): Promise<void> {
  while (inCronWindow()) {
    log(loop, 'inside the 04:50–07:45 UTC cron window — waiting');
    await sleep(5 * 60_000);
  }
}

interface RunRow {
  id: string;
  status: string;
  started_at: string;
  heartbeat_at: string | null;
  titles_added: number | null;
  titles_processed: number | null;
  chain_state: any;
}

async function latestRun(syncType: string): Promise<RunRow | null> {
  const { data, error } = await supabase
    .from('sync_log')
    .select('id, status, started_at, heartbeat_at, titles_added, titles_processed, chain_state')
    .eq('sync_type', syncType)
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`sync_log read (${syncType}): ${error.message}`);
  return (data?.[0] as RunRow) ?? null;
}

function isLive(run: RunRow | null): boolean {
  if (!run || run.status !== 'running') return false;
  const hb = run.heartbeat_at ? new Date(run.heartbeat_at).getTime() : 0;
  return Date.now() - hb < 3 * 60_000;
}

/** Block until this run leaves 'running' (the reaper/watchdog handle the dead ones). */
async function waitForRun(loop: LoopName, runId: string): Promise<RunRow> {
  while (true) {
    await sleep(20_000);
    const { data, error } = await supabase
      .from('sync_log')
      .select('id, status, started_at, heartbeat_at, titles_added, titles_processed, chain_state')
      .eq('id', runId)
      .single();
    if (error) throw new Error(`sync_log read (${runId}): ${error.message}`);
    const run = data as RunRow;
    if (run.status !== 'running') return run;
    const slices = run.chain_state?.slices ?? '?';
    log(loop, `  … running (slice ${slices}, processed ${run.titles_processed ?? 0})`);
  }
}

/** Start one chain and wait for it. Returns the finished run, or null if nothing started. */
async function runOneChain(chain: Chain): Promise<RunRow | null> {
  const { loop, fn, syncType } = chain;

  // Someone else's chain (the cron, the watchdog) may already be running — ride it.
  const before = await latestRun(syncType);
  if (isLive(before)) {
    log(loop, `a ${syncType} chain is already running (${before!.id}) — waiting on it instead of starting one`);
    return waitForRun(loop, before!.id);
  }

  const enqueuedAt = Date.now();
  const { data: requestId, error } = await supabase.rpc('enqueue_function_call', { p_function: fn, p_body: {} });
  if (error) throw new Error(`enqueue_function_call(${fn}): ${error.message}`);
  log(loop, `enqueued ${fn} (pg_net request ${requestId})`);

  // The function inserts its sync_log row on slice 0; give pg_net time to deliver.
  for (let i = 0; i < 12; i++) {
    await sleep(10_000);
    const run = await latestRun(syncType);
    if (run && new Date(run.started_at).getTime() >= enqueuedAt - 5_000) {
      log(loop, `chain ${run.id} started`);
      return waitForRun(loop, run.id);
    }
  }
  log(loop, `no new ${syncType} run appeared within 2 minutes — the delivery may have failed; will retry next cycle`);
  return null;
}

function describe(run: RunRow): string {
  const stopped = run.chain_state?.stopped_because ?? '';
  return `${run.status} — added ${run.titles_added ?? 0}, processed ${run.titles_processed ?? 0}, slices ${run.chain_state?.slices ?? '?'}${stopped ? ` (${stopped})` : ''}`;
}

// ── Loops ────────────────────────────────────────────────

const deadline = Date.now() + maxHours * 3600_000;
const finished: Record<LoopName, boolean> = { backfill: false, enrich: false, embed: false };

async function driveLoop(chain: Chain, upstream: LoopName | null): Promise<void> {
  const { loop } = chain;
  let cycles = 0;
  let idleChecks = 0;

  while (true) {
    if (Date.now() > deadline) {
      log(loop, `wall-clock ceiling (${maxHours}h) reached — stopping`);
      break;
    }
    if (cycles >= maxCycles) {
      log(loop, `cycle ceiling (${maxCycles}) reached — stopping`);
      break;
    }

    const pending = await chain.pending();
    const upstreamDone = upstream === null || finished[upstream];
    const threshold = loop === 'backfill' ? floor : 0;

    if (pending <= threshold) {
      if (upstreamDone) {
        log(loop, `queue drained (${pending} pending, upstream finished) — done`);
        break;
      }
      // Nothing to do yet, but the stage before us is still producing.
      if (idleChecks++ % 6 === 0) log(loop, `nothing pending; waiting for ${upstream} to produce more`);
      await sleep(60_000);
      continue;
    }
    idleChecks = 0;

    await waitOutCronWindow(loop);
    log(loop, `cycle ${cycles + 1}/${maxCycles}: ${pending} pending`);
    const run = await runOneChain(chain);
    cycles++;
    if (run) log(loop, `chain ${run.id} ${describe(run)}`);
    if (run && run.status === 'failed') {
      log(loop, 'chain failed — pausing 3 minutes before the next one');
      await sleep(3 * 60_000);
    }
  }
  finished[loop] = true;
}

// ── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Drain title queue — ${dryRun ? 'DRY RUN' : 'LIVE'}; max ${maxCycles} cycles/loop, ${maxHours}h, backfill floor ${floor}${only ? `, only ${only}` : ''}`);
  for (const c of CHAINS) {
    const n = await c.pending();
    console.log(`  ${c.loop.padEnd(8)} pending: ${n}`);
  }
  if (inCronWindow()) console.log('  (inside the cron window now — loops will wait until 07:45 UTC)');
  if (dryRun) {
    console.log('\n  DRY RUN — nothing started.');
    return;
  }

  const selected = only ? CHAINS.filter((c) => c.loop === only) : CHAINS;
  if (selected.length === 0) throw new Error(`--only must be one of backfill | enrich | embed`);
  // Mark unselected loops as finished so downstream stop conditions are not blocked on them.
  for (const c of CHAINS) if (!selected.includes(c)) finished[c.loop] = true;

  await Promise.all(
    selected.map((c) =>
      driveLoop(c, c.loop === 'backfill' ? null : c.loop === 'enrich' ? 'backfill' : 'enrich'),
    ),
  );

  console.log('\nFinal:');
  for (const c of CHAINS) console.log(`  ${c.loop.padEnd(8)} pending: ${await c.pending()}`);
}

main().catch((err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
