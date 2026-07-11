-- 063: persistent skip-list for the catalogue-gap backfill.
--
-- Bug found 2026-07-11: list_missing_title_ids orders by tmdb_id and the
-- Edge Function merely `continue`s on a TMDb 404, recording nothing — so a
-- 404'd ID stays "missing" and every weekly 300-cap run re-fetches the SAME
-- lowest-ID dead stubs (the first manual run was 300/300 404s). The backlog
-- (~16.9K raw) can never drain.
--
-- Fix: record 404s in backfill_skips and exclude them from the anti-join.
-- The Edge Function change (backfill-missing-titles) writes the rows; this
-- migration must be applied BEFORE that redeploy (the EF tolerates the
-- table missing, but skips then still don't persist).
--
-- Reversibility: DROP TABLE public.backfill_skips;
--                re-apply migration 054's list_missing_title_ids body.

CREATE TABLE IF NOT EXISTS public.backfill_skips (
  tmdb_id    integer     NOT NULL,
  media_type text        NOT NULL CHECK (media_type IN ('movie', 'tv')),
  reason     text        NOT NULL DEFAULT 'tmdb_404',
  skipped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tmdb_id, media_type)
);

COMMENT ON TABLE public.backfill_skips IS
  'TMDb IDs the backfill-missing-titles EF confirmed dead (404) — excluded '
  'from list_missing_title_ids so capped runs make forward progress. '
  'Delete rows to force a re-check (e.g. if TMDb restores an ID).';

-- Service-role only: enable RLS with no policies (service_role bypasses).
ALTER TABLE public.backfill_skips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backfill_skips FROM anon, authenticated;

-- Exclude skips from the missing-IDs anti-join.
CREATE OR REPLACE FUNCTION public.list_missing_title_ids(p_limit integer DEFAULT 300)
RETURNS TABLE (tmdb_id integer, media_type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  SELECT DISTINCT sa.tmdb_id, sa.media_type
  FROM public.streaming_availability sa
  LEFT JOIN public.titles t
    ON t.tmdb_id = sa.tmdb_id
   AND t.media_type = sa.media_type
  LEFT JOIN public.backfill_skips s
    ON s.tmdb_id = sa.tmdb_id
   AND s.media_type = sa.media_type
  WHERE t.tmdb_id IS NULL
    AND s.tmdb_id IS NULL
    AND sa.media_type IN ('movie', 'tv')
  ORDER BY sa.tmdb_id
  LIMIT GREATEST(p_limit, 0);
$function$;
