-- 087 — add-on channel follow-ups (IN-SC-005, IN-SC-007, search)
--
-- Three small changes to the 086 channel model, in one migration so they are
-- applied once. Numbering: the growth plan's migrations move to 088–090
-- (decided with Joe 2026-09-15).
--
-- APPLY NOTES
--   * Apply BEFORE merging the PR that carries it. The catalogue-walk
--     workflow runs the sync scripts from `main`, and with the per-channel
--     dedup below they can stage a second channel row for a title — which the
--     OLD unique index rejects.
--   * Deploy `sync-incremental` after applying, for the same reason.
--   * Step 2 builds a unique index on streaming_availability (~230k rows)
--     without CONCURRENTLY, so writes to that table wait for a few seconds.
--     Apply outside the 04:50–07:45 UTC cron window.

-- ── 1. IN-SC-007: RLS initplan on user_service_addons ──────────────
-- `auth.uid()` in a policy is re-evaluated per row; `(select auth.uid())` is
-- evaluated once per statement (Supabase advisor auth_rls_initplan).
DROP POLICY IF EXISTS "Users can manage own service addons" ON public.user_service_addons;
CREATE POLICY "Users can manage own service addons" ON public.user_service_addons
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 2. IN-SC-005: the availability key includes the channel ─────────
-- The old key (tmdb_id, media_type, service_id, stream_type, quality) held
-- ONE addon row per title per parent, so a title on two Prime channels kept
-- only one of them and a holder of the other never saw it. Measured
-- 2026-09-15: 4 of 93 popular titles sit on two or more Prime channels
-- (e.g. MUBI + Paramount+, HBO Max + Lionsgate+); none on Apple.
--
-- The new key is strictly finer than the old one, so it builds on the
-- existing data (verified: 0 duplicates on the new key). Built first, then the
-- old index is dropped and the new one takes its name. No writer names this
-- index — all three use delete-then-insert, not ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_unique_entry_v2
  ON public.streaming_availability
  USING btree (tmdb_id, media_type, service_id, stream_type, COALESCE(quality, 'default'), COALESCE(addon_id, ''));

DROP INDEX IF EXISTS public.idx_sa_unique_entry;
ALTER INDEX public.idx_sa_unique_entry_v2 RENAME TO idx_sa_unique_entry;

-- The second channel rows come back on the next walk of each catalogue
-- (Prime + Apple monthly on the 2nd, per Joe) — nothing is backfilled here.

-- ── 3. Held channels count for the search "Free" filter ────────────
-- subscription_included_titles (080) answered "included with these
-- services" from subscription/free rows only. It now also accepts the
-- channel tokens a user holds (`<service>:<addon_id>`, see 086), so a
-- Shudder film passes "Free to watch" for someone holding Shudder via Prime.
-- DROP first: adding a parameter would otherwise leave two overloads.
-- The two-argument call shape still works (p_channel_tokens defaults to '{}').
DROP FUNCTION IF EXISTS public.subscription_included_titles(integer[], text[]);

CREATE FUNCTION public.subscription_included_titles(
  p_tmdb_ids       integer[],
  p_services       text[] DEFAULT NULL,
  p_channel_tokens text[] DEFAULT '{}'
)
RETURNS TABLE(tmdb_id integer, media_type text)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT DISTINCT sa.tmdb_id, sa.media_type
  FROM public.streaming_availability sa
  WHERE sa.tmdb_id = ANY (p_tmdb_ids)
    AND (
      (
        sa.stream_type IN ('subscription', 'free')
        AND (
          p_services IS NULL
          OR cardinality(p_services) = 0
          OR sa.service_id = ANY (p_services)
        )
      )
      OR (
        sa.stream_type = 'addon'
        AND sa.addon_id IS NOT NULL
        AND sa.service_id || ':' || sa.addon_id = ANY (COALESCE(p_channel_tokens, '{}'))
      )
    );
$function$;

COMMENT ON FUNCTION public.subscription_included_titles(integer[], text[], text[]) IS
  '080/087: which of these titles are included with the given services '
  '(subscription/free rows; all services when p_services is null or empty), '
  'or reachable through a held channel token (<service>:<addon_id>).';

GRANT EXECUTE ON FUNCTION public.subscription_included_titles(integer[], text[], text[])
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
