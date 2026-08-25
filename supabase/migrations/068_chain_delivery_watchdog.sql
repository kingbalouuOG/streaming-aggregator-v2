-- ============================================
-- 068: chain delivery watchdog + downstream job slicing
-- ============================================
--
-- WHAT WENT WRONG, 2026-08-25 15:58 UTC (first live run of the A2 chain):
--
--   slices 0-11   ran cleanly, ~18.5s each, 379 titles added, 0 errors
--   16:02:36      slice 11 done — queued depth 12
--   16:02:36      POST | 502 | .../backfill-missing-titles
--   (chain stops; sync_log row sits at status='running' until reaped)
--
-- Cause: Edge Runtime workers linger well past the end of their request —
-- the shutdown events for that chain trail on until 16:05:37, three
-- minutes after the last slice ran. Twelve workers spawned inside 3.5
-- minutes, each lingering, and the runtime refused to start another.
--
-- Two lessons, both of which invert an assumption migration 067 was built
-- on:
--
--  1. INVOCATION COUNT is the scarce resource, not wall-clock duration.
--     Single invocations of 105s (backfill, 2026-08-23) and 128s
--     (sync-incremental, passim) complete fine. Forty 18s invocations do
--     not. So slices get BIGGER and FEWER, not smaller — the opposite of
--     what 067 did. See each function's SLICE_* constants.
--
--  2. `enqueue_function_call` returning successfully means pg_net QUEUED
--     the request. It says nothing about delivery. A 502 at delivery
--     killed the chain in total silence — structurally the same bug as
--     the `cron.job_run_details` = 'succeeded' problem that migration 066
--     exists to fix, just one layer down. Anything that hands off work
--     has to have something watching whether the handoff landed.
--
-- This migration adds that watcher, plus the plumbing for slicing the two
-- downstream jobs (enrich/embed) that A1/A2 left alone and which are now
-- the binding constraint: the 2026-08-25 chain added 379 titles against a
-- downstream capacity of 100/day each.
--
-- Reversibility:
--   SELECT cron.unschedule('chain-watchdog');
--   DROP FUNCTION public.resume_stalled_chains(interval, integer);
--   -- then re-apply migration 067's enqueue_function_call body and
--   -- migration 066's sync_log_sync_type_check.

-- ── A. Let the downstream jobs log themselves ──────────────────────
ALTER TABLE public.sync_log DROP CONSTRAINT IF EXISTS sync_log_sync_type_check;
ALTER TABLE public.sync_log ADD CONSTRAINT sync_log_sync_type_check
  CHECK (sync_type IN ('full', 'incremental', 'changes', 'backfill', 'enrich', 'embed'));

