/**
 * Pipeline health check (R-010).
 *
 * Runs daily on GitHub Actions (.github/workflows/pipeline-health.yml,
 * 09:00 UTC) and exits non-zero if the catalogue pipeline is not doing
 * what it is supposed to be doing. A failed workflow run emails the repo
 * owner, which is the whole alerting mechanism — deliberately no extra
 * vendor, secret, or send-path.
 *
 * ── The point ──────────────────────────────────────────────────────
 *
 * The 2026-06-07 catalogue freeze produced ZERO errors for 79 days.
 * `cron.job_run_details` said 'succeeded' every night, the Edge
 * Functions returned HTTP 200, and `sync_log.errors` was 0 — because
 * every TMDb call was 401ing and the code counted that as an ordinary
 * per-row failure. Any conventional error-triggered alert would have
 * stayed silent for the entire outage.
 *
 * So these assertions are built the other way round: they check for the
 * ABSENCE OF EXPECTED SUCCESS, not the presence of errors. A dead man's
 * switch, not an error hook. Assertion 1 alone would have caught the
 * freeze on day two.
 *
 * ── Why it runs on Actions rather than as an Edge Function ─────────
 *
 * Don't monitor Supabase from inside Supabase. We watched pg_net sever
 * calls at 30s and the Edge Runtime refuse invocations with a 502 —
 * a monitor invoked by pg_cron inherits both, so in exactly the
 * scenarios worth alerting on the alarm is the broken part.
 *
 * ── Thresholds ─────────────────────────────────────────────────────
 *
 * Deliberately loose. An alert that cries wolf gets ignored, which
 * recreates the original problem in a more irritating form. Every
 * threshold here is set so that normal operation — including a single
 * missed run or a slow day — stays green.
 *
 * Usage:
 *   npx tsx scripts/health/pipeline-health.ts
 *   npx tsx scripts/health/pipeline-health.ts --dry-run   # no heartbeat write
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Thresholds ───────────────────────────────────────────────────────

const CATALOGUE_STALE_HOURS = 48;   // 2 missed daily backfills before alarm
const RUN_WINDOW_HOURS = 25;        // one daily cycle plus an hour of slack
const EMBED_BACKLOG_MAX = 5_000;    // ~2 days of backfill output
const RESUME_ALARM = 3;             // chronic handoff failure, not a blip
const ERROR_FLOOR = 20;             // below this, don't even look at the rate
const ERROR_RATE_MAX = 0.25;        // a quarter of rows failing is not a blip
const STUCK_RUN_MINUTES = 30;       // reaper is 10min; 30 means IT failed too
const HEARTBEAT_STALE_HOURS = 48;   // one skipped Actions run is tolerable
const WARMER_STALE_MINUTES = 30;    // warmer runs every 5min; 30 = 6 missed
const WARM_DURATION_MAX_MS = 750;   // warm ~90ms, cold 1,500-4,000ms
const GAP_LOOKBACK_DAYS = 7;
// A gap title only counts as "stale" once the daily 05:00 backfill has had
// a chance at it. 24h, because this check starts 09:00-14:00 and the 06:00
// sync's arrivals are always younger than that, while yesterday's are
// always older than today's backfill.
const STALE_GAP_MIN_AGE = '24 hours';
// One full 12-slice backfill chain creates ~2,530 titles (the capped runs
// of 12-14 Sept 2026). A stale gap above that cannot be cleared by one
// daily run, so it is a multi-day backlog whatever the baseline says —
// and it catches a backlog that was already there when the 7-day
// baseline was taken, which the growth rule alone cannot see.
const STALE_GAP_MAX = 2_500;
const STALE_GAP_MIGRATION = 'supabase/migrations/091_count_stale_missing_title_ids.sql';

// Jobs that must show a sync_log row within RUN_WINDOW_HOURS. `changes`
// and `full` are manual/legacy sync_types and are deliberately excluded.
const EXPECTED_DAILY_JOBS = ['incremental', 'backfill', 'enrich', 'embed'] as const;

// ── Assertion plumbing ───────────────────────────────────────────────

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

/** A check that throws is a FAIL, never a silent skip. */
async function check(name: string, fn: () => Promise<[boolean, string]>): Promise<void> {
  try {
    const [ok, detail] = await fn();
    record(name, ok, detail);
  } catch (err) {
    record(name, false, `check threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

async function countGap(): Promise<number> {
  const { data, error } = await supabase.rpc('count_missing_title_ids');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Throws, rather than returning 0, when migration 091 has not been
 * applied: a missing function must fail the run, or merging this before
 * the migration lands would silently switch the check off.
 */
async function countStaleGap(): Promise<number> {
  const { data, error } = await supabase.rpc('count_stale_missing_title_ids', {
    p_min_age: STALE_GAP_MIN_AGE,
  });
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error(
        `count_stale_missing_title_ids() does not exist — apply ${STALE_GAP_MIGRATION} in Studio (${error.message})`
      );
    }
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}

// Filled by check 4 and reused by main() for the heartbeat, so the two
// counts are not run twice when the check succeeded.
const gapSnapshot: { gap: number | null; staleGap: number | null } = { gap: null, staleGap: null };

// ── The checks ───────────────────────────────────────────────────────

async function run(): Promise<void> {
  // 1. THE BIG ONE. Is the catalogue growing at all? This is the single
  //    assertion that would have caught the 79-day freeze, on day two.
  await check('catalogue-growing', async () => {
    const { data, error } = await supabase
      .from('titles')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) throw new Error(error.message);
    const newest = new Date(data.created_at);
    const ageH = (Date.now() - newest.getTime()) / 3600_000;
    return [
      ageH < CATALOGUE_STALE_HOURS,
      `newest title ${ageH.toFixed(1)}h old (limit ${CATALOGUE_STALE_HOURS}h) — ${newest.toISOString()}`,
    ];
  });

  // 2. Did each job actually run? Catches cron silently stopping, which
  //    no error-based check can see.
  await check('jobs-ran', async () => {
    const { data, error } = await supabase
      .from('sync_log')
      .select('sync_type')
      .gte('started_at', hoursAgo(RUN_WINDOW_HOURS));
    if (error) throw new Error(error.message);
    const seen = new Set((data ?? []).map((r) => r.sync_type));
    const missing = EXPECTED_DAILY_JOBS.filter((j) => !seen.has(j));
    return [
      missing.length === 0,
      missing.length === 0
        ? `all ran in the last ${RUN_WINDOW_HOURS}h: ${[...seen].sort().join(', ')}`
        : `no run in ${RUN_WINDOW_HOURS}h for: ${missing.join(', ')}`,
    ];
  });

  // 3. A job that is failing and has NOT recovered. Deliberately NOT
  //    "errors > 0": a single transient TMDb 500 sets errors=1, and an
  //    alert that goes red on one bad row gets muted within a fortnight —
  //    which recreates the original problem in a more irritating form.
  //
  //    Equally deliberately NOT "any failed run in the window". That was
  //    the original test and it cried wolf: on 2026-09-08 the 06:00 sync
  //    failed on the old RapidAPI quota, the channel was switched, and two
  //    later runs succeeded — yet the check stayed red for the rest of the
  //    day because a failure sat inside its 25h window. A failure that a
  //    later run of the same type has already superseded is history, not a
  //    fault, and reporting it as one is how a daily alert gets ignored.
  //
  //    What matters is whether a sync_type is currently broken: failed,
  //    with no successful run of that type since.
  await check('no-failed-runs', async () => {
    const { data, error } = await supabase
      .from('sync_log')
      .select('sync_type, status, errors, chain_state, started_at')
      .gte('started_at', hoursAgo(RUN_WINDOW_HOURS))
      .order('started_at', { ascending: true });
    if (error) throw new Error(error.message);
    const runs = data ?? [];

    // Latest successful run per type, so "recovered" is judged per job
    // rather than globally — embed succeeding must not mask incremental
    // still being broken.
    const lastSuccessMs = new Map<string, number>();
    for (const r of runs) {
      if (r.status !== 'completed') continue;
      const t = Date.parse(r.started_at);
      const prev = lastSuccessMs.get(r.sync_type);
      if (prev === undefined || t > prev) lastSuccessMs.set(r.sync_type, t);
    }

    const unrecovered = runs.filter((r) => {
      if (r.status !== 'failed') return false;
      const recoveredAt = lastSuccessMs.get(r.sync_type);
      return recoveredAt === undefined || recoveredAt <= Date.parse(r.started_at);
    });

    const recoveredCount = runs.filter((r) => r.status === 'failed').length - unrecovered.length;
    const recoveredNote = recoveredCount > 0 ? ` (${recoveredCount} earlier failure(s) since recovered)` : '';

    return [
      unrecovered.length === 0,
      unrecovered.length === 0
        ? `no unrecovered failures in ${RUN_WINDOW_HOURS}h${recoveredNote}`
        : unrecovered
            .map((r) => `${r.sync_type}: ${r.chain_state?.stopped_because ?? `errors=${r.errors}`}`)
            .join('; '),
    ];
  });

  // 3b. Ran, reported success, did nothing. This is the 2026-08-12..15
  //     signature: four consecutive days of titles_processed=0 with
  //     errors=17 and status='completed'.
  //
  //     Scoped to the SA sync only. enrich and embed legitimately process
  //     zero once their queues are drained — which is the steady state we
  //     are aiming for — so asserting "did work" on them would go red
  //     precisely when the pipeline is healthiest.
  await check('sync-did-work', async () => {
    const { data, error } = await supabase
      .from('sync_log')
      .select('titles_processed, availability_added, availability_updated, started_at')
      .eq('sync_type', 'incremental')
      .gte('started_at', hoursAgo(RUN_WINDOW_HOURS))
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) return [true, 'no incremental run in window (covered by jobs-ran)'];
    const r = data[0];
    const processed = r.titles_processed ?? 0;
    return [
      processed > 0,
      `latest sync processed ${processed} changes ` +
        `(+${r.availability_added ?? 0} / ~${r.availability_updated ?? 0} availability rows)`,
    ];
  });

  // 3c. A run where a large SHARE of rows failed. Catches a broken
  //     credential or a dead upstream without firing on the odd 500.
  //     The absolute floor stops a 1-of-2 run from tripping it.
  await check('error-rate-sane', async () => {
    const { data, error } = await supabase
      .from('sync_log')
      .select('sync_type, errors, titles_processed, started_at')
      .gte('started_at', hoursAgo(RUN_WINDOW_HOURS))
      .gte('errors', ERROR_FLOOR);
    if (error) throw new Error(error.message);
    const hot = (data ?? []).filter((r) => {
      const attempted = r.titles_processed ?? 0;
      if (attempted === 0) return true; // errors with nothing processed
      return (r.errors ?? 0) / attempted > ERROR_RATE_MAX;
    });
    return [
      hot.length === 0,
      hot.length === 0
        ? `no run above ${ERROR_FLOOR} errors and ${(ERROR_RATE_MAX * 100).toFixed(0)}% failure rate`
        : hot
            .map((r) => `${r.sync_type}: ${r.errors} errors / ${r.titles_processed} processed`)
            .join('; '),
    ];
  });

  // 4. Is the backfill keeping up? It was not under weekly cadence (22,260
  //    -> 22,729 in a day) and nothing said so.
  //
  //    Measures the STALE gap: titles still missing after the daily
  //    backfill has had a chance at them. Not the whole gap — every title
  //    new at the 06:00 sync waits for tomorrow's 05:00 backfill, so this
  //    check (09:00, often 13:00-14:00) always saw that morning's arrivals
  //    and went red whenever they outnumbered the baseline day's. It did so
  //    on 15 Sept (2,323 vs 31) and 16 Sept (39 vs 31) with every one of
  //    the 39 first seen at 06:00-06:02 that morning. Arrivals are reported
  //    alongside but never judged. IN-SY-002.
  await check('gap-not-growing', async () => {
    gapSnapshot.gap = await countGap();
    const stale = await countStaleGap();
    gapSnapshot.staleGap = stale;
    const arrivals = Math.max(gapSnapshot.gap - stale, 0);
    const arrivalsNote = `today's arrivals awaiting backfill: ${arrivals}`;

    // Oldest heartbeat in the window that actually MEASURED the stale gap.
    // Heartbeats from before IN-SY-002 carry only `gap`, and must not be
    // read as a baseline of the other quantity.
    const { data: prior, error: priorErr } = await supabase
      .from('pipeline_health')
      .select('ran_at, detail')
      .gte('ran_at', hoursAgo(GAP_LOOKBACK_DAYS * 24))
      .not('detail->>stale_gap', 'is', null)
      .order('ran_at', { ascending: true })
      .limit(1);
    if (priorErr) throw new Error(priorErr.message);

    if (stale > STALE_GAP_MAX) {
      return [
        false,
        `stale gap ${stale} exceeds ${STALE_GAP_MAX} (more than one backfill run can clear); ${arrivalsNote}`,
      ];
    }

    const priorStale = prior?.[0]?.detail?.stale_gap;
    if (typeof priorStale !== 'number') {
      // No baseline yet — record today's and pass. Not a failure: the
      // check simply has nothing to compare against on first run.
      return [
        true,
        `stale gap ${stale} (no baseline within ${GAP_LOOKBACK_DAYS}d yet; limit ${STALE_GAP_MAX}); ${arrivalsNote}`,
      ];
    }
    const trend = stale < priorStale ? 'falling' : stale === priorStale ? 'flat' : 'GROWING';
    return [
      stale <= priorStale,
      `stale gap ${stale} vs ${priorStale} on ${prior[0].ran_at.slice(0, 10)} (${trend}); ${arrivalsNote}`,
    ];
  });

  // 5. A title with no embedding cannot be retrieved by
  //    match_titles_by_vector, so it cannot appear in For You at all —
  //    however healthy count(*) FROM titles looks.
  await check('embed-queue-not-backed-up', async () => {
    const { count, error } = await supabase
      .from('titles')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)
      .not('keywords', 'is', null);
    if (error) throw new Error(error.message);
    const n = count ?? 0;
    return [n < EMBED_BACKLOG_MAX, `${n} titles awaiting embedding (limit ${EMBED_BACKLOG_MAX})`];
  });

  // 6. The watchdog recovering a chain now and then is the system working.
  //    Doing it repeatedly means handoffs are chronically failing.
  await check('chains-not-chronically-resumed', async () => {
    const { data, error } = await supabase
      .from('sync_log')
      .select('sync_type, chain_state, started_at')
      .gte('started_at', hoursAgo(RUN_WINDOW_HOURS))
      .not('chain_state', 'is', null);
    if (error) throw new Error(error.message);
    const noisy = (data ?? [])
      .map((r) => ({ t: r.sync_type, n: Number(r.chain_state?.resumes ?? 0) }))
      .filter((r) => r.n >= RESUME_ALARM);
    return [
      noisy.length === 0,
      noisy.length === 0
        ? `no chain resumed ${RESUME_ALARM}+ times in ${RUN_WINDOW_HOURS}h`
        : noisy.map((r) => `${r.t}: ${r.n} resumes`).join('; '),
    ];
  });

  // 7. reap_stale_sync_runs() closes killed runs after 10 minutes and the
  //    watchdog nurses live ones. Something stuck at 30 minutes means one
  //    of those two is itself broken.
  await check('nothing-stuck-running', async () => {
    const { data, error } = await supabase
      .from('sync_log')
      .select('sync_type, started_at, heartbeat_at')
      .eq('status', 'running')
      .lt('heartbeat_at', new Date(Date.now() - STUCK_RUN_MINUTES * 60_000).toISOString());
    if (error) throw new Error(error.message);
    const stuck = data ?? [];
    return [
      stuck.length === 0,
      stuck.length === 0
        ? `nothing running with a heartbeat older than ${STUCK_RUN_MINUTES}m`
        : stuck.map((r) => `${r.sync_type} since ${r.started_at}`).join('; '),
    ];
  });

  // 8. B1's cache warmer. If it stops, nothing FAILS — cold-open latency
  //     just silently returns to ~4s (measured 2026-08-26: 4,156ms cold
  //     vs 12ms warm on the same query) and waits for a user to complain.
  //     That is the silent-degradation shape this whole check exists for.
  await check('cache-warmer-running', async () => {
    const { data, error } = await supabase
      .from('cache_warm_status')
      .select('ran_at, ok, error, duration_ms')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return [false, 'cache_warm_status is empty — the warmer has never run'];
    const ageM = (Date.now() - new Date(data.ran_at).getTime()) / 60_000;
    if (!data.ok) return [false, `last warm failed: ${data.error ?? 'unknown'}`];
    if (ageM >= WARMER_STALE_MINUTES) {
      return [false, `last warm ${ageM.toFixed(1)}m ago (limit ${WARMER_STALE_MINUTES}m)`];
    }
    // The warmer's OWN duration is the honest measure of whether the index
    // is staying warm: it runs the same query a user's cold open would.
    // ~90ms means the pages were resident; hundreds of ms or seconds means
    // they were evicted between runs and the interval is too long. This is
    // a better signal than any manual EXPLAIN — buffer counts at a
    // function-scan boundary do not reflect what the function did.
    const ms = data.duration_ms ?? 0;
    return [
      ms < WARM_DURATION_MAX_MS,
      `last warm ${ageM.toFixed(1)}m ago in ${ms}ms (limit ${WARM_DURATION_MAX_MS}ms — ` +
        `above this the index is going cold between runs)`,
    ];
  });

  // 9. B3 denormalisation guard. titles.available_services is a copy of
  //    what streaming_availability says, kept current by a trigger. A
  //    denormalised column is only safe if something actually checks it —
  //    drift here means users are shown titles that are not on their
  //    services, or denied ones that are, and nothing else would notice.
  await check('availability-not-drifted', async () => {
    const { data, error } = await supabase.rpc('count_available_services_drift');
    if (error) throw new Error(error.message);
    const n = Number(data ?? 0);
    return [
      n === 0,
      n === 0
        ? 'titles.available_services matches streaming_availability'
        : `${n} title(s) disagree — run: SELECT refresh_title_available_services();`,
    ];
  });

  // 10. The watchman's watchman. A scheduled Actions run that never happens
  //    raises no alarm by itself — so each run checks that the PREVIOUS
  //    one happened. Only a sustained Actions outage escapes.
  await check('previous-check-ran', async () => {
    const { data, error } = await supabase
      .from('pipeline_health')
      .select('ran_at')
      .order('ran_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) return [true, 'no prior run — this is the first check'];
    const ageH = (Date.now() - new Date(data[0].ran_at).getTime()) / 3600_000;
    return [
      ageH < HEARTBEAT_STALE_HOURS,
      `previous check ${ageH.toFixed(1)}h ago (limit ${HEARTBEAT_STALE_HOURS}h)`,
    ];
  });
}

