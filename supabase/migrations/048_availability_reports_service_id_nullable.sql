-- ============================================
-- Availability reports — allow NULL service_id ("All services")
-- Migration 048
-- ============================================
--
-- Beta-blocking fix (H0 Stream A / roadmap 0.8). The report sheet's
-- default selection is "All" → the app sends service_id = NULL, and the
-- dashboard queries explicitly treat NULL as "all/unspecified"
-- (supabase/queries/report-queries.sql). But the production column was
-- NOT NULL, so every default-selection report failed the insert — and
-- the sheet showed "thanks!" regardless (fixed in ReportSheet.tsx),
-- masking it. Result: availability_reports had 0 rows ever, despite being
-- the hedge for our #1 strategic risk (bad availability data).
--
-- Drop the NOT NULL so "All" reports land. DROP NOT NULL is idempotent.
-- Guarded so it no-ops cleanly if the table is ever absent.
-- ============================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'availability_reports'
  ) THEN
    ALTER TABLE public.availability_reports
      ALTER COLUMN service_id DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.availability_reports.service_id IS
  'Streaming service the report is about; NULL = "All services" (general report).';
