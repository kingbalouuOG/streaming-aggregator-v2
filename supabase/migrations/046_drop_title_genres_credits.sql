-- Migration 046: drop title_genres + title_credits
--
-- Phase REPO-1 (E&P brief §4.3-2) — executing the parked drop from the
-- deferred-items register.
--
-- History: both tables were created in 001_content_tables.sql for a
-- v1-era genre/credits cache that never got populated. Phase 0.5 chose
-- denormalised columns on `titles` instead (`keywords`, `cast_top_5`,
-- `director` — migration 017) and intentionally left these empty
-- (Parking Lot IN-102 / IN-106). The one-time "reserved for the rec
-- engine migration" rationale expired with that decision.
--
-- Pre-flight (verified 2026-06-10): SELECT count(*) = 0 for BOTH tables
-- in production. No live code references — only the generated
-- database.types.ts blocks, removed in the same commit.
--
-- Per orchestration §3.3 this is a destructive between-phases migration:
-- take a manual Supabase snapshot before applying (§8.3). Neither table
-- has inbound FKs (001-era content tables follow the no-FK,
-- application-level-integrity convention — see migration 030's note).
-- RLS policies drop with their tables.

DROP TABLE IF EXISTS public.title_genres;
DROP TABLE IF EXISTS public.title_credits;
