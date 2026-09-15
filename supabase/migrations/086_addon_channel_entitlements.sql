-- 086 — add-on channels as per-user entitlements (IN-SC-004)
--
-- Replaces the 084/085 interim ("a channel-only title is on nobody's
-- services") with a per-user answer. Brief:
-- docs/strategy/briefs/addon-entitlements.md. Decisions taken with Joe
-- 2026-09-15 are recorded inline below.
--
-- THE MODEL.
--   * A channel (HBO Max, Shudder, NOW Cinema …) is ONE entitlement however
--     it is bought. `service_addons` maps each vendor (parent, addon_id) to a
--     Videx `channel_id`; Apple's repeated ids (Paramount+ ×3, Crunchyroll
--     ×2) and Prime's two HBO Max ids merge here, in data.
--   * A channel that is also a standalone Videx service (hbo, paramount,
--     discovery, crunchyroll, mubi) uses that service id as its channel id
--     and is held through `user_services` — picking "HBO Max" under Prime
--     and picking the HBO Max tile are the same selection. Every other
--     channel is held in `user_service_addons`.
--   * A channel row counts as "on your services" when the user holds the
--     parent AND the channel, or holds the standalone service it maps to.
--
-- THE DERIVATION (decision: second array on titles, not a query-time join).
--   `titles.available_services` keeps its 085 meaning — included with the
--   subscription. `titles.channel_services` holds one token per addon row,
--   `<parent>:<addon_id>` (e.g. `prime:shuddertv`). Raw vendor ids, so
--   editing the registry never needs a titles refresh. Both arrays are
--   maintained by the EXISTING streaming_availability trigger through the
--   same recompute function — no new writer of `titles`. A user's filter is
--     available_services && <services> OR channel_services && <tokens>
--   where the tokens come from expanding the registry against the user's
--   services + channels (src/lib/entitlements/channels.ts). Measured
--   2026-09-15 on a copy of titles: 20 ms BitmapOr over both GIN indexes,
--   against 615 ms for the equivalent join on streaming_availability.
--
-- FOR YOU (decision: fixed here). `get_available_tmdb_ids` — the RPC behind
-- For You's hard filter and anchored rooms — never read available_services:
-- it took every streaming_availability row, rent/buy/addon included, so 085
-- did not reach For You (71,798 ids for a Netflix/Prime/Apple/BBC/ITVX user
-- against 17,527 included). It now reads the two title arrays. The one-arg
-- call shape still works (channel_tokens defaults to '{}').
--
-- Reversibility: DROP the two tables, set_own_service_addons() and the
-- column; re-apply 085's three function bodies and 035's
-- get_available_tmdb_ids(text[]); re-apply the 079-era delete/export bodies.

-- ── 1. Curated channel registry ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_addons (
  parent_service_id     text        NOT NULL,
  addon_id              text        NOT NULL,
  channel_id            text        NOT NULL CHECK (channel_id ~ '^[a-z0-9_]{1,40}$'),
  display_name          text        NOT NULL,
  -- Set only when the channel IS a standalone Videx service; the channel id
  -- then equals that service id (one entitlement, one id).
  standalone_service_id text        CHECK (standalone_service_id IS NULL OR standalone_service_id = channel_id),
  -- Offered in the picker. Uncurated rows may exist for naming only.
  curated               boolean     NOT NULL DEFAULT true,
  sort                  integer     NOT NULL DEFAULT 100,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_service_id, addon_id)
);

CREATE INDEX IF NOT EXISTS idx_service_addons_channel ON public.service_addons (channel_id);

COMMENT ON TABLE public.service_addons IS
  'IN-SC-004: curated add-on channel registry. Maps a vendor addon row '
  '(streaming_availability.service_id + addon_id) to a Videx channel_id. '
  'Edit rows to change the picker; no release or titles refresh needed.';

ALTER TABLE public.service_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read the channel registry" ON public.service_addons;
CREATE POLICY "Anyone can read the channel registry" ON public.service_addons
  FOR SELECT TO anon, authenticated USING (true);
-- No write policies: service role only.

-- First list, from the brief; ids from the 2026-09-14 addon measurement.
-- Hayu is NOT a standalone Videx service (not in ServiceId), so it is a
-- plain channel, held once whether via Prime or a NOW pass. ITVX Premium is
-- not `itvx` — the ITVX tile is the free tier.
INSERT INTO public.service_addons
  (parent_service_id, addon_id, channel_id, display_name, standalone_service_id, sort)
