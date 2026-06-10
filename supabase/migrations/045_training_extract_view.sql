-- Migration 045: v_training_examples — ENG-2 training extract view
--
-- Phase ENG-1 (E&P Hardening track) — Workstream D, training-data
-- groundwork. Brief §3.5: define the training extract NOW so the dataset
-- accumulates in the right shape from the day real traffic arrives. The
-- ENG-2 learned re-ranker trains on this view once the data gate
-- (≥5–10K impressions with ≥500 positive outcomes) is met.
--
-- One row per impression, LEFT JOINed to the FIRST same-session positive
-- outcome on the same title at-or-after the impression. label_positive
-- is the training label; position / exploration / position_at_click are
-- the features ENG-1 made reliable (positions from card_impressions,
-- exploration tag from the Workstream C slot, position-at-click from the
-- clickContext stash via interaction metadata).
--
-- security_invoker = true: the view runs with the caller's privileges,
-- so base-table RLS applies (users could only ever see their own rows;
-- ENG-2 training reads with service role and sees everything). Avoids
-- the Supabase security-advisor definer-view warning.
--
-- Known limitation (documented, accepted): card_impressions has no
-- media_type column, so the join is on content_id within a session —
-- the same 0.8% movie/TV collision class as IN-458. Acceptable noise
-- for a training extract; revisit only if ENG-2 evals show it matters.
-- Filed in the Parking Lot at ENG-1 close-out.
--
-- View, not materialised: computes over the 90-day raw-row retention
-- window (migration 014 rollup). ENG-2's nightly trainer snapshots
-- extracts; this stays the canonical query shape.

DROP VIEW IF EXISTS public.v_training_examples;

CREATE VIEW public.v_training_examples
WITH (security_invoker = true) AS
SELECT
  i.user_id,
  i.content_id,
  i.source_surface,
  i.position,
  i.session_id,
  i.shown_at,
  COALESCE((i.metadata->>'exploration')::boolean, false) AS exploration,
  o.event_type                   AS outcome_event,
  o.created_at                   AS outcome_at,
  (o.metadata->>'position')::int AS position_at_click,
  (o.event_type IS NOT NULL)     AS label_positive
FROM public.card_impressions i
LEFT JOIN LATERAL (
  SELECT u.event_type, u.created_at, u.metadata
  FROM public.user_interactions u
  WHERE u.user_id    = i.user_id
    AND u.content_id = i.content_id
    AND u.session_id = i.session_id
    AND u.event_type IN ('thumbs_up', 'watchlist_add', 'deep_link_click', 'watched')
    AND u.created_at >= i.shown_at
  ORDER BY u.created_at ASC
  LIMIT 1
) o ON true;

COMMENT ON VIEW public.v_training_examples IS 'ENG-2 training extract (defined at ENG-1 per E&P brief §3.5). One row per card impression with the first same-session positive outcome on the same title. label_positive = training label; position / exploration / position_at_click are the day-one-reliable features. security_invoker — base-table RLS applies. See migration 045.';
