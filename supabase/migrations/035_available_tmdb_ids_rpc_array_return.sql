-- ============================================
-- Phase 4.5 follow-up — cold-start performance fix
-- Migration 035
-- ============================================
--
-- Joe's feedback (2026-04-30): "The first load on For You is too slow
-- to go to market with." Investigation showed `get_available_tmdb_ids`
-- was the dominant cold-path bottleneck — its TABLE return type caps
-- at PostgREST's 1000-row default, so the client paginates with 20
-- sequential `.range()` calls to fetch the user's ~18k available IDs.
-- Each call is a full HTTP round trip; on residential WAN this is
-- 1.5-2s of For You's load time.
--
-- Fix: flip the wire format from `RETURNS TABLE(tmdb_id integer)` to
-- `RETURNS jsonb` (single-row JSONB array). One round trip regardless
-- of result size. The query logic is unchanged.
--
-- Backwards-incompat: the function signature changes return type, so
-- DROP-then-CREATE is required (Postgres rejects in-place return-type
-- changes). All client callsites updated to read the JSON array
-- directly instead of mapping over rows.
--
-- Broader cold-start improvement options filed at parking-lot IN-466.

DROP FUNCTION IF EXISTS public.get_available_tmdb_ids(text[]);

CREATE OR REPLACE FUNCTION public.get_available_tmdb_ids(service_ids text[])
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(jsonb_agg(DISTINCT sa.tmdb_id), '[]'::jsonb)
  FROM streaming_availability sa
  WHERE sa.service_id = ANY(service_ids);
$function$;

COMMENT ON FUNCTION public.get_available_tmdb_ids(text[]) IS
  'Returns the distinct tmdb_ids available across the given service_ids '
  'as a single JSONB array. JSONB-array return rather than TABLE so the '
  'client gets all IDs in one round trip (PostgREST caps TABLE returns '
  'at 1000 rows). Replaces the migration 028 TABLE shape.';