VALUES
  ('prime', 'maxuk',                 'hbo',               'HBO Max',              'hbo',         10),
  ('prime', 'maxpayoneuk',           'hbo',               'HBO Max',              'hbo',         10),
  ('prime', 'paramountplusgb',       'paramount',         'Paramount+',           'paramount',   20),
  ('prime', 'discoveryplusuk',       'discovery',         'discovery+',           'discovery',   30),
  ('prime', 'crunchyrolluk',         'crunchyroll',       'Crunchyroll',          'crunchyroll', 40),
  ('prime', 'mubi',                  'mubi',              'MUBI',                 'mubi',        50),
  ('prime', 'hayu',                  'hayu',              'Hayu',                 NULL,          60),
  ('prime', 'itvxuk',                'itvx_premium',      'ITVX Premium',         NULL,          70),
  ('prime', 'mgm',                   'mgm_plus',          'MGM+',                 NULL,          80),
  ('prime', 'studiocanalpresentsuk', 'studiocanal',       'STUDIOCANAL Presents', NULL,          90),
  ('prime', 'lionsgateplusuk',       'lionsgate_plus',    'Lionsgate+',           NULL,         100),
  ('prime', 'shuddertv',             'shudder',           'Shudder',              NULL,         110),
  ('prime', 'bfiplayerplus',         'bfi_player',        'BFI Player',           NULL,         120),
  ('prime', 'curzonuk',              'curzon',            'Curzon',               NULL,         130),
  ('prime', 'acorntvuk',             'acorn_tv',          'Acorn TV',             NULL,         140),
  ('apple', 'tvs.sbd.1000439',       'paramount',         'Paramount+',           'paramount',   20),
  ('apple', 'tvs.sbd.1000090',       'paramount',         'Paramount+',           'paramount',   20),
  ('apple', 'tvs.sbd.10120',         'paramount',         'Paramount+',           'paramount',   20),
  ('apple', 'tvs.sbd.1000408',       'discovery',         'discovery+',           'discovery',   30),
  ('apple', 'tvs.sbd.1000631',       'crunchyroll',       'Crunchyroll',          'crunchyroll', 40),
  ('apple', 'tvs.sbd.11160',         'crunchyroll',       'Crunchyroll',          'crunchyroll', 40),
  ('apple', 'tvs.sbd.1000249',       'mubi',              'MUBI',                 'mubi',        50),
  ('apple', 'tvs.sbd.1000482',       'studiocanal',       'STUDIOCANAL Presents', NULL,          90),
  ('apple', 'tvs.sbd.1000290',       'bfi_player',        'BFI Player',           NULL,         120),
  ('apple', 'tvs.sbd.1000212',       'acorn_tv',          'Acorn TV',             NULL,         140),
  -- NOW has no base subscription; its passes are the entitlements
  -- (decision: included). The NOW tile stays the parent.
  ('now',   'movies',                'now_cinema',        'Cinema',               NULL,          10),
  ('now',   'entertainment',         'now_entertainment', 'Entertainment',        NULL,          20),
  ('now',   'hayu',                  'hayu',              'Hayu',                 NULL,          30)
ON CONFLICT (parent_service_id, addon_id) DO NOTHING;