-- ── B. Let the downstream jobs chain ───────────────────────────────
-- Same allow-list rationale as 067: SECURITY DEFINER + an injected
-- service-role JWT means the target set must stay explicit.
CREATE OR REPLACE FUNCTION public.enqueue_function_call(
  p_function text,
  p_body     jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_request_id bigint;
  v_key        text;
BEGIN
  IF p_function NOT IN (
    'backfill-missing-titles',
    'sync-incremental',
    'enrich-new-titles',
    'embed-new-titles'
  ) THEN
    RAISE EXCEPTION 'enqueue_function_call: % is not an allowed target', p_function;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'enqueue_function_call: vault secret "service_role_key" is missing';
  END IF;

  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_body,
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_function_call(text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.enqueue_function_call(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_function_call(text, jsonb) TO service_role;

-- ── C. The watchdog ────────────────────────────────────────────────
--
-- Finds chains that stopped advancing and restarts them from their saved
-- position, recording WHY they stalled. Without this, a single 502
-- anywhere in a chain means the backlog stops draining until the next
-- scheduled run — which for the weekly backfill is six days of nothing.
--
-- Delivery status comes from net._http_response, looked up by the
-- request id each function stores in chain_state.last_request_id. That
-- table is pruned after a few hours, so an unknown status is normal for
-- an old chain and is recorded as such rather than treated as failure.
--
-- ON DUPLICATE SLICES: if the watchdog resumes a chain whose slice is in
-- fact still alive, two slices run concurrently. Every slice's writes are
-- idempotent by design — titles upsert on (tmdb_id, media_type),
-- backfill_skips upsert on the same, enrich/embed are single-row updates
-- keyed by id — so the cost is duplicated work, never corruption. The
-- 3-minute staleness threshold against sub-10s heartbeats makes it
-- unlikely; cheap-and-safe beats a distributed lock here.
CREATE OR REPLACE FUNCTION public.resume_stalled_chains(
  p_stale_after  interval DEFAULT interval '3 minutes',
  p_max_resumes  integer  DEFAULT 5
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r              record;
  v_resumed      integer := 0;
  v_function     text;
  v_resumes      integer;
  v_depth        integer;
  v_status       text;
  v_request_id   bigint;
BEGIN
  FOR r IN
    SELECT id, sync_type, chain_state
    FROM public.sync_log
    WHERE status = 'running'
      AND chain_state IS NOT NULL
      AND heartbeat_at < now() - p_stale_after
  LOOP
    -- sync_type is the authority on which function owns the chain.
    v_function := CASE r.sync_type
      WHEN 'backfill'    THEN 'backfill-missing-titles'
      WHEN 'incremental' THEN 'sync-incremental'
      WHEN 'enrich'      THEN 'enrich-new-titles'
      WHEN 'embed'       THEN 'embed-new-titles'
      ELSE NULL
    END;
    CONTINUE WHEN v_function IS NULL;

    v_resumes := COALESCE((r.chain_state->>'resumes')::integer, 0);
    v_depth   := COALESCE((r.chain_state->>'depth')::integer, 0);

    -- Why did the handoff not land? NULL/absent is normal for an old
    -- chain (net._http_response is pruned) and must not read as failure.
    v_request_id := NULLIF(r.chain_state->>'last_request_id', '')::bigint;
    v_status := NULL;
    IF v_request_id IS NOT NULL THEN
      SELECT COALESCE(status_code::text, error_msg) INTO v_status
      FROM net._http_response WHERE id = v_request_id;
    END IF;

    IF v_resumes >= p_max_resumes THEN
      UPDATE public.sync_log
      SET status        = 'failed',
          completed_at  = now(),
          errors        = GREATEST(COALESCE(errors, 0), 1),
          error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
            'fatal', format(
              'chain abandoned after %s resume attempts; last handoff delivery status: %s',
              v_resumes, COALESCE(v_status, 'unknown')),
            'last_request_id', v_request_id
          ),
          chain_state   = r.chain_state || jsonb_build_object(
            'stopped_because', 'watchdog gave up after ' || v_resumes || ' resumes')
      WHERE id = r.id;
      CONTINUE;
    END IF;

    -- Bump the heartbeat as part of resuming, so reap_stale_sync_runs()
    -- does not close the row out from under a chain we are nursing.
    UPDATE public.sync_log
    SET heartbeat_at = now(),
        chain_state  = r.chain_state || jsonb_build_object(
          'resumes', v_resumes + 1,
          'last_resume_at', now(),
          'last_delivery_status', COALESCE(v_status, 'unknown')
        ),
        error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
          'stalled_handoffs', COALESCE((error_details->>'stalled_handoffs')::integer, 0) + 1
        )
    WHERE id = r.id;

    PERFORM public.enqueue_function_call(
      v_function,
      jsonb_build_object('depth', v_depth + 1, 'runId', r.id::text)
    );
    v_resumed := v_resumed + 1;
  END LOOP;

  RETURN v_resumed;
END;
$function$;

COMMENT ON FUNCTION public.resume_stalled_chains(interval, integer) IS
  'Restarts chained Edge Function runs whose handoff failed to land '
  '(observed: HTTP 502 from the Edge Runtime under rapid invocation). '
  'Records the delivery status from net._http_response. Gives up after '
  'p_max_resumes and marks the run failed. service_role only.';

REVOKE ALL ON FUNCTION public.resume_stalled_chains(interval, integer) FROM public;
REVOKE ALL ON FUNCTION public.resume_stalled_chains(interval, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_stalled_chains(interval, integer) TO service_role;

-- ── D. Run it every 5 minutes ──────────────────────────────────────
-- Pure SQL, no HTTP: this cron cannot itself be severed by pg_net.
SELECT cron.unschedule('chain-watchdog')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chain-watchdog');

SELECT cron.schedule(
  'chain-watchdog',
  '*/5 * * * *',
  $cron$ SELECT public.resume_stalled_chains(); $cron$
);

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Function and cron exist.
--   SELECT to_regprocedure('public.resume_stalled_chains(interval,integer)');
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'chain-watchdog';
--
--   -- 2. Allow-list still rejects anything unexpected.
--   SELECT public.enqueue_function_call('evil-function');   -- expect: not allowed
--
--   -- 3. The 2026-08-25 stalled chain is the natural first test. If it is
--   --    still 'running', the watchdog should pick it up within 5 minutes
--   --    and resume it; watch chain_state->>'resumes' go to 1 and slices
--   --    start climbing again.
--   SELECT sync_type, status, titles_added,
--          chain_state->>'slices'  AS slices,
--          chain_state->>'resumes' AS resumes,
--          chain_state->>'last_delivery_status' AS last_delivery,
--          heartbeat_at
--   FROM public.sync_log WHERE chain_state IS NOT NULL
--   ORDER BY started_at DESC LIMIT 5;
