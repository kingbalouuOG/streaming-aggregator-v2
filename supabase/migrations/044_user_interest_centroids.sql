-- Migration 044: user_interest_centroids
--
-- Phase ENG-1 (E&P Hardening track) — Workstream A, multi-interest retrieval.
-- Brief: docs/v2/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md §3.2.
-- Plan:  docs/plans/2026-06-10-001-feat-phase-eng-1-multi-interest-plan.md §1.1.
--
-- Replaces the single-centroid retrieval ceiling with up to K=3 interest
-- centroids per user (K fixed at 3, locked E&P brief §9 D3 — slot 0–2).
-- A user who picks "cozy British comedy" + "dark thrillers" at onboarding
-- currently gets one averaged vector pointing at neither; per-interest
-- centroids give each interest its own retrieval pool.
--
-- taste_profiles.taste_vector_v2 is NOT touched — it continues to be
-- maintained as the single-centroid summary (mood-room affinity, semantic
-- search taste-fit, and the no-centroids fallback path all still read it).
--
-- Sizing: 3 × 1536 × 4B ≈ 18KB/user — negligible (brief §10). No index
-- beyond the PK: per-user fetch is a 3-row PK-prefix scan.

-- =============================================================================
-- 1. Table definition
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_interest_centroids (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot        SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 2),
  centroid    vector(1536) NOT NULL,
  weight      REAL NOT NULL DEFAULT 0.3333 CHECK (weight > 0 AND weight <= 1),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, slot)
);

COMMENT ON TABLE public.user_interest_centroids IS
  'Per-user interest centroids (K <= 3) for multi-interest retrieval (ENG-1). Absence of rows means the user is on the single-centroid fallback path (taste_profiles.taste_vector_v2). weight = share of recent positive interactions, floored at 0.15 and normalised to sum 1 across the user''s slots.';

-- =============================================================================
-- 2. Row-level security
--
-- Owner-scoped, same shape as user_feature_flags (041). Client reads its
-- own centroids under RLS; render-foryou-rows reads via service-role +
-- withUserScope (service-role bypass of RLS is implicit — no explicit
-- policy needed, per the 041 precedent).
-- =============================================================================

ALTER TABLE public.user_interest_centroids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own interest centroids" ON public.user_interest_centroids;
CREATE POLICY "Users manage own interest centroids"
  ON public.user_interest_centroids
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 3. updated_at trigger (041 pattern)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.touch_user_interest_centroids_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_interest_centroids_touch_updated_at ON public.user_interest_centroids;
CREATE TRIGGER user_interest_centroids_touch_updated_at
  BEFORE UPDATE ON public.user_interest_centroids
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_interest_centroids_updated_at();

-- =============================================================================
-- 4. delete_own_account() — add the new user-scoped table (042 contract)
--
-- The FK cascade from auth.users already covers user_interest_centroids;
-- 042's contract is explicit DELETEs as belt-and-braces against a future
-- cascade-rule regression, so the new table joins the list. CREATE OR
-- REPLACE without DROP: the signature is unchanged, and skipping the DROP
-- preserves existing grants.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_own_account called without auth.uid()';
  END IF;

  -- Public-schema tables that reference profiles. CASCADE handles these
  -- automatically when the profiles row is deleted below; the explicit
  -- DELETEs are belt-and-braces against a future cascade-rule regression.
  DELETE FROM public.card_impressions   WHERE user_id = v_user_id;
  DELETE FROM public.user_interactions  WHERE user_id = v_user_id;
  DELETE FROM public.taste_profiles     WHERE user_id = v_user_id;
  DELETE FROM public.user_services      WHERE user_id = v_user_id;
  DELETE FROM public.user_genres        WHERE user_id = v_user_id;
  DELETE FROM public.watchlist          WHERE user_id = v_user_id;
  DELETE FROM public.onboarding_events  WHERE user_id = v_user_id;

  -- Public-schema tables that reference auth.users directly.
  DELETE FROM public.user_feature_flags WHERE user_id = v_user_id;
  DELETE FROM public.user_interest_centroids WHERE user_id = v_user_id;  -- ENG-1 / migration 044

  -- profiles row last in the public schema (its CASCADE will have
  -- already removed all the rows above; this is the defensive
  -- backstop).
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Finally the auth.users row. Any cascade rules still attached
  -- to auth.users will fire here harmlessly — every child row has
  -- already been removed above.
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.delete_own_account() IS 'GDPR Article 17 / right-to-erasure RPC. Deletes the caller''s account and all associated rows across user-scoped tables. SECURITY DEFINER with explicit DELETEs as belt-and-braces against cascade-rule regression. See migration 042 / Phase 5.5 C10 for the audit trail; extended by migration 044 (user_interest_centroids).';

-- =============================================================================
-- 5. export_user_data() — add the new user-scoped table (043 contract)
--
-- Article 15 completeness: derived data, but the taste_profiles vector is
-- already exported so the precedent is set. CREATE OR REPLACE without
-- DROP for the same grant-preservation reason as §4.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.export_user_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id  uuid := auth.uid();
  v_payload  jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'export_user_data called without auth.uid()';
  END IF;

  SELECT jsonb_build_object(
    '_export_metadata', jsonb_build_object(
      'version',      '1.1',
      'generated_at', now(),
      'user_id',      v_user_id
    ),
    'profiles', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.profiles t
      WHERE t.id = v_user_id
    ), '[]'::jsonb),
    'taste_profiles', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.taste_profiles t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    -- ENG-1 / migration 044: interest centroids are user-scoped derived data.
    'user_interest_centroids', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_interest_centroids t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_services', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_services t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_genres', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_genres t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'watchlist', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.watchlist t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_interactions', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_interactions t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    -- card_impressions capped to 90 days (see migration 014 rollup job).
    'card_impressions', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.card_impressions t
      WHERE t.user_id = v_user_id
        AND t.shown_at > now() - interval '90 days'
    ), '[]'::jsonb),
    'onboarding_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.onboarding_events t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.export_user_data() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.export_user_data() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.export_user_data() IS 'GDPR Article 20 / right-to-portability RPC. Returns a JSON object with one key per user-scoped table, scoped to auth.uid(). card_impressions capped to last 90 days (see migration 014 rollup). See migration 043 / Phase 5.5 C15 for the audit trail; extended by migration 044 (user_interest_centroids).';

-- =============================================================================
-- End of migration 044
-- =============================================================================
