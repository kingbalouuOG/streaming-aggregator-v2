-- ============================================
-- 067: self-chaining Edge Function slices (Workstream A2)
-- ============================================
--
-- pg_net severs every cron→Edge-Function call at 30s (migration 062 set
-- that ceiling deliberately; the default was 5s). Confirmed live on
-- 2026-08-25 — `net._http_response` records both daily jobs ending in
-- "Timeout of 30000 ms reached".
--
-- WHAT THAT DOES AND DOESN'T DO, measured rather than assumed:
--   * It does NOT kill the function. The 2026-08-23 backfill started at
--     05:00:06 and returned HTTP 200 at 05:01:51 — 105s, long past the
--     sever. The isolate outlives the disconnected client.
--   * What it does is discard the OUTCOME. Nothing downstream ever learns
--     whether the work succeeded, so no retry, no alert, no signal.
--   * The genuine casualty is the Edge Function wall-clock limit. 4 of the
--     last 14 sync-incremental runs were killed mid-pagination and left
--     `sync_log` stuck at 'running' (2026-08-16, -17, -19, -25). Because
--     `getLastSyncTimestamp()` only reads status='completed', the next run
--     re-requests the same window — which is why ~40% of SA API spend is
--     re-fetching pages we already paid for.
--
-- The fix is to stop having long jobs at all: each invocation does a slice
-- sized to finish in well under 20s, persists its progress, and hands the
-- next slice off. Cron only ever kicks off slice 0, so the 30s ceiling
-- stops being load-bearing.
--
-- WHY pg_net FOR THE HANDOFF, not a fetch() inside the function:
-- an Edge Function isolate can be torn down as soon as it writes its
-- response, which can drop an outbound request that has not flushed. That
-- would break the chain silently and intermittently — the worst kind. A
-- pg_net request is queued inside Postgres and is completely independent
-- of the calling isolate's lifetime. It also reuses the Vault
-- `service_role_key` and URL pattern every existing cron already uses.
--
-- Reversibility:
--   DROP FUNCTION public.enqueue_function_call(text, jsonb);
--   ALTER TABLE public.sync_log DROP COLUMN chain_state;

-- ── Resume state for a chained run ─────────────────────────────────
-- Holds the cursor position a slice stopped at, plus the running totals,
-- so the next slice picks up exactly where this one left off instead of
-- restarting the window.
ALTER TABLE public.sync_log
  ADD COLUMN IF NOT EXISTS chain_state jsonb;

COMMENT ON COLUMN public.sync_log.chain_state IS
  'A2: resume position + running totals for a sliced job. Shape is owned '
  'by the Edge Function that writes it. NULL on unsliced/legacy runs.';

-- ── Refuse to apply without the Vault entry ────────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM vault.secrets WHERE name = 'service_role_key';
  IF v_count = 0 THEN
    RAISE EXCEPTION
      'vault.secrets entry "service_role_key" not found. It should already '
      'exist from migration 039. Create it before applying.';
  END IF;
END $$;

-- ── The chaining primitive ─────────────────────────────────────────
--
-- Queues an authenticated POST to one of our own Edge Functions and
-- returns immediately. The caller does not wait for, and cannot see, the
-- response — that is the entire point.
--
-- SECURITY: this is SECURITY DEFINER and injects a service-role JWT, so
-- the target is restricted to an explicit allow-list. Without that, EXECUTE
-- on this function would be a general-purpose authenticated-request gadget
-- pointed at anything the Vault key can reach.
--
-- The 5s timeout applies only to establishing the request. The slice it
-- starts runs for ~20s; we neither wait for it nor care what it returns,
-- so a timeout recorded against THIS call is meaningless and expected.
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
  IF p_function NOT IN ('backfill-missing-titles', 'sync-incremental') THEN
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

COMMENT ON FUNCTION public.enqueue_function_call(text, jsonb) IS
  'A2: fire-and-forget POST to an allow-listed Edge Function, used by '
  'sliced jobs to hand off their next slice. Queued in Postgres so the '
  'handoff survives the calling isolate being torn down. service_role only.';

REVOKE ALL ON FUNCTION public.enqueue_function_call(text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.enqueue_function_call(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_function_call(text, jsonb) TO service_role;

-- ── Cheap-to-call gap size ─────────────────────────────────────────
--
-- The backfill previously sized the gap by calling
-- list_missing_title_ids(BATCH_LIMIT + 1) and measuring the array — which
-- caps out at the batch limit and so can only ever answer "at least N".
--
-- COST WARNING, measured 2026-08-25: the underlying anti-join is a merge
-- anti-join over 89,822 streaming_availability rows against 22,864 titles
-- and runs in ~2.3s. That is far too expensive to call once per slice —
-- 40 slices would burn 92s of pure accounting. Callers must invoke this
-- at the START and END of a chain only, never inside the slice loop. A
-- chain's real stop condition is a slice coming back short, which costs
-- nothing extra to observe.
CREATE OR REPLACE FUNCTION public.count_missing_title_ids()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  SELECT count(*) FROM (
    SELECT DISTINCT sa.tmdb_id, sa.media_type
    FROM public.streaming_availability sa
    LEFT JOIN public.titles t
      ON t.tmdb_id = sa.tmdb_id AND t.media_type = sa.media_type
    LEFT JOIN public.backfill_skips s
      ON s.tmdb_id = sa.tmdb_id AND s.media_type = sa.media_type
    WHERE t.tmdb_id IS NULL
      AND s.tmdb_id IS NULL
      AND sa.media_type IN ('movie', 'tv')
  ) q;
$function$;

COMMENT ON FUNCTION public.count_missing_title_ids() IS
  'A2: exact size of the titles gap. ~2.3s — call at chain start/end only, '
  'never per slice. service_role only.';

REVOKE ALL ON FUNCTION public.count_missing_title_ids() FROM public;
REVOKE ALL ON FUNCTION public.count_missing_title_ids() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_missing_title_ids() TO service_role;

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Column and function exist.
--   SELECT to_regprocedure('public.enqueue_function_call(text,jsonb)');  -- not null
--
--   -- 2. Allow-list holds.
--   SELECT public.enqueue_function_call('evil-function');   -- expect: not an allowed target
--
--   -- 3. Live chain check, AFTER both functions are redeployed. Kick off
--   --    slice 0 by hand, wait ~2 min, then confirm the chain advanced:
--   SELECT public.enqueue_function_call('backfill-missing-titles');
--   SELECT status, titles_added, errors, chain_state->>'depth' AS depth,
--          heartbeat_at, error_details
--   FROM public.sync_log WHERE sync_type = 'backfill'
--   ORDER BY started_at DESC LIMIT 1;
--   -- depth should climb across successive polls; titles_added should be
--   -- non-zero. If titles_added=0 and error_details mentions HTTP 401, the
--   -- chain is working and TMDB_API_KEY is still the blocker.