// ── Entry point ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Videx pipeline health — ${new Date().toISOString()}\n`);
  await run();

  const failures = checks.filter((c) => !c.ok);
  const ok = failures.length === 0;

  // Capture both gaps regardless of outcome: check 4 reads stale_gap back
  // as the baseline for the next week, so it must be written even on a red
  // run. `gap` (the whole gap) is kept for history. Re-queried only if
  // check 4 threw before measuring it.
  let { gap, staleGap } = gapSnapshot;
  if (gap === null) {
    try {
      gap = await countGap();
    } catch {
      /* non-fatal — history simply lacks today's number */
    }
  }
  if (staleGap === null) {
    try {
      staleGap = await countStaleGap();
    } catch {
      /* non-fatal here — check 4 has already failed and said why */
    }
  }

  if (!DRY_RUN) {
    const { error } = await supabase.from('pipeline_health').insert({
      ok,
      failures: failures.map((f) => f.name),
      detail: { gap, stale_gap: staleGap, checks },
    });
    // A heartbeat we failed to write is itself a problem: check 8 would
    // report a gap that has nothing to do with the pipeline.
    if (error) {
      console.error(`\nFailed to write heartbeat: ${error.message}`);
      process.exit(1);
    }
  }

  console.log(
    `\n${ok ? 'HEALTHY' : 'UNHEALTHY'} — ${checks.length - failures.length}/${checks.length} checks passed`
  );
  if (!ok) {
    console.error(`\nFailed: ${failures.map((f) => f.name).join(', ')}`);
    console.error('\nStart with `SELECT * FROM sync_history;` — not cron.job_run_details,');
    console.error('which only proves pg_net queued the request.');
  }
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('pipeline-health crashed:', err);
  process.exit(1);
});
