-- ============================================
-- H0 Stream D — rate-limit username_available (IN-PX-29)
-- Migration 053
-- ============================================
--
-- `username_available(check_username text)` (migration 038) is a
-- SECURITY DEFINER RPC callable by anon + authenticated. It leaks a
-- single boolean per call, but an unbounded caller can enumerate which
-- usernames exist. Migration 038 removed the wide-open profiles SELECT
-- policy; this migration closes the remaining enumeration vector by
-- adding a per-IP fixed-window rate limit INSIDE the RPC.
--
-- Why in-DB and not at a gateway: the client calls this RPC directly
-- against PostgREST with the anon key (AuthContext.checkUsernameAvailable
-- → supabase.rpc('username_available', …)). It does NOT route through the
-- videx-api Worker, so a Cloudflare/Worker throttle would never see the
-- traffic. An in-function limit is the cheapest robust option that
-- actually covers the real call path.
--
-- Design:
--   * Fixed 1-minute windows, one counter row per (client_key, window).
--   * client_key = md5(client_ip) — we never store the raw IP at rest
--     (GDPR-minimising; the bucket only needs a stable opaque key), and
--     rows are self-cleaned within ~1h.
--   * Client IP is read from PostgREST's `request.headers` GUC
--     (x-forwarded-for, then x-real-ip). If neither is present (e.g.
--     direct SQL / admin access), we FAIL OPEN — never block a caller we
--     can't attribute — so legitimate signup traffic can never be locked
--     out by a missing header.
--   * Over-limit callers get a RAISE (SQLSTATE 54000). The client
--     (AuthContext) already treats any RPC error as "unavailable", so a
--     throttled attacker learns nothing; a real user won't hit 30/min.
--
-- The function changes from LANGUAGE sql / STABLE (038) to plpgsql /
-- VOLATILE because it now performs a write (the counter upsert). The
-- Promise<boolean> contract for SignUpScreen + OnboardingFlow.StepAccount
-- is unchanged.
--
-- Verification (run post-apply):
--   -- Counter increments and blocks after the limit:
--   SELECT public.username_available('probe_' || g) FROM generate_series(1,31) g;
--   -- (last call raises "rate limit exceeded …" only when called through
--   --  PostgREST with an IP header; direct SQL fails open and never raises.)
--   SELECT count(*) FROM public.username_check_rate_limit;  -- rows present
--
-- Reversibility: re-create the 038 sql/STABLE body and DROP TABLE
-- public.username_check_rate_limit.

-- ── Counter table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.username_check_rate_limit (
  client_key    text        NOT NULL,   -- md5(client_ip); never the raw IP
  window_start  timestamptz NOT NULL,   -- date_trunc('minute', now())
  request_count integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (client_key, window_start)
);

COMMENT ON TABLE public.username_check_rate_limit IS
  'IN-PX-29 fixed-window rate-limit counters for public.username_available. '
  'One row per (md5(client_ip), 1-minute window). Written only by the '
  'username_available SECURITY DEFINER function (which runs as the table '
  'owner and bypasses RLS); self-cleaned opportunistically. Holds no raw '
  'IPs and no user data.';

-- RLS on with NO policies: anon/authenticated get zero direct access.
-- The SECURITY DEFINER function runs as the owning role and is unaffected;
-- service_role bypasses RLS for maintenance.
ALTER TABLE public.username_check_rate_limit ENABLE ROW LEVEL SECURITY;

-- ── Rate-limited RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.username_available(check_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_headers  json;
  v_ip       text;
  v_key      text;
  v_window   timestamptz := date_trunc('minute', now());
  v_count    integer;
  -- Requests per IP per minute. Generous for real signup (a debounced
  -- availability check fires a handful of times per session); a hard
  -- brake on enumeration. Tune here if CGNAT false-positives appear.
  v_limit    constant integer := 30;
BEGIN
  -- Best-effort client IP from PostgREST request headers. Any failure
  -- (headers GUC unset, non-JSON, missing key) leaves v_ip NULL and we
  -- fall through without rate-limiting rather than blocking.
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_ip := split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1);
    IF v_ip IS NULL OR length(btrim(v_ip)) = 0 THEN
      v_ip := v_headers ->> 'x-real-ip';
    END IF;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  IF v_ip IS NOT NULL AND length(btrim(v_ip)) > 0 THEN
    v_key := md5(btrim(v_ip));

    -- Opportunistic cleanup (~1% of calls) keeps the table tiny without a
    -- dedicated cron. Windows older than an hour are long dead.
    IF random() < 0.01 THEN
      DELETE FROM public.username_check_rate_limit
      WHERE window_start < now() - interval '1 hour';
    END IF;

    INSERT INTO public.username_check_rate_limit (client_key, window_start, request_count)
    VALUES (v_key, v_window, 1)
    ON CONFLICT (client_key, window_start)
    DO UPDATE SET request_count = public.username_check_rate_limit.request_count + 1
    RETURNING request_count INTO v_count;

    IF v_count > v_limit THEN
      RAISE EXCEPTION 'rate limit exceeded for username availability checks'
        USING errcode = '54000';  -- program_limit_exceeded
    END IF;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE username = check_username
  );
END;
$function$;

COMMENT ON FUNCTION public.username_available(text) IS
  'Returns true when the given username is available for signup, false '
  'when taken. SECURITY DEFINER so anon callers can use it without direct '
  'SELECT on profiles. IN-PX-29: per-IP fixed-window rate limit (30/min) '
  'guards against username enumeration; fails open when no client IP is '
  'attributable. Replaces the 038 sql/STABLE body.';

-- EXECUTE grants are unchanged from 038 but re-stated for clarity after
-- the CREATE OR REPLACE.
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;