-- ── 2. Per-user channel store (non-standalone channels only) ────────
CREATE TABLE IF NOT EXISTS public.user_service_addons (
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id text        NOT NULL CHECK (channel_id ~ '^[a-z0-9_]{1,40}$'),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

COMMENT ON TABLE public.user_service_addons IS
  'IN-SC-004: add-on channels a user holds (Shudder, MGM+, NOW Cinema …). '
  'Channels that are standalone services live in user_services instead. '
  'Write through set_own_service_addons().';

ALTER TABLE public.user_service_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own service addons" ON public.user_service_addons;
CREATE POLICY "Users can manage own service addons" ON public.user_service_addons
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Atomic replace (user_services' client-side delete-then-insert can leave a
-- user with nothing on a mid-way failure; this cannot). Unknown, uncurated
-- and standalone-mapped ids are dropped; the kept set is returned.
CREATE OR REPLACE FUNCTION public.set_own_service_addons(p_channel_ids text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_kept    text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'set_own_service_addons called without auth.uid()';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sa.channel_id ORDER BY sa.channel_id), '{}')
    INTO v_kept
  FROM public.service_addons sa
  WHERE sa.curated
    AND sa.standalone_service_id IS NULL
    AND sa.channel_id = ANY (COALESCE(p_channel_ids, '{}'));

  DELETE FROM public.user_service_addons
  WHERE user_id = v_user_id
    AND channel_id <> ALL (v_kept);

  INSERT INTO public.user_service_addons (user_id, channel_id)
  SELECT v_user_id, c FROM unnest(v_kept) AS c
  ON CONFLICT (user_id, channel_id) DO NOTHING;

  RETURN v_kept;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_own_service_addons(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_own_service_addons(text[]) TO authenticated, service_role;

-- ── 3. titles.channel_services ──────────────────────────────────────
ALTER TABLE public.titles
  ADD COLUMN IF NOT EXISTS channel_services text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_titles_channel_services
  ON public.titles USING gin (channel_services);

COMMENT ON COLUMN public.titles.channel_services IS
  'IN-SC-004: one <service_id>:<addon_id> token per addon-tier '
  'streaming_availability row. Kept exact alongside available_services by '
  'trg_sync_title_available_services; rebuild with '
  'refresh_title_available_services(); verify with '
  'count_available_services_drift().';

-- The three derivation functions carry both predicates and must agree.
CREATE OR REPLACE FUNCTION public.refresh_title_available_services()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_updated integer;
BEGIN
  WITH inc AS (
    SELECT sa.tmdb_id, sa.media_type,
           array_agg(DISTINCT sa.service_id ORDER BY sa.service_id) AS svcs
    FROM public.streaming_availability sa
    WHERE sa.stream_type IN ('subscription', 'free')
    GROUP BY sa.tmdb_id, sa.media_type
  ), ch AS (
    SELECT sa.tmdb_id, sa.media_type,
           array_agg(DISTINCT sa.service_id || ':' || sa.addon_id
                     ORDER BY sa.service_id || ':' || sa.addon_id) AS toks
    FROM public.streaming_availability sa
    WHERE sa.stream_type = 'addon' AND sa.addon_id IS NOT NULL
    GROUP BY sa.tmdb_id, sa.media_type
  ), agg AS (
    SELECT COALESCE(i.tmdb_id, c.tmdb_id)       AS tmdb_id,
           COALESCE(i.media_type, c.media_type) AS media_type,
           COALESCE(i.svcs, '{}')               AS svcs,
           COALESCE(c.toks, '{}')               AS toks
    FROM inc i
    FULL JOIN ch c ON c.tmdb_id = i.tmdb_id AND c.media_type = i.media_type
  )
  UPDATE public.titles t
  SET available_services = a.svcs,
      channel_services   = a.toks
  FROM agg a
  WHERE t.tmdb_id = a.tmdb_id
    AND t.media_type = a.media_type
    AND (t.available_services IS DISTINCT FROM a.svcs
         OR t.channel_services IS DISTINCT FROM a.toks);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Titles with neither an included nor an addon row left still need
  -- clearing; the join above cannot reach them.
  UPDATE public.titles t
  SET available_services = '{}',
      channel_services   = '{}'
  WHERE (t.available_services <> '{}' OR t.channel_services <> '{}')
    AND NOT EXISTS (
      SELECT 1 FROM public.streaming_availability sa
      WHERE sa.tmdb_id = t.tmdb_id AND sa.media_type = t.media_type
        AND (sa.stream_type IN ('subscription', 'free')
             OR (sa.stream_type = 'addon' AND sa.addon_id IS NOT NULL))
    );

  RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_title_available_services(
  p_tmdb_id    integer,
  p_media_type text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  UPDATE public.titles t
  SET available_services = COALESCE((
        SELECT array_agg(DISTINCT sa.service_id ORDER BY sa.service_id)
        FROM public.streaming_availability sa
        WHERE sa.tmdb_id = p_tmdb_id
          AND sa.media_type = p_media_type
          AND sa.stream_type IN ('subscription', 'free')
      ), '{}'),
      channel_services = COALESCE((
        SELECT array_agg(DISTINCT sa.service_id || ':' || sa.addon_id
                         ORDER BY sa.service_id || ':' || sa.addon_id)
        FROM public.streaming_availability sa
        WHERE sa.tmdb_id = p_tmdb_id
          AND sa.media_type = p_media_type
          AND sa.stream_type = 'addon'
          AND sa.addon_id IS NOT NULL
      ), '{}')
  WHERE t.tmdb_id = p_tmdb_id
    AND t.media_type = p_media_type;
$function$;

CREATE OR REPLACE FUNCTION public.count_available_services_drift()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  SELECT count(*)
  FROM public.titles t
  LEFT JOIN (
    SELECT sa.tmdb_id, sa.media_type,
           array_agg(DISTINCT sa.service_id ORDER BY sa.service_id) AS svcs
    FROM public.streaming_availability sa
    WHERE sa.stream_type IN ('subscription', 'free')
    GROUP BY sa.tmdb_id, sa.media_type
  ) a ON a.tmdb_id = t.tmdb_id AND a.media_type = t.media_type
  LEFT JOIN (
    SELECT sa.tmdb_id, sa.media_type,
           array_agg(DISTINCT sa.service_id || ':' || sa.addon_id
                     ORDER BY sa.service_id || ':' || sa.addon_id) AS toks
    FROM public.streaming_availability sa
    WHERE sa.stream_type = 'addon' AND sa.addon_id IS NOT NULL
    GROUP BY sa.tmdb_id, sa.media_type
  ) c ON c.tmdb_id = t.tmdb_id AND c.media_type = t.media_type
  WHERE t.available_services IS DISTINCT FROM COALESCE(a.svcs, '{}')
     OR t.channel_services   IS DISTINCT FROM COALESCE(c.toks, '{}');
$function$;

-- trg_sync_new_title_available_services (077) is untouched: neither writer
-- of `titles` supplies available_services on insert, so it always calls the
-- recompute above, which now fills both columns.

-- ── 4. For You's availability RPC reads the title arrays ────────────
-- DROP first: adding a parameter would otherwise leave two overloads and
-- PostgREST refuses ambiguous calls.
DROP FUNCTION IF EXISTS public.get_available_tmdb_ids(text[]);

CREATE FUNCTION public.get_available_tmdb_ids(
  service_ids    text[],
  channel_tokens text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT COALESCE(jsonb_agg(DISTINCT t.tmdb_id), '[]'::jsonb)
  FROM public.titles t
  WHERE t.available_services && service_ids
     OR t.channel_services   && COALESCE(channel_tokens, '{}');
$function$;

COMMENT ON FUNCTION public.get_available_tmdb_ids(text[], text[]) IS
  'IN-SC-004 (086): tmdb_ids included on the given services, or reachable '
  'through a held channel (channel_tokens = <service>:<addon_id>). Before '
  '086 this counted every stream type, rent/buy/addon included.';

GRANT EXECUTE ON FUNCTION public.get_available_tmdb_ids(text[], text[])
  TO anon, authenticated, service_role;

-- ── 5. Account deletion + export include the new user table (IN-PX-54) ─
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
  DELETE FROM public.card_impressions    WHERE user_id = v_user_id;
  DELETE FROM public.user_interactions   WHERE user_id = v_user_id;
  DELETE FROM public.taste_profiles      WHERE user_id = v_user_id;
  DELETE FROM public.user_services       WHERE user_id = v_user_id;
  DELETE FROM public.user_service_addons WHERE user_id = v_user_id;  -- IN-SC-004 / migration 086
  DELETE FROM public.user_genres         WHERE user_id = v_user_id;
  DELETE FROM public.watchlist           WHERE user_id = v_user_id;
  DELETE FROM public.onboarding_events   WHERE user_id = v_user_id;

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
      'version',      '1.2',
      'generated_at', now(),
      'user_id',      v_user_id
    ),
    'profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.profiles t WHERE t.id = v_user_id), '[]'::jsonb),
    'taste_profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.taste_profiles t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_services', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_services t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_service_addons', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_service_addons t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_genres', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_genres t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'watchlist', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.watchlist t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_interactions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_interactions t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'card_impressions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.card_impressions t WHERE t.user_id = v_user_id AND t.shown_at > now() - interval '90 days'), '[]'::jsonb),
    'onboarding_events', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.onboarding_events t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'availability_reports', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.availability_reports t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_interest_centroids', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_interest_centroids t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_feature_flags', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_feature_flags t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'app_feedback', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.app_feedback t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_push_tokens', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_push_tokens t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'notification_preferences', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notification_preferences t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'notification_deliveries', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notification_deliveries t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'card_impression_daily_totals', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.card_impression_daily_totals t WHERE t.user_id = v_user_id), '[]'::jsonb)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$function$;

-- ── 6. Derive every title under the new predicates, then prove it ────
SELECT public.refresh_title_available_services();

DO $$
DECLARE
  v_drift bigint;
BEGIN
  SELECT public.count_available_services_drift() INTO v_drift;
  IF v_drift <> 0 THEN
    RAISE EXCEPTION
      'available_services/channel_services drift is % after refresh; expected 0', v_drift;
  END IF;
  RAISE NOTICE 'available_services + channel_services drift: 0';
END $$;

NOTIFY pgrst, 'reload schema';
