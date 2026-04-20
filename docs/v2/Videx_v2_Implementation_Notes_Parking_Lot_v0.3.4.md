# Videx v2 — Implementation Notes Parking Lot

**Status:** v0.3.4 — Phase 0.5 entries (IN-101 through IN-107) marked as ✅ Incorporated following Phase 0.5 closeout; four new entries filed from Phase 0.5 deviations
**Version:** 0.3.4

**Changes from v0.3.3:**
- IN-101 through IN-107 status flipped from ⏳ Not yet incorporated → ✅ Incorporated. All seven Phase 0.5 entries are now reflected in shipped code and migration 017 on the `phase-0.5-content-enrichment` branch (commits `e813c39` through `c4a8916`).
- Phase 0.5 section gained two new entries (IN-PX-06, IN-PX-07) covering the TV director extraction widening follow-up and the split-by-media_type director gate policy — both filed from the in-phase analysis of the 77.2% director coverage miss (see Phase 0.5 summary §3 Deviation 3).
- Cross-phase section gained two new entries (IN-XPS-004, IN-XPS-005) — the service-role JWT rotation plan before launch, and the Windows tmp+rename lesson from the backfill EPERM crash (see Phase 0.5 summary §3 Deviation 1).

**Changes from v0.3.2:**
- IN-PRE-001 and IN-001 through IN-013 status flipped from ⏳ Not yet incorporated → ✅ Incorporated. All 14 Phase 0 entries are now reflected in shipped code and migrations on the `phase-0-instrumentation` branch (commits `ea1e456` through `e8702dc`). IN-005/IN-011 status notes call out the in-phase 015/016 deviations (partition RLS hardening) per Phase 0 summary §3.

**Changes from v0.3.1:**
- IN-007 prose reference to `(interaction_type union)` corrected to `(event_type union)` — the TypeScript union reflects the database column name
- IN-008 format narrative updated to `{media_type}-{content_id}` for consistency with the pseudocode
- IN-010 `ImpressionEvent` TypeScript interface corrected to use `content_id: number` matching the `card_impressions` table schema
- See Corrections v0.3.2 patch document for the full diff

**Changes from v0.3:**
- IN-005 `card_impressions` schema corrected to use `content_id` (not `tmdb_id`) for consistency with `user_interactions`
- IN-007 migration 013 scope expanded to include `source_surface` top-level column and the `emitInteraction()` signature changes
- IN-008 `getDismissedIds()` pseudocode corrected to use real column names (`event_type`, `content_id`)
- IN-011 aggregation table schema corrected to use `content_id`
- See Corrections v0.3.1 document for the full diff

**Purpose:** A running list of implementation-level notes that need to make it into CC briefs when we reach the relevant phase. These are details that came up during strategy, design, or review work but don't belong in strategy or design documents themselves.

**How to use:** when writing a CC brief for any phase, scan this file for entries tagged to that phase and incorporate them. Once incorporated, mark them as ✅ and leave them in the file as a record.

**Changes from v0.2:**
- New Pre-Phase 0 section added with entry IN-PRE-001 (profiles baseline migration)
- Phase 0 expanded with entries IN-007 through IN-013 (dismiss rename, getDismissedIds rewrite, lifecycle manager, impression batcher, pg_partman, localStorage clear, deep link confidence tagging)
- Phase 0.5 expanded with entries IN-105 through IN-107 (runtime backfill, static genre mapping, Edge Function split)
- Phase 1 expanded with entries IN-203 through IN-205 (wire format spike, embedding column naming, legacy column drop)
- Phase 3 expanded with entries IN-301 through IN-303 (hook rewrite scope, detail page batch query, quiz subsystem deletion)
- Phase 4.5 expanded with entries IN-455 through IN-457 (Python execution environment, psycopg2, HDBSCAN fallback)
- Cross-phase section expanded with IN-XPS-002 and IN-XPS-003
- Phase 6.5 section removed entirely (cleanup distributed to the phases where it happens)
- Entry IN-651 redistributed to the phases that do the cleanup

---

## Pre-Phase 0

Entries that must be resolved before Phase 0 branch work begins. See Project Orchestration v0.3 Section 12 for the full action item list.

### IN-PRE-001: Profiles baseline migration (011)

**Source:** Strategy review round 2 (CC finding C2); Joe's Supabase dashboard queries that confirmed the production schema.

**Detail:** The `profiles` table exists in production but is not defined in any version-controlled migration. It was created manually via the Supabase dashboard. Before any Phase 0 work adds columns to this table, it must be captured in a baseline migration so the schema is reproducible in fresh environments.

The migration is idempotent — applying it against the current production state makes no changes because `CREATE TABLE IF NOT EXISTS` skips the existing table and `DROP POLICY IF EXISTS` + `CREATE POLICY` replaces policies without error. Its purpose is reproducibility, not modification.

**Confirmed schema from Joe's Supabase queries (round 3):**
- Columns: `id` (UUID PK, FK to auth.users ON DELETE CASCADE), `username` (TEXT UNIQUE NOT NULL), `theme_preference` (TEXT DEFAULT 'system'), `onboarding_completed` (BOOLEAN DEFAULT FALSE), `region` (TEXT DEFAULT 'GB'), `is_test_user` (BOOLEAN DEFAULT FALSE), `created_at` TIMESTAMPTZ DEFAULT NOW(), `updated_at` TIMESTAMPTZ DEFAULT NOW()
- RLS enabled (`relrowsecurity: true`)
- Five policies: "Allow public username lookup" (SELECT, public, unrestricted — see IN-XPS-002 for the tightening flag), "Users access own profile" (ALL, `id = auth.uid()`), "Users can insert own profile" (INSERT), "Users can update own profile" (UPDATE), "Users can view own profile" (SELECT)
- Trigger `on_auth_user_created` on `auth.users` INSERT, calls `handle_new_user()` which inserts `(id, username)` from `NEW.id` and `NEW.raw_user_meta_data->>'username'`

**Migration file:** `supabase/migrations/011_profiles_baseline.sql`

**Must include:** `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `DROP POLICY IF EXISTS` + `CREATE POLICY` for each of the five policies, `CREATE OR REPLACE FUNCTION handle_new_user()`, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER on_auth_user_created`.

**Verification after apply:** `\d+ profiles` shows same schema, new signups still create profile rows automatically, RLS policies remain functional, no data changed.

**Status:** ✅ Incorporated (Pre-Phase 0 — migration 011 applied)

---

## Phase 0 — Instrumentation

*(Card impression tracking, session IDs, dwell timer, exit outcome tracking, user_interactions expansion, dismiss → not_interested rename, lifecycle manager)*

### IN-001: Dwell event must capture exit outcome

**Source:** Detail Page Signal Capture Spec v0.3 Section 3.2

**Detail:** The `dwell_event` fired when a user closes the detail page must include an `exit_reason` field in the payload. Values: `deep_link_click`, `added_to_watchlist`, `thumbs_up`, `thumbs_down`, `marked_watched`, `not_interested`, `back_to_previous`, `app_backgrounded`. Dwell time alone is meaningless — the engine interprets it through what the user did when they left.

**Status:** ✅ Incorporated (Phase 0)

### IN-002: Detail view itself is NOT a positive signal

**Source:** Detail Page Signal Capture Spec v0.3 Section 3.1

**Detail:** A `detail_view` event is logged on page open as an anchor for subsequent dwell/outcome events, but it must NOT be weighted as a positive signal in taste vector updates. The signal interpretation happens entirely in the `dwell_event` with `exit_reason`.

**Status:** ✅ Incorporated (Phase 0)

### IN-003: Dwell duration thresholds for negative weighting

**Source:** Detail Page Signal Capture Spec v0.3 Sections 3.2 and 4.2

**Detail:** When `exit_reason == back_to_previous`, the negative weight depends on dwell duration:
- `< 3` seconds: ignored (logged but weight = 0)
- `3–10` seconds: weight = −0.15
- `10–30` seconds: weight = −0.25
- `30+` seconds: weight = −0.35

**Status:** ✅ Incorporated (Phase 0)

### IN-004: Negative dwell session cap

**Source:** Detail Page Signal Capture Spec v0.3 Section 4.3 (Rule 5)

**Detail:** Cumulative negative dwell signal per session must be capped at −1.0 regardless of how many rejections happen. Prevents the engine from learning "user hates everything they browse" during exploratory sessions. Implement as a session-aware accumulator that stops adding negative weight once −1.0 is reached.

**Status:** ✅ Incorporated (Phase 0)

### IN-005: Card impression tracking in dedicated table

**Source:** Strategy review round 2 (CC finding M2); Detail Page Signal Capture Spec v0.3 Section 5.2

**Detail:** Card impressions do NOT live in `user_interactions`. They go in a dedicated `card_impressions` table with typed columns (not JSONB), partitioned monthly via `pg_partman`, with 90-day row retention and daily aggregation to `card_impression_daily_totals` before deletion.

**Schema:**
```
card_impressions (partitioned by month via pg_partman)
├── id (bigint, primary key — auto-increment)
├── user_id (uuid, FK to profiles.id)
├── content_id (integer — holds the TMDb ID, named for consistency with user_interactions)
├── source_surface (text: 'home' | 'for_you' | 'browse' | 'watchlist' | 'search' | 'detail')
├── position (integer — 0-indexed within row)
├── session_id (uuid)
├── shown_at (timestamptz)
```

Indexes: `(user_id, shown_at DESC)`, `(source_surface, shown_at DESC)`, `(session_id)`.

Migration: `014_card_impressions_table.sql`.

**Status:** ✅ Incorporated (Phase 0 — migrations 014/015/016 applied; 015/016 added in-phase to harden partition RLS, see Phase 0 summary §3 and Orchestration v0.3.2 §3.4)

### IN-006: Session ID generation and propagation

**Source:** Detail Page Signal Capture Spec v0.3 Section 5.1

**Detail:** Each app session gets a unique session_id (UUID, generated on app foreground after >5 minutes of background time). All interactions during that session are tagged with the session_id. Used for session-based metrics and the negative dwell session cap.

**New module:** `src/lib/instrumentation/sessionId.ts`. Subscribes to the lifecycle manager (IN-009) for foreground/background transitions. Exposes `getCurrentSessionId()` which lazily generates a new UUID if none exists or if the previous session expired.

**Status:** ✅ Incorporated (Phase 0)

### IN-007: Rename `dismiss` to `not_interested`

**Source:** Strategy review round 2 (CC finding m2); Detail Page Signal Capture Spec v0.3 Section 2.7

**Detail:** The v1 codebase has two separate dismissal systems. Phase 0 handles both:

1. **Unused `dismiss` event type** in `src/lib/storage/interactions.ts:24` (`event_type` union). Rename to `not_interested`.
2. **Active localStorage `@app_dismissed_recommendations` list** managed by functions in `src/lib/storage/recommendations.ts`. This is replaced by the `getDismissedIds()` rewrite — see IN-008.

**Migration 013 (`013_user_interactions_v2_expansion.sql`):**
- Add `session_id` column (uuid, nullable) to `user_interactions`
- Add `source_surface` column (text, nullable) to `user_interactions` as a top-level field
- Update `event_type` enum or CHECK constraint: rename `dismiss` → `not_interested`. Zero rows expected in production, but handle gracefully.
- Existing rows have `source_surface = NULL` and `session_id = NULL` by design. No JSONB-to-column backfill is performed. Add a SQL comment in the migration explaining this decision.

**Code changes in `src/lib/storage/interactions.ts`:**
- Around line 24-31 (the `InteractionEvent` type or `event_type` union) — change `'dismiss'` to `'not_interested'` in the union. Also add `source_surface?: string | null` as an optional field on `InteractionEvent` for use by the new top-level column.
- Around line 47-55 (the Supabase insert) — include `source_surface` in the inserted row, defaulting to `null` if the caller didn't specify it.
- Update `emitDetailView()` (lines 99-111) — currently passes `source` inside `metadata`. Migrate this to populate the top-level `source_surface` field instead. The `metadata` field stops carrying `source` going forward.
- Other emitters (`emitContentInteraction`, `emitQuizAnswer`, `emitQuizCompleted`, `emitSearch`) do not need to pass `source_surface` — they default to `null`. This is correct: actions taken on the detail page have implicit source context.
- Add new emitter `markNotInterested(contentId, mediaType)` that writes a `not_interested` event and calls `invalidateDismissedIdsCache()` (exposed by IN-008). Pass `source_surface: 'detail'` since the "Not Interested" button only exists on the detail page.

**Status:** ✅ Incorporated (Phase 0)

### IN-008: `getDismissedIds()` rewrite — transitional gap fix

**Source:** Strategy review round 3 (Joe's Q4 pushback on Option b); CC validation of rewrite feasibility

**Detail:** This is the most important single code change in Phase 0. Without it, dropping the localStorage dismissal list leaves the v1 recommendation engine (still running through Phases 1-3) without its dismissal filter, causing it to surface already-dismissed titles for the entire build duration.

**The rewrite:**

Replace the body of `getDismissedIds()` in `src/lib/storage/recommendations.ts`. Current implementation reads from localStorage with TTL expiry. New implementation queries Supabase:

```typescript
// Pseudocode
let sessionCache: Set<string> | null = null;

export async function getDismissedIds(): Promise<Set<string>> {
  if (sessionCache) return sessionCache;
  const userId = getCurrentUserId();
  const { data } = await supabase
    .from('user_interactions')
    .select('content_id, media_type')
    .eq('user_id', userId)
    .eq('event_type', 'not_interested');
  sessionCache = new Set(data.map(r => `${r.media_type}-${r.content_id}`));
  return sessionCache;
}

export function invalidateDismissedIdsCache(): void {
  sessionCache = null;
}
```

**Critical implementation details confirmed by CC round 3:**

1. **Signature preserved.** Returns `Promise<Set<string>>` with keys in `{media_type}-{content_id}` format (e.g., `"movie-12345"`, where 12345 is the TMDb ID stored in the `content_id` column). The v1 engine at `recommendationEngine.ts:628` already awaits this call and filters candidates against the Set; no changes needed there.

2. **Session cache in module-level variable.** Invalidated when a new `not_interested` event is fired via `markNotInterested()` from IN-007.

3. **Parallelisation.** The existing call site at `recommendationEngine.ts:628` can be wrapped in `Promise.all()` with the TMDb discover fetches to avoid adding serial latency.

4. **Fail-safe.** On Supabase error, return empty Set rather than throwing. Empty Set = nothing filtered = degraded (might see a previously-dismissed title) but not broken.

5. **Delete legacy functions.** `dismissRecommendation()`, `isDismissed()`, `cleanExpiredDismissals()`, `getDismissedRecommendations()` in `recommendations.ts` all deleted. Also remove the `cleanExpiredDismissals()` call at `recommendationEngine.ts:557`.

**Callers (CC round 3 verified):**
- `recommendationEngine.ts:628` — primary consumer, already async-aware, no external changes needed
- `recommendationEngine.ts:557` — remove this call entirely
- No other callers in `src/`

**Status:** ✅ Incorporated (Phase 0)

### IN-009: Lifecycle manager module

**Source:** Detail Page Signal Capture Spec v0.3 Section 3.2; Strategy review round 3 (tab change flush triggers)

**Detail:** New module at `src/lib/lifecycle/appState.ts`. Centralises Capacitor's `App.addListener('appStateChange')` handling so the dwell timer and impression batcher subscribe to a single source rather than registering competing listeners.

**API:**
```typescript
type Listener = (isActive: boolean, expected: boolean) => void;
export function subscribe(listener: Listener): () => void;
export function isForeground(): boolean;
export function markDeepLinkExpected(): void;
export function flushImpressions(): void;
```

**Behaviour:**
- On module load, registers a single `App.addListener('appStateChange', handler)` with `@capacitor/app`
- Internal state tracks foreground/background
- Subscribers called on state change with `{ isActive, expected }`
- `markDeepLinkExpected()` starts a 3-second window; background events during this window fire with `expected: true`; after the window, `expected: false`
- `flushImpressions()` is called by the impression batcher (IN-010) at lifecycle boundaries
- Graceful fallback for web preview: use `document.visibilitychange` if Capacitor unavailable

**Why centralise:** avoids race conditions between multiple Capacitor listeners firing in non-deterministic order.

**Status:** ✅ Incorporated (Phase 0)

### IN-010: Impression batcher module

**Source:** Detail Page Signal Capture Spec v0.3 Section 5.2; Strategy review round 3 (Joe's flush trigger additions)

**Detail:** New module at `src/lib/instrumentation/impressionBatcher.ts`. Accumulates impression events in memory and flushes to Supabase as batched inserts.

**API:**
```typescript
interface ImpressionEvent {
  user_id: string;
  content_id: number;
  source_surface: 'home' | 'for_you' | 'browse' | 'watchlist' | 'search' | 'detail';
  position: number;
  session_id: string;
  shown_at: Date;
}
export function recordImpression(event: ImpressionEvent): void;
export function flushNow(): Promise<void>;
```

**Flush triggers:**
1. **Interval timer:** every 10 seconds
2. **Buffer size:** flush on reaching 100 events
3. **App lifecycle:** on background, on foreground (via lifecycle manager IN-009)
4. **Bottom nav tab change:** hook into `handleTabChange` at `src/App.tsx:226-233`, add `flushImpressions()` call before `setActiveTab(tab)`
5. **Detail page entry:** hook into `handleItemSelect` at `src/App.tsx:204-209`, add flush at the start before navigation
6. **Component unmount on app close:** fire-and-forget

**Failure handling:** one retry on network failure, then drop batch. Impressions are not critical data.

**Performance requirement:** `recordImpression()` must be cheap (synchronous array append). Called from every card render on every surface.

**Status:** ✅ Incorporated (Phase 0)

### IN-011: pg_partman setup for card_impressions

**Source:** Strategy review round 2 (CC finding M2 validation)

**Detail:** Migration 014 enables the `pg_partman` extension (available on Supabase Pro) and configures monthly automatic partition creation for `card_impressions`. Without pg_partman, monthly partitions would need manual DDL — fragile and easy to forget.

**Migration steps:**
1. `CREATE EXTENSION IF NOT EXISTS pg_partman;`
2. Call `partman.create_parent()` on `public.card_impressions` with `p_control => 'shown_at'`, `p_type => 'range'`, `p_interval => '1 month'`, `p_premake => 2` (create 2 months ahead)
3. Update `partman.part_config` with `retention = '3 months'`, `retention_keep_table = false`, `retention_keep_index = false`
4. Schedule daily maintenance via `pg_cron`: `SELECT cron.schedule('pg_partman_maintenance', '0 2 * * *', $$ CALL partman.run_maintenance_proc() $$);`

**Also create `card_impression_daily_totals` aggregation table** in the same migration, schema: `(date, user_id, source_surface, content_id, impression_count)`. Schedule a daily pg_cron job that aggregates impressions older than 90 days into this table BEFORE the retention-based deletion runs.

**Status:** ✅ Incorporated (Phase 0 — migration 014; partition RLS hardened by 015/016)

### IN-012: localStorage v1 clear on first v2 launch

**Source:** Strategy review round 2 (CC finding N1)

**Detail:** The two prototype users' devices still have v1 localStorage entries that could be read by v2 code and cause stale data issues. On app start, check `@videx_version` flag:

- If not set or not `'2'`:
  - Iterate all localStorage keys
  - Delete matching v1 patterns: `@taste_profile`, `@app_recommendations`, `@app_dismissed_recommendations`, `@app_hidden_gems`, `tmdb_*`, `sa_*`, `omdb_*`
  - Set `@videx_version = '2'`

Runs once per device on first v2 launch. Implement in main entry point (`src/main.tsx` or equivalent).

**Note:** full list of v1 keys to purge should be confirmed during Phase 0 implementation by searching the v1 code for `localStorage.setItem` calls.

**Status:** ✅ Incorporated (Phase 0)

### IN-013: Deep link click confidence tagging

**Source:** Detail Page Signal Capture Spec v0.3 Section 2.6; Strategy review round 2 (CC finding M1 edge cases)

**Detail:** When the detail page "Watch on [Service]" button is tapped, the `AppLauncher.openUrl()` call in `src/lib/api/openDeepLink.ts` needs to tag the resulting `deep_link_click` event with confidence level.

**Two paths:**

1. **High confidence** (`confidence: 'high'`): primary `AppLauncher.openUrl()` call succeeds. Weight: +0.8
2. **Low confidence** (`confidence: 'low'`): primary call throws (app not installed, no intent handler) and falls back to browser URL. Weight: +0.4

The try/catch at `openDeepLink.ts:28-45` already differentiates these paths. Phase 0 work:

- In the success branch: fire `deep_link_click` with `confidence: 'high'`, then call `lifecycle.markDeepLinkExpected()` (IN-009) to suppress the following background event as "expected"
- In the catch branch: fire `deep_link_click` with `confidence: 'low'`, also call `markDeepLinkExpected()` (browser opening also causes backgrounding)

**Payload fields:** `service_id`, `deep_link_url`, `dwell_seconds_before_click`, `confidence`.

**Status:** ✅ Incorporated (Phase 0)

---

## Phase 0.5 — First-party content enrichment

*(Schema migration to add keywords, cast_top_5, director, content_rating, runtime to titles table; TMDb backfill; Edge Function split)*

### IN-101: Validate row counts after backfill, not just schema

**Source:** Conversation thread during embedding eval debugging; CC round 2 extension to title_genres

**Detail:** The Phase 0.5 migration acceptance criteria must include row-count validation, not just "the table exists with the right columns." After the backfill runs, query each new column and verify at least 80% of titles have non-null values:

```sql
SELECT COUNT(*) FROM titles WHERE keywords IS NOT NULL;
SELECT COUNT(*) FROM titles WHERE cast_top_5 IS NOT NULL;
SELECT COUNT(*) FROM titles WHERE director IS NOT NULL;
SELECT COUNT(*) FROM titles WHERE content_rating IS NOT NULL;
SELECT COUNT(*) FROM titles WHERE runtime IS NOT NULL;
```

The empty `title_credits` table in v1 (correct schema, zero rows) is the cautionary tale. `title_genres` has the same problem. Schema existence ≠ data existence.

**Status:** ✅ Incorporated (Phase 0.5 — the row-count verification was a hard acceptance gate; four of five fields cleared the 80% floor, `content_rating` came in at 65.4% within the brief's documented 60% tolerance, and `director` came in at 77.2% overall — accepted as a structural TV catalogue gap, see Phase 0.5 summary §3 Deviation 3 and IN-PX-07 below for the split-by-media_type policy change)

### IN-102: Investigate existing title_credits sync scripts before rewriting

**Source:** Conversation thread; Detail Page Signal Capture Spec

**Detail:** The `title_credits` table already exists in Supabase with sync scripts in the codebase, but the table is empty in production. Before writing new sync code for Phase 0.5, investigate why the existing scripts aren't running: never run, ran and failed silently, or deliberately disabled. Understanding which determines whether to revive existing sync code or rewrite from scratch.

**Status:** ✅ Incorporated (Phase 0.5 — investigation confirmed `title_credits` and `title_genres` are both empty in production with no current writers. Phase 0.5 wrote the new enrichment data (cast_top_5, director) as denormalised `TEXT[]` / `TEXT` columns on `titles` directly rather than reviving `title_credits`. The legacy `title_credits` and `title_genres` tables stay empty; future phases can drop them safely.)

### IN-103: Use existing TMDb append_to_response pattern for backfill

**Source:** CC conversation about cast data flow

**Detail:** The Videx app already uses TMDb's `append_to_response: 'credits,...'` pattern in `tmdb.ts` (line numbers approximate — confirm during Phase 0.5 implementation) for fetching credits on the detail page. The Phase 0.5 backfill should use the same pattern to ensure consistency between live fetches and persistent data.

**Note from CC round 2:** the specific line references from earlier conversations (`tmdb.ts:130`, `tmdb.ts:138`) may be stale. CC should verify current line numbers when writing the backfill script.

**Status:** ✅ Incorporated (Phase 0.5 — the backfill uses `append_to_response=keywords,credits,release_dates` for movies and `append_to_response=keywords,credits,content_ratings` for TV via `scripts/enrichment/tmdb-enrichment-client.ts`. Note: the existing `src/lib/api/tmdb.ts` client was NOT reused — it's browser-targeted axios-based code with a different `append_to_response` set at lines 127–141. The backfill uses raw `fetch` matching the `scripts/sync-content.ts` pattern instead, which is the established convention for Node-side scripts.)

### IN-104: Embedding input template must match eval template exactly

**Source:** Embedding evaluation report (Run 2)

**Detail:** When Phase 1 generates production embeddings, the input text template must exactly match the one used in the OpenAI text-embedding-3-small eval:

```
{title} ({release_year}) - {media_type}
Genres: {genres}
Overview: {overview}
Keywords: {keywords}
Cast: {cast}
Runtime: {runtime} minutes
```

Omit empty lines (no "Keywords: " with nothing after). Runtime line is omitted if null. Trim to ~2000 characters maximum. This template is the source of truth for production embeddings.

**Note:** runtime line was added in v0.3 (see IN-105). The original eval did not include runtime, so an incremental validation sweep may be worthwhile to confirm runtime addition doesn't regress embedding quality.

**Status:** ⚠️ Partially informed by Phase 0.5 — the enrichment columns the template reads are now populated (keywords 100%, cast_top_5 100%, runtime 81.4%). However, IN-104 is a Phase 1 task (the template itself is implemented during embedding generation), so the status stays partially pending. Phase 0.5's summary §8.3 documents the current fill rates so Phase 1's embedding generator can assume the columns exist. **One Phase 0.5 finding that affects IN-104: `director` is 99.7% populated for movies but only 54.9% for TV — the template's "omit empty lines" rule handles this, but Phase 1's embedding eval should not penalise TV rows for missing director lines (see IN-PX-06 and IN-PX-07 below).**

### IN-105: Runtime backfill added to Phase 0.5 enrichment scope

**Source:** Strategy review round 2 (CC finding m1); Recommendation Engine Strategy v1.6 Section 4.1

**Detail:** Currently `runtime` is NULL for all synced titles because `sync-content.ts:220` sets it to null (the TMDb discover endpoint doesn't include runtime). The pacing meta-dimension computation in v1 uses runtime for modulation, and v2 embeddings benefit from including runtime as a content characteristic.

**Phase 0.5 adds runtime backfill:**
- For movies: fetch `runtime` field from `/movie/{id}` detail endpoint (integer, minutes). Near-100% coverage expected.
- For TV: fetch `episode_run_time[0]` from `/tv/{id}` detail endpoint if available. TMDb has increasingly deprecated multi-value `episode_run_time` in favour of per-episode runtime on `/tv/{id}/season/{n}/episode/{n}`, so `episode_run_time` may be empty for newer shows. If empty, omit runtime from the embedding template rather than substituting a default.

**Embedding template update:** add `Runtime: {runtime} minutes` line to the template in IN-104. Omit the line entirely if runtime is null.

**Status:** ✅ Incorporated (Phase 0.5 — runtime went from 0/20000 populated pre-phase to 16,288/20000 = 81.4% populated post-backfill, clearing the 80% floor. `extractRuntime` reads `runtime` for movies and `episode_run_time[0]` for TV. **In-phase fix:** `runtime: 0` was initially preserved as a literal 0 for movies, then caught during the C4 smoke test — TMDb returns `0` as a placeholder for "no value". Fix: treat `runtime <= 0` as NULL on the movie path (matching the TV path's existing `n > 0` filter). See Phase 0.5 summary §3 Deviation 2.)

### IN-106: title_genres via static TMDb genre mapping

**Source:** Strategy review round 2 (CC finding C3); Recommendation Engine Strategy v1.6 Section 4.0

**Detail:** The `title_genres` table exists in `001_content_tables.sql` with correct schema but is empty in production — no sync script populates it. Rather than backfilling, v2 resolves genre IDs to names at embedding time using the existing `GENRE_NAMES` constant in `src/lib/constants/genres.ts`.

**Implementation:**
- Embedding generation reads `titles.genre_ids` (integer array, already populated)
- Resolves each ID against `GENRE_NAMES` to produce human-readable genre strings
- Joins with `, ` for the embedding template's `Genres: {genres}` line
- `title_genres` table can be dropped in Phase 0.5 or left empty indefinitely (CC round 2 confirmed no v1 code reads from it)

**No backfill needed for title_genres.** This is an explicit decision, not an oversight.

**Rationale:** TMDb genre list is small (~20 entries for movies, ~16 for TV) and changes roughly once every few years. Static mapping is simpler, faster, and avoids another Phase 0.5 data dependency.

**Status:** ✅ Incorporated (Phase 0.5 — confirmed `title_genres` is empty in production; no backfill performed. Migration 017 did NOT drop the table (Phase 0.5's scope is additive only). Future phases can drop `title_genres` safely when convenient. `GENRE_NAMES` in `src/lib/constants/genres.ts` remains the source of truth for genre ID → name resolution and Phase 1's embedding template will use it directly.)

### IN-107: Phase 0.5 sync split — backfill script + enrichment Edge Function

**Source:** Strategy review round 2 (CC finding M6); Recommendation Engine Strategy v1.6 Section 7.2

**Detail:** The existing `sync-incremental/index.ts` Edge Function has a 120s budget check (2-minute wall-clock guard before the 150s Edge Function timeout). Adding TMDb `/keywords`, `/credits`, and `/release_dates` calls per title would add ~780ms per new title and could push past the timeout on busy days (50+ new titles).

**Split approach:**

**Part 1 — One-time backfill script** (`scripts/enrichment/backfill_metadata.ts`):
- Runs from Joe's laptop, not from an Edge Function
- Processes the ~20K existing titles
- Uses TMDb's `append_to_response=credits,keywords,release_dates` pattern
- Respects TMDb's 260ms rate limit
- Expected total runtime: several hours
- Must support resume-from-last-completed (write progress to a file or checkpoint table so an interrupted run can resume)

**Part 2 — Ongoing enrichment Edge Function** (`supabase/functions/enrich-new-titles/index.ts`):
- Runs on its own schedule via pg_cron, after the main daily sync
- Query: `SELECT tmdb_id FROM titles WHERE keywords IS NULL LIMIT 100`
- Fetches enrichment data for each, writes back
- No job marker or queue table needed — the `WHERE keywords IS NULL` query IS the work queue
- Exits when no more work or at 120s budget

**Main sync function (`sync-incremental`) stays unchanged in scope.** The enrichment function runs separately.

**Status:** ✅ Incorporated (Phase 0.5 — split executed exactly as planned. Backfill lives at `scripts/enrichment/backfill-enrichment.ts` + `tmdb-enrichment-client.ts`. Edge Function lives at `supabase/functions/enrich-new-titles/index.ts` with shared logic at `supabase/functions/_shared/extract_fields.ts` imported by both. Cron schedule at `supabase/cron/enrich_new_titles.sql` fires daily at 06:30 UTC, 30 min after `daily-content-sync`. **Note:** the cron SQL lives in the new `supabase/cron/` directory per Orchestration v0.3.2 §3.4, NOT as a migration — this establishes the convention for future operational automation.)

### IN-PX-06: Phase 1+ may want to widen TV director extraction to `credits.crew[]` "Series Director"

**Source:** Phase 0.5 closeout analysis (director coverage miss — 77.2% overall, 99.7% movies, 54.9% TV)

**Detail:** Phase 0.5 accepted TV director coverage at 54.9% as a structural TMDb catalogue gap rather than a fixable defect. The `extractDirector` TV path reads only from the top-level `created_by[]` field, which is TMDb's "showrunner/creator" concept and is structurally empty for documentaries, reality shows, anthology series, and old/foreign titles. Spot-check of 10 random NULL-director TV rows returned exactly these categories — every single one.

**Potential follow-up**: Widen the TV extractor to additionally include `credits.crew[]` entries where `job === 'Series Director'` (the narrowest widening — excludes the pollution-prone "Executive Producer"). Expected lift: 2–5 percentage points of TV coverage, mostly for docuseries. Would not clear a hypothetical 80% floor by itself (the gap is ~25 points) but would be cheap and useful.

**When to do this**: Only if Phase 1's embedding eval or Phase 3's engine evaluation indicates a director signal matters for TV recommendation quality. If the embeddings cluster TV shows well without a director signal (which is the expected outcome for documentaries — they embed on genre + overview + keywords), this follow-up is unnecessary. **Revisit during Phase 1 embedding eval.**

**Reference:** Phase 0.5 summary §3 Deviation 3, `supabase/functions/_shared/extract_fields.ts:extractDirector`.

**Status:** ⏳ Deferred — Phase 1 cluster eval (`7160046`) shows BBC Period Dramas (TV) cohort passes at 0.53 within-cohort cosine similarity, comparable to movie cohort average of 0.57. TV titles cluster well without director in the embedding template. Director is intentionally excluded from the locked §4.1 template, so widening extraction has no effect on current embeddings. Deferred: only revisit if a future template revision adds director.

### IN-PX-07: Director row-count gate should split by media_type going forward

**Source:** Phase 0.5 closeout analysis (director coverage miss)

**Detail:** The Phase 0.5 brief's §6.2 specified a single `director_pct ≥ 80%` gate across all titles. Phase 0.5 empirically confirmed that this is the wrong shape — movies and TV have very different structural director-data availability in TMDb, and a single aggregate gate masks the movie path's near-perfect 99.7% behind the TV path's structural 54.9%.

**Proposal**: Future phases that reference director coverage gates should split by media_type:

- `director_pct` for `media_type='movie'` must be ≥ 95%
- `director_pct` for `media_type='tv'` is best-effort; no hard floor

**Current production numbers under the proposed gate**:
- Movies: 9,965 / 9,998 = 99.7% ✅ (clears the proposed 95% movie floor comfortably)
- TV: 5,483 / 9,995 = 54.9% (no gate, accepted)

**Action**: Any future phase brief that references director coverage criteria should use the split form. Phase 1 embedding eval should confirm whether missing director on TV shows hurts embedding quality — if yes, revisit IN-PX-06. If no, lock the split-gate policy and move on.

**Status:** ⏳ Not yet incorporated — policy change, no code impact

---

## Phase 1 — Content embeddings

*(Embed full content cache, build pgvector index, validate clusters)*

### IN-201: Use OpenAI text-embedding-3-small

**Source:** Embedding evaluation report (Run 2)

**Detail:** Decision locked. Model: `text-embedding-3-small`. 1536 dimensions. Validated head-to-head against Voyage 3.5-lite on 510-title sample with cast and keywords enriched. OpenAI won on genre separation (~1.8x) and service discrimination (~2.1x).

**Status:** ✅ Incorporated (Phase 1 — `7697ad8` embeddingTemplate.ts, `43bca73` openaiEmbeddings.ts, `d4fcff3` backfill script, `e8c6d8f` bulk backfill completed 19,993 titles at ~$0.047)

### IN-202: pgvector with HNSW indexing

**Source:** Recommendation Engine Strategy v1.6 Section 5.2

**Detail:** Use Supabase's pgvector extension. HNSW index for approximate nearest neighbour search. Capacity at 20K titles × 1536-dim × 4 bytes ≈ 117MB for vectors + ~350MB for HNSW index. Well within Supabase Pro's 8GB database limit.

**Index build:** run after bulk embedding insert, not concurrently. Run from a migration script or from Joe's laptop, not from an Edge Function (Edge Function 150s timeout won't complete an HNSW build at this scale; dedicated compute completes in minutes).

**Status:** ✅ Incorporated (Phase 1 — `e43bf1b` migration 018 pgvector + embedding column, `e8c6d8f` HNSW index built post-backfill, 156 MB, indisvalid=true)

### IN-203: pgvector wire format spike (Phase 1 prerequisite for Phase 3)

**Source:** Strategy review round 3 (Joe's Q1 pushback); CC round 3 validation confirming the spike is necessary

**Detail:** The Supabase JS client (currently `@supabase/supabase-js@^2.97.0`) uses PostgREST under the hood, which may return pgvector columns as PostgREST-serialized strings (`"[0.1,0.2,0.3,...]"`) rather than native JSON arrays. Whether the client auto-parses this depends on PostgREST and pgvector extension versions, which cannot be determined from the client package alone. CC confirmed in round 3 that a runtime spike is the only reliable way to know.

**The spike (Phase 1 task):**
1. Insert a small number (~10) of test embeddings into the `titles.embedding` column
2. Query via the Supabase JS client: `await supabase.from('titles').select('tmdb_id, embedding').in('tmdb_id', [...])`
3. Inspect the returned `embedding` field — is it a `number[]`, a string `"[...]"`, or something else?

**Outcomes and locked patterns:**
- **If returned as `number[]`:** no workaround needed, Phase 3 uses direct client access
- **If returned as string:** produce a workaround, one of:
  - Supabase RPC function `get_embedding_by_id(tmdb_ids bigint[])` that casts to `float4[]` server-side
  - A view `v_titles_with_embeddings` with `embedding::float4[]`
  - Client-side parser: `JSON.parse(embeddingString)` after stripping brackets
- Whichever pattern works becomes the locked approach for Phase 3's `useContentDetail.ts` rewrite (IN-302)

**This is a 30-minute task in Phase 1 that de-risks Phase 3.** Do not skip.

**Status:** ✅ Incorporated (Phase 1 — `047aae1` wire format spike. Result: PostgREST returns strings, locked pattern is `JSON.parse(row.embedding)`. Report at `docs/v2/phase-1-wire-format-spike.md`)

### IN-204: Embedding column naming — use `embedding`, not `content_vector`

**Source:** Strategy review round 2 (CC finding N2)

**Detail:** The v1 `content_vector` column has a CHECK constraint (`chk_content_vector_dim`, `008_content_vectors.sql:9-10`) enforcing `array_length(content_vector, 1) = 24`. If Phase 1 tried to reuse the column name for a `vector(1536)` column, the ALTER would fail because the constraint name already exists.

**Use a different column name.** `embedding` is the conventional name (pgvector's own documentation uses it). Migration 018 adds `embedding vector(1536)` as a new column, leaves `content_vector` in place. Migration 019 (end of Phase 1) drops `content_vector` and its constraint.

**Status:** ✅ Incorporated (Phase 1 — `e43bf1b` migration 018 uses `embedding` column name)

### IN-205: Drop legacy content_vector column at end of Phase 1

**Source:** Strategy review round 2 (CC finding M5); Recommendation Engine Strategy v1.6 Section 7.2

**Detail:** Migration 019 (end of Phase 1) drops the legacy 24D `content_vector` column and its `chk_content_vector_dim` constraint from the `titles` table. Also update the sync scripts (`sync-content.ts`, `sync-incremental/index.ts`) in Phase 1 to stop computing and writing 24D vectors — embeddings are now handled by the `embed-new-titles` cron instead.

**Why at end of Phase 1, not Phase 3:** with the v1-archival reframe, there's no parallel v1 engine reading from `content_vector`. Once Phase 1 ships embeddings, the 24D column is dead weight. Drop it.

**Status:** ✅ Incorporated (Phase 1 — `cf5dc96` sync script rewrites, `a3282de` migration 019 + deletion of server-side computeContentVector.ts. Client-side v1 taste code remains until Phase 3.)

---

## Phase 2.5 — TMDb watch/providers backfill for SA API service gaps

*(Fill streaming_availability gaps for BBC iPlayer, NOW TV, and Sky Go using TMDb discover data, so all 10 UK services have fingerprints before Phase 3 cold-start wiring)*

### IN-250: TMDb discover backfill for BBC iPlayer, NOW TV, Sky Go

**Source:** Phase 2 build-service-fingerprints dry-run (2026-04-12). BBC iPlayer has 0 rows in streaming_availability (SA API catalogue empty despite listing the service — GitHub issue filed, no response). NOW TV has 591 rows but all classified as `addon` stream_type (0 subscription/free). Sky Go is not in the SA API at all. All three are detected by TMDb watch/providers on the client side but have no server-side catalogue mapping for fingerprint construction.

**Impact:** Without this, BBC/NOW/Sky Go contribute zero to Phase 3's onboarding cold-start taste vector blend. BBC iPlayer is likely top 3 most-selected UK services — a silent degradation of Pillar 3 for a large user segment.

**Detail:**
1. Write a backfill script (`scripts/fingerprints/backfill-tmdb-providers.ts`) that queries TMDb `/discover/movie` and `/discover/tv` with `with_watch_providers={id}&watch_region=GB` for each missing service (BBC=38, NOW=39, Sky Go=29).
2. Insert rows into `streaming_availability` with `service_id`, `stream_type='free'` (BBC/Sky Go) or `'subscription'` (NOW), and `deep_link_url` set to the search fallback URL from `deepLinks.ts` (e.g., `https://www.bbc.co.uk/iplayer/search?q={title}`).
3. BBC iPlayer deep links: structured format `https://www.bbc.co.uk/iplayer/episode/{pid}` exists but `pid` is BBC's internal ID, not derivable from TMDb. Search fallback (`/iplayer/search?q=`) is the correct approach. If SA API ticket resolves and provides real deep links, those will overwrite via the existing sync pipeline.
4. After backfill, re-run `npm run build:fingerprints` to generate fingerprints for the newly populated services. No fingerprint code changes needed.
5. Add an Edge Function or cron extension to keep TMDb-sourced availability rows refreshed (TMDb discover data changes weekly).

**Scope:** Backend only. No UI changes, no hook rewrites, no schema changes. Same profile as Phase 2.

**Prerequisite for Phase 3:** Phase 3's onboarding cold-start (IN-301, OnboardingFlow.tsx) blends fingerprints from selected services. If BBC/NOW/Sky Go have no fingerprints, the blend is incomplete and the cold-start quality is degraded for users of those services.

**Status:** ✅ Done (Phase 2.5, 2026-04-12). 600 titles backfilled (200 per service), 13 service fingerprints built. See `docs/v2/phase-summaries/phase-2.5-summary.md`.

---

## Phase 2.6 — Fingerprint Signal Refinement

*(Evaluate whether exclusivity-weighted centroids produce sharper discrimination than popularity-ranked arithmetic means)*

### IN-260: Exclusivity-weighted fingerprint A/B evaluation

**Source:** Phase 2 discrimination eval — high pairwise cosine between mainstream services raised the question of whether alternative weighting could improve discrimination.

**Detail:** Built v2_exclusivity centroids (weight_i = 1/N_services, titles exclusive to fewer services weighted more). Evaluated via bottom-half variance gate: v2 must improve variance for >= 8 of 13 services.

**Result:** FAIL (5/13). v2 improved niche services (apple, bbc, mubi, plutotv, skygo) but degraded 8 mainstream services. Mean delta -0.000014 (noise). Exclusivity weighting trades discrimination between service types — not a universal improvement.

**Decision:** Ship v1_popularity. See `docs/v2/phase-2-6-decision.md`.

**Status:** ✅ Done (Phase 2.6, 2026-04-13). Exclusivity weighting discharged as a tuning option. Do not re-propose without new information.

### IN-261: Curation-based fingerprint refinement

**Source:** Phase 2.6 finding — exclusivity weighting doesn't help mainstream services because their "exclusive" titles at the top-150 boundary are arbitrary, not distinctive.

**Detail:** An alternative approach: curated originals lists per mainstream service (e.g., Netflix Originals, Disney+ Originals) to boost titles that genuinely represent a service's editorial character.

**Status:** ⏳ Parked. Revisit only if Phase 3 cold-start testing shows mainstream-service users get weak recommendations.

---

## Phase 3 — User taste vector v2 and hook-level rewrites

*(Re-express user taste in embedding space, rewrite hooks that currently use the v1 taste system)*

### IN-301: Hook-level rewrite scope

**Source:** Strategy review round 2 (CC frontend coupling assessment); Recommendation Engine Strategy v1.6 Section 7.2

**Detail:** The v1 taste system is threaded through the hook layer more deeply than "replace the recommendation engine" implies. Phase 3 must rewrite the internals of the following files while preserving their external interfaces (what they return to UI components):

**Files requiring significant internal rewrites:**
- **`src/hooks/useHomeContent.ts`** — currently loads 24D TasteProfile and passes to every section for scoring. Rewrite to call v2 recommendation hooks (which internally use the ranking pipeline). Hook structure (sections, dedup, caching) is reusable; scoring internals are replaced.
- **`src/hooks/useContentDetail.ts`** — currently computes 24D vectors inline at lines 114-190 for "More Like This." Full rewrite using the batch Supabase query approach — see IN-302. Depends on Phase 1 wire format spike outcome.
- **`src/hooks/useSectionData.ts`** — currently uses `reorderWithinWindows` and `hybridScore` from `genreBlending.ts`. These functions are deleted in this phase. Replace with v2 equivalents or delegate scoring to a central ranking function.
- **`src/hooks/useUserPreferences.ts`** — manages taste vector lifecycle through onboarding and cluster changes. Rewrite for v2 taste vector shape (1536D in embedding space) and new bootstrapping (service fingerprints + watched-grid selections + genre preferences).

**Files requiring trivial rewrites (thin wrappers):**
- **`src/hooks/useRecommendations.ts`** — thin wrapper around v1 `generateRecommendations`. Point at v2 engine instead.
- **`src/hooks/useHiddenGems.ts`** — thin wrapper around v1 `generateHiddenGems`. Same treatment.

**Components requiring UI + wiring changes:**
- **`src/components/OnboardingFlow.tsx`** — replaces the v1 3-step + quiz flow with the v2 5-step flow. Design is complete; Phase 3 wires it to the new taste vector and service fingerprint logic.
- **`src/components/ProfilePage.tsx`** — taste profile display and "Retake quiz" action removed. Replaced with the new Profile restructure design (7 action rows including "Tune Your Recommendations" sub-page).
- **`src/components/LazyGenreSection.tsx`** — currently passes taste vector through to `useSectionData`. Updates to match the new `useSectionData` interface.

**Total: 9 files with internal rewrites.** External interfaces (what hooks return, what components render) mostly stay the same. UI components that consume these hooks don't need changes — they see the same data shapes, just computed differently.

**This is a scope clarification, not a scope expansion.** The work was always going to happen. CC's round 2 review correctly identified that it lives across 9 files, not in one place.

**Status:** ✅ Incorporated — Phase 3 (all 9 files + useTasteProfile rewritten, commits `0d212cc` through `f455d6b`)

### IN-302: Detail page "More Like This" batch query pattern

**Source:** Strategy review round 2 (CC finding N3); Recommendation Engine Strategy v1.6 Section 5.2; CC round 3 validation of the approach

**Detail:** `useContentDetail.ts:114-190` currently computes 24D content vectors in the browser for every similar/recommended title. With 1536D embeddings, client-side vector computation is impossible (embeddings come from an API call not made client-side).

**v2 approach:**
1. Detail page loads, hook fetches candidate similar titles from TMDb's similar/recommended endpoints (unchanged from v1)
2. Hook issues a single Supabase batch query: `SELECT tmdb_id, embedding FROM titles WHERE tmdb_id = ANY($1)` (pattern depends on Phase 1 wire format spike outcome, IN-203)
3. 20-40 candidates × 1536-dim × 4 bytes ≈ 246KB returned. Trivial over modern connections.
4. Client-side cosine similarity against user's taste vector (also loaded client-side)
5. Sort, take top N, return

**One extra Supabase roundtrip per detail page view.** Acceptable — detail pages are not high-frequency.

**Depends on IN-203 spike outcome.** If pgvector wire format requires an RPC or view, this batch query uses that pattern instead of direct SELECT.

**Status:** ✅ Incorporated — Phase 3 (commit `29e99ae`, useContentDetail.ts rewritten with batch query pattern)

### IN-303: Quiz subsystem deletion and interaction_log drop

**Source:** Recommendation Engine Strategy v1.6 Section 7.2; Project Orchestration v0.3 Section 3.4 migration 020

**Detail:** Phase 3 is where the v1 taste system gets deleted. This happens at the end of Phase 3, in migration 020 plus code removals.

**Migration 020 (`020_drop_legacy_taste_vector.sql`):**
- Drop any 24D taste vector columns from `taste_profiles` table
- Drop `interaction_log` JSONB column from `taste_profiles`
- The two prototype users lose their existing taste profiles at this point; they re-onboard on v2 on next app launch (acceptable)

**Code deletions:**
- `src/lib/taste/tasteVector.ts` — 24D vector model, dimension weights, cosine similarity
- `src/lib/taste/quizConfig.ts` — 48 quiz pairs, selection algorithms
- `src/lib/taste/quizScoring.ts` — quiz answer → vector delta computation
- `src/lib/taste/genreBlending.ts` — genre combination logic (replaced by embedding-space diversity)
- `src/lib/taste/contentVectorMapping.ts` — content → 24D vector mapping
- `src/components/quiz/TasteQuiz.tsx`
- `src/components/quiz/QuizQuestion.tsx`
- `src/lib/utils/recommendationEngine.ts` `scoreCandidate()` function and any scale-mismatch workarounds
- `src/lib/utils/recommendationEngine.ts` `recomputeVector()` function and double-application workaround
- v1 HiddenGems SQL filter (replaced by v2 Hidden Gems row using embedding similarity)
- Era-specific hacks (era dimension zeroing in "More Like This" context)

**Nothing migrates from the old system.** Two prototype users start fresh on v2.

**Status:** ✅ Incorporated — Phase 3 (commit `390537e`, 15 files deleted, migration 024 drops v1 columns)

---

## Phase 4 — Ranking and row selection

*(Multi-stage pipeline, slider integration, row generation)*

### IN-401: Slider haptic feedback at state transitions

**Source:** Conversation about slider design (Joe's request)

**Detail:** Sliders are continuous, not snap-to-state. However, implement subtle haptic feedback when the slider drag crosses meaningful state boundaries (e.g., from "Leaning surprises" to "Strongly prefer surprises").

**Implementation:**
- Use Capacitor's Haptics plugin: `import { Haptics, ImpactStyle } from '@capacitor/haptics'`
- Trigger on threshold crossing: `Haptics.impact({ style: ImpactStyle.Light })`
- Threshold values match descriptive state label boundaries (labels and haptic fire together)
- iOS supports this well; Android haptics more variable but acceptable
- Should NOT fire continuously during drag — only at moment of crossing
- Respect user's system haptic settings

**Status:** ✅ Incorporated (Phase 4). `SliderTray.tsx` imports `Haptics` and `ImpactStyle` from `@capacitor/haptics`. Threshold crossings tracked via `prevLabelsRef` — haptic fires once per label change, not continuously during drag. Fires on all 5 label boundaries ("Strongly prefer [left]" / "Slightly prefer [left]" / "Balanced" / "Slightly prefer [right]" / "Strongly prefer [right]") for all 4 sliders.

### IN-402: Slider state shared between Profile and For You

**Source:** Home & For You Composition Hypothesis v0.3 Section 3.2

**Detail:** The four sliders are accessible from two locations: Profile sub-page (canonical home) and For You modal/tray (contextual access). Both must read from and write to the same underlying state.

**Implementation:**
- Store slider state in a `user_slider_preferences` table (or as columns on `taste_profiles` if CC determines that's cleaner during Phase 4 implementation)
- Read on every navigation to either location
- Write immediately on slider release (auto-save, no explicit save button)
- Cache locally for offline resilience

**Status:** ✅ Incorporated (Phase 4). Slider state stored as four columns on `taste_profiles` (`slider_catalogue_age`, `slider_comfort_zone`, `slider_content_mix`, `slider_variety`) — decided during Phase 3. Both `TuneRecommendationsPage` (Profile sub-page) and `SliderTray` (For You bottom sheet) read via `getSliderState()` and write via `saveSliderState()`. Debounced auto-save at 500ms. `invalidateV2ProfileCache()` called on save to ensure the other location reads fresh values.

### IN-403: Slider parameter mapping (continuous to pipeline weight)

**Source:** Recommendation Engine Strategy v1.6 Section 5.2

**Detail:** Each slider modifies a specific pipeline parameter on a continuous range:
- **Catalogue age slider:** scales recency weight in Stage 2 ranking. Default 20%, range 10-30%
- **Comfort zone slider:** scales exploration ratio in Stage 3. Default 20-25%, range 10-40%
- **Content mix slider:** filters retrieval in Stage 1 by media_type weight. Default 50/50, range 80% films to 80% TV
- **Focused ↔ Varied slider** (renamed from "Depth vs breadth" in v0.3): modifies Stage 3 row selection. Range: deeper similar-content rows (focused) to greater row variety (varied)

Sliders do NOT modify the taste vector directly — they only modify pipeline parameters. This keeps the content-identity signal clean.

**Status:** ✅ Incorporated (Phase 4). Mapping functions in `src/lib/recommendations-v2/weights.ts`: `getCatalogueAgeRecencyWeight()` (0.30 - slider × 0.20), `getComfortZoneRowCount()` (5 + round(slider × 10)), `getContentMixMovieRatio()` (0.80 - slider × 0.60), `getVarietyGenreWindow()` (1 + round(slider × 4)). All mappings linear interpolation. Sliders do not modify taste vector — only pipeline parameters, per spec.

### IN-404: scoreCandidate scale mismatch must NOT be carried forward

**Source:** Recommendation Engine Strategy v1.6 Section 5.2; memory notes

**Detail:** v1's `scoreCandidate()` function has a known bug where cosine similarity (0-100 scale, raw) is added to weighted components. v2 must enforce consistent scoring:
- Taste vector updates as weighted sums of unit-length embedding deltas
- Ranking weights as percentages summing to 100%
- No mixing of raw and normalised scores

This is a discipline, not a feature, but must be enforced from day 1 of Phase 4. The v1 `scoreCandidate()` function itself is deleted in Phase 3 (see IN-303), so there's no risk of the bug being referenced, but the v2 equivalent must not reintroduce the same mistake.

**Status:** ✅ Incorporated (Phase 4). All Stage 2 scoring components are normalised to 0.0–1.0 before weighting. `distanceToSimilarity()` converts cosine distance (0-2) to similarity (0-1). `computeForYouRecencyScore()` returns 0-1 via exponential decay. `computeContextualScore()` returns 0-1 (0.5 placeholder). `normalizePopularity()` log-scales to 0-1. `normalizeImdbRating()` divides by 10. Weights sum to 1.0. Match percentage conversion (`scoreToMatchPercentage()`) is isolated to the final UI mapping step. No mixing of raw and normalised scores.

---

## Phase 4.5 — Mood Rooms

*(HDBSCAN clustering via Python + GitHub Actions monthly cron, LLM labelling, mood_rooms table)*

### IN-451: Use HDBSCAN, not k-means

**Source:** Recommendation Engine Strategy v1.6 Section 5.2

**Detail:** Density-based clustering, not k-means. HDBSCAN produces variable-sized organic clusters and identifies noise (titles that don't fit cleanly anywhere). Matches the emergent aesthetically-coherent behaviour we want. Expected output: 30-60 mood rooms covering 70-80% of catalogue.

**Status:** ⏳ Not yet incorporated

### IN-452: Two-pass LLM labelling with editorial override

**Source:** Recommendation Engine Strategy v1.6 Section 5.2

**Detail:** First pass: send each cluster's 20 most central titles to an LLM with prompt "Generate a 2-4 word name and a 1-sentence description for the taste neighbourhood these titles share." Second pass: manual editorial review and override of weak labels. Editorial overrides stored in `is_curated` flag and persist across re-clusterings as long as the cluster remains stable.

**Status:** ⏳ Not yet incorporated

### IN-453: Monthly re-clustering with stability constraints

**Source:** Recommendation Engine Strategy v1.6 Section 5.2

**Detail:** Re-cluster monthly. For clusters >80% stable (same core titles), preserve ID, label, and user data (favouriting, usage tracking). For clusters that meaningfully shift, treat as new clusters. Archive old clusters that users had favourited so existing references don't break.

**Status:** ⏳ Not yet incorporated

### IN-454: Mood Rooms for Tonight rotation logic

**Source:** Home & For You Composition Hypothesis v0.3 Section 3.2

**Detail:** The "Mood Rooms for Tonight" row on For You shows 3-5 mood rooms. Refresh weekly (e.g., every Monday). Within the week, shuffle ordering between sessions so the same user sees a slightly different arrangement each time. Matches Spotify's Discover Weekly cadence.

**Status:** ⏳ Not yet incorporated

### IN-455: Python + GitHub Actions execution environment

**Source:** Strategy review round 2 (CC finding M3); Recommendation Engine Strategy v1.6 Section 5.2; Project Orchestration v0.3 Section 6.1

**Detail:** HDBSCAN has no production-quality TypeScript library. The canonical Python library (`hdbscan`) is the right tool. Running it as a local Python script via GitHub Actions monthly cron avoids the operational cost of a dedicated Python service or microservice.

**Script location:** `scripts/mood_rooms/recluster.py` in the main repo

**Dependencies** (pinned in `scripts/mood_rooms/requirements.txt`):
- `hdbscan`
- `numpy`
- `psycopg2-binary` (see IN-456)
- `openai`

**Workflow file:** `.github/workflows/mood-rooms-recluster.yml`

**Schedule:** `cron: '0 3 1 * *'` (03:00 UTC on the 1st of each month)
**Manual trigger:** `workflow_dispatch` enabled for testing

**Secrets (via GitHub Actions Secrets):**
- `SUPABASE_CONNECTION_STRING` — direct PostgreSQL connection string from Supabase dashboard
- `OPENAI_API_KEY` — for two-pass LLM labelling

**Runtime expectation:** 5-15 minutes per run at 20K titles. Well within GitHub Actions' 6-hour per-job limit.

**Status:** ⏳ Not yet incorporated

### IN-456: psycopg2 direct PostgreSQL connection for bulk vector pulls

**Source:** Strategy review round 2 (CC finding M3 validation); Recommendation Engine Strategy v1.6 Section 5.2

**Detail:** The Python clustering script uses `psycopg2` with Supabase's direct PostgreSQL connection string, NOT the Supabase Python REST client (`supabase-py`).

**Why:** `supabase-py` uses PostgREST which has a default row limit (typically 1000). Pulling 20K × 1536-dim vectors requires either:
- Paginating with `.range(0, 999)`, `.range(1000, 1999)`, etc. (20 roundtrips, slow)
- Increasing `PGRST_MAX_ROWS` in Supabase config (possible on Pro but not ideal)
- **Using psycopg2 with the direct connection string (fastest, no row limit)**

Option 3 is the locked choice. Supabase Pro exposes a direct PostgreSQL connection string in the dashboard. `psycopg2-binary` provides the Python driver.

**Connection string format:** `postgresql://postgres:[password]@[project-id].supabase.co:5432/postgres`

**Status:** ⏳ Not yet incorporated

### IN-457: HDBSCAN fallback plan if clustering quality is poor

**Source:** Strategy review round 3 (Joe's pre-read risk flag); Recommendation Engine Strategy v1.6 Section 8.1

**Detail:** HDBSCAN on 20K × 1536-dim embeddings is expected to produce 30-60 usable clusters, but this is a hope not a guarantee. HDBSCAN can sometimes produce either a few mega-clusters or mostly noise, depending on how the embedding space is shaped.

**Empirical validation in Phase 4.5:** after the first HDBSCAN run, manually inspect the output. Check:
- Cluster count (aim for 30-60)
- Catalogue coverage (aim for 70-80% of titles in clusters, not noise)
- Cluster coherence (spot-check 5-10 clusters for aesthetic/thematic coherence)

**Fallback if HDBSCAN output is unusable:**
- **Option 1:** tune HDBSCAN parameters (`min_cluster_size`, `min_samples`, metric choice) and re-run
- **Option 2:** switch to k-means with a fixed cluster count (40 as a starting point). k-means has a JavaScript library (`ml-kmeans`) so the Python script becomes unnecessary — drop the GitHub Actions workflow, do clustering in a Node script or directly in the Edge Function
- **Option 3:** hybrid approach — use HDBSCAN for high-density regions and k-means for the noise titles

Which fallback depends on what HDBSCAN actually produces. Don't pre-commit to one.

**Phase 4.5 Gate 2 outcome (2026-04-20):** fallback triggered. Full tune sequence below.

| Attempt | Change | Clusters | Coverage | Mega-cluster | Notes |
|---|---|---|---|---|---|
| 1 | Pure HDBSCAN, raw 1536D, `min_cluster_size=50`, `min_samples=5` | 2 | 10.2% | n/a | Curse-of-dimensionality — hard fail |
| 2 | + UMAP preprocessing (10D, `n_neighbors=15`, `metric='cosine'`), defaults | 47 | 57.6% | 1578-title Bollywood blob ("Desert Shadows" mislabel) | Gate 2 fail: coverage + mega-cluster |
| 3 | B1+B2: `min_cluster_size=30`, `cluster_selection_method='leaf'` | 96 | 37.1% | none (max 306) | Over-fragmented; leaf too aggressive at this scale |
| 4 | Path 1: revert to `eom`, add `max_cluster_size=800`; keep B1 | 80 | 51.3% | none (max 777) | Mega-cluster resolved; coverage low |
| 5 | B3: UMAP `n_neighbors` 15 → 30 | 68 | 53.5% | none (max 788) | Gate 2 approved |

**Final parameters (stored in `cluster_params` on every `mood_rooms` row):**

- UMAP: `n_components=10`, `n_neighbors=30`, `min_dist=0.0`, `metric='cosine'`, `random_state=42`
- HDBSCAN: `min_cluster_size=30`, `min_samples=5`, `metric='euclidean'`, `cluster_selection_method='eom'`, `max_cluster_size=800`
- Library versions: `umap-learn==0.5.12`, `hdbscan==0.8.42`
- Labelling prompt carries `original_language` (ISO 639-1) per title — improved label quality (e.g. correct "Bollywood Melodrama" and "Tamil Tapestry of Tension" separation)

**Coverage plateau is structural.** Three orthogonal tuning passes (`max_cluster_size` cap, UMAP neighbourhood width, HDBSCAN density thresholds) moved coverage across a narrow 51–58% band. ~45% of the catalogue sits in sparse regions of the 1536D OpenAI embedding space — they don't have dense neighbours to form dense-only clusters. This is a property of the catalogue's embedding distribution, not a pipeline failure.

**Hybrid (Option 3) rejected:** k-means on the noise tail would buy coverage at the cost of incoherent synthetic rooms — titles forced into clusters they don't belong to, which undermines the mood-rooms UX premise. Quality over coverage. Noise titles still surface elsewhere on For You (Recommended, Hidden Gems, etc).

**Status:** ✅ Incorporated with UMAP preprocessing (Option 1 path). Full tune sequence above.

### IN-458: `getAvailableTmdbIds` does not distinguish by `media_type`

**Source:** Phase 4.5 Gate 1 audit (schema design for `mood_room_titles`)

**Detail:** The `get_available_tmdb_ids` RPC (migration 028) and its TypeScript consumer `getAvailableTmdbIds` in `src/lib/recommendations-v2/hardFilters.ts` return a `Set<number>` of bare `tmdb_id` values, with no `media_type` distinction. TMDb IDs are allocated from separate sequences for movies and TV and do collide in practice (e.g. `tmdb_id=555` can exist as both a movie and a TV show). When the user has the movie on Netflix but not the TV show (or vice versa), the filter treats both as available — an incorrect positive.

Impact is codebase-wide, not mood-rooms-specific. All callers of `FilterSets.availableTmdbIds` inherit the imprecision: `ranker.ts` (For You rows), `useForYouContent` (Because You Watched anchors, More From Person), the upcoming `useMoodRoomsRow` and `MoodRoomPage`.

The correct fix is to widen the RPC and filter set to `Set<{ tmdbId: number, mediaType: 'movie' | 'tv' }>` (or equivalent composite). This touches:
- The RPC definition in a new migration (return `(tmdb_id, media_type)` pairs).
- `getAvailableTmdbIds` signature and return type.
- All call sites that use `.has(tmdbId)` — must become `.has({ tmdbId, mediaType })` or keyed on a composite string.
- Frontend types for items that carry availability info.

Not fixed in Phase 4.5 — that phase accepted the inherited imprecision because mood rooms inherit it at the same rate as every other For You row, and fixing it here would balloon scope. File for a future correctness pass (likely Phase 5/6 quality-sweep) alongside the existing consumers.

**Status:** ⏳ Not yet incorporated

### IN-459: Re-evaluate mood room coverage after 3 monthly runs

**Source:** Phase 4.5 Gate 2 close-out (2026-04-20)

**Detail:** The 53.5% coverage ceiling that Phase 4.5 shipped is based on one catalogue snapshot (20,098 embedded titles, April 2026). Three things could change the picture:

1. **Catalogue growth.** As the sync pipeline adds titles, the embedding space gets denser and more clusterable regions may emerge.
2. **User engagement data.** Once the surface is live and Phase 0 impressions are flowing, it becomes observable whether the ~9,400 non-clustered titles are being under-served in recommendations. If they are, the coverage gap matters. If users are already finding those titles via Recommended / Hidden Gems / Because You Watched, coverage is a vanity metric.
3. **Embedding quality.** Any future change to `text-embedding-3-small` → `text-embedding-3-large` or a different provider would shift the density distribution significantly.

**Action:** after three successful monthly clustering runs (i.e. first production run + two cron runs, ~3 months post-Phase-4.5-merge), review:

- Coverage trend (is it moving? in which direction?)
- Cluster count stability (are the 68 rooms persisting through re-clusters, or churning?)
- Impressions + taps on mood-room cards (from `card_impressions` where `source_surface='mood_room'`)
- Whether the ~9,400 non-clustered titles are being recommended at a healthy rate from other For You rows

If coverage ceiling persists AND impression data shows under-served titles in sparse regions, revisit **hybrid approach (IN-457 Option 3)** in Phase 6. Add k-means on the noise tail to produce additional rooms, accepting the quality trade-off because the alternative (invisible titles) is worse.

If coverage plateau is stable AND under-served titles are being surfaced elsewhere, leave as-is. The 70% target from the original hypothesis was a pre-data estimate; the empirical ceiling is the honest answer.

**Status:** ⏳ Not yet incorporated (action item for Phase 5/6 post-launch review)

---

## Cross-phase notes

### IN-XPS-001: Privacy disclosure copy must align with Detail Page Signal Spec

**Source:** Detail Page Signal Capture Spec v0.3 Section 6

**Detail:** Wherever privacy disclosures appear (onboarding, Profile > Privacy & Data sub-page, full privacy policy), the language must accurately describe what's captured per the signal spec. Must mention:
- Behavioural signals (dwell time, exit outcome) tracked silently for personalisation
- Explicit signals (thumbs, watchlist, watched) used to learn taste
- Service usage tracked for cold-start improvements
- Lawful basis: legitimate interest under GDPR
- User rights: access (download data), deletion (account delete), portability

Avoid generic privacy boilerplate. Be specific about what Videx actually does.

**Status:** ⏳ Not yet incorporated

### IN-XPS-002: Profiles "Allow public username lookup" policy tightening

**Source:** Strategy review round 3 (Joe's profiles query output analysis)

**Detail:** The production `profiles` table has an RLS policy `"Allow public username lookup"` with command `SELECT`, `using_expression: true`, no role restriction. This policy says "anyone, including unauthenticated users, can SELECT from profiles with no row restriction."

The intent is to support username availability checking during signup. But as written, it exposes the entire profiles table to public reads — including `onboarding_completed`, `region`, `is_test_user`, `theme_preference`, `created_at` — for every user, not just username lookups.

**Current risk:** low, because there are only two prototype users and no public launch.

**Flagged for:** pre-public-launch tightening. The correct pattern is a `SECURITY DEFINER` function that takes a username and returns only a boolean "available or not," or a restricted policy that only exposes the `username` column via a view.

**Action:** add this to the pre-public-launch checklist. Not a blocker for v2 build, but must be addressed before v2 ships to any real users. Likely fix happens in Phase 5 (privacy hardening pass) or at a dedicated pre-launch security review.

**Status:** ⏳ Flagged, not yet scheduled

### IN-XPS-003: Verify pg_partman automatic partition creation after first month

**Source:** Strategy review round 3 (Joe's pre-read open questions)

**Detail:** Migration 014 sets up pg_partman for monthly `card_impressions` partitioning with `p_premake => 2` and a daily maintenance job. After the first month tick-over (early May if Phase 0 ships in April), verify:

1. A new partition `card_impressions_YYYY_MM` has been created automatically
2. The daily pg_cron maintenance job is running without errors
3. The retention policy is dropping old partitions correctly (will only be visible after 3+ months of data)

**Verification queries:**
```sql
-- Check partitions exist
SELECT schemaname, tablename FROM pg_tables WHERE tablename LIKE 'card_impressions_%';

-- Check pg_cron job history
SELECT jobname, last_run FROM cron.job_run_details WHERE jobname LIKE '%partman%' ORDER BY last_run DESC LIMIT 10;

-- Check partman config
SELECT * FROM partman.part_config WHERE parent_table = 'public.card_impressions';
```

**If partitions are NOT being created automatically:** escalate immediately. Missing partition = INSERT failures = data loss. Manual fallback is to create next month's partition via direct DDL while investigating.

**When:** early May 2026 (or whenever the first calendar-month boundary after Phase 0 ships occurs).

**Status:** ⏳ Scheduled for post-Phase-0 verification

### IN-XPS-004: Service-role JWT in cron migration files should rotate to a secrets-managed reference before launch

**Source:** Phase 0.5 closeout review (pattern inherited from Phase B1)

**Detail:** Both `supabase/migrations/006_cron_schedule.sql` (Phase B1 — schedules `daily-content-sync`) and `supabase/cron/enrich_new_titles.sql` (Phase 0.5 — schedules `enrich-new-titles`) hardcode a full service-role JWT in version-controlled SQL so that pg_cron's `net.http_post()` can authenticate against the target Edge Functions. Phase 0.5 inherits this pattern from Phase B1 rather than introducing new exposure — but it is a pre-existing risk that both phases now depend on.

**Why it matters:** The JWT in those SQL files grants service-role access to the entire Supabase project. Anyone with git history access (which includes anyone with read access to the repo) has a long-lived bypass of RLS on every table. During the build this is acceptable because only two people touch the repo and the Supabase project is pre-launch; post-launch this becomes a P0 security risk.

**Rotation plan before public launch:**
1. Create a Supabase Vault secret for the service-role JWT using `vault.create_secret()` (pg_cron can read from `vault.decrypted_secrets` at job execution time).
2. Update both cron SQL files to read the JWT from the vault at execution time rather than baking it into the `cron.schedule` command body.
3. Rotate the existing service-role JWT so the historical ones in git history are invalidated.
4. Add a CI check that greps the repo for `Bearer eyJ` patterns in SQL files and fails the build if any appear outside `supabase/migrations/` archives.

**Categorise:** cross-phase / security hardening / post-launch. **Blocks public launch.** Not a blocker for any phase of the v2 build itself.

**Reference:** Phase 0.5 summary §5 first entry. Files: `supabase/migrations/006_cron_schedule.sql:19`, `supabase/cron/enrich_new_titles.sql` (embedded JWT).

**Status:** ⏳ Flagged for pre-public-launch

### IN-XPS-005: Atomic tmp+rename is Windows-hostile for files under active observation

**Source:** Phase 0.5 empirical finding (backfill crash at row ~17,000 of 20,000)

**Detail:** The original Phase 0.5 backfill used `writeFileSync(tmp, body); renameSync(tmp, final)` on every checkpoint write (every row, ~260 ms cadence). During the production run on Joe's Windows host with VS Code and Claude Code file watchers active, this crashed fatally at row ~17,000 with:

```
Fatal: Error: EPERM: operation not permitted, rename
'...\.checkpoint.json.tmp' -> '...\.checkpoint.json'
```

**Root cause:** Windows `MoveFileEx` (which backs `renameSync`) refuses to rename over a destination held by any process via file handles. File watchers under VS Code / Claude Code / antivirus hold transient read handles continuously on observed files, and a long enough sequence of rename attempts eventually races into a held handle. The tmp+rename idiom is safe on Unix but structurally broken on Windows for any file under active observation.

**Fix applied in Phase 0.5** (commit `c4a8916`): dropped tmp+rename entirely, use plain `writeFileSync`, retry 3× on EPERM with 50 ms busy-wait, write every 50 rows instead of every row. Zero data loss — the 17,166 rows from the crashed first run had already been UPDATE'd to Supabase successfully, the resume run picked up from the checkpoint and completed the remaining 2,832 rows in 18m 35s with zero EPERM events.

**Lesson for future Videx scripts on Windows:**
- For small config/checkpoint files (<1 KB): **prefer plain `writeFileSync(path, body)`**. The atomicity benefit of tmp+rename is negligible for files small enough that the write itself is effectively atomic on modern disks, and the consumer should handle rare corruption via "reload and recover from last good state" semantics.
- For large or corruption-sensitive files: still use tmp+rename, but retry on `EPERM` with a short busy-wait between attempts (3 × 50 ms is the Phase 0.5 pattern), OR exclude the file from VS Code's `files.watcherExclude` and from antivirus exclusions.
- If we accumulate enough Node-side callers, add a generic `writeJsonAtomic(path, data)` helper to `src/lib/fs/`. Not needed yet.

**Reference:** Phase 0.5 summary §3 Deviation 1, `scripts/enrichment/backfill-enrichment.ts:74-118` (post-fix implementation), commit `c4a8916`.

**Status:** ✅ Incorporated (Phase 0.5 — fix landed in commit `c4a8916`; lesson filed here for future Windows-side scripts)

### IN-XPS-006: Delete account wiring deferred *(Phase 3 carry-forward)*

**Source:** Phase 3 brief §9.1; GDPR Article 17

**Detail:** The delete account confirmation modal UI ships in Phase 3 (Privacy & Data sub-page in ProfilePage). But the "Delete Account" button is disabled with an inline notice: "Account deletion is not yet available. Contact support to delete your account."

Wiring requires cascading delete across: `profiles`, `user_interactions`, `card_impressions`, `taste_profiles`, `user_services`, watchlist entries, and the Supabase auth user. Must be implemented before public launch.

**Status:** ⏳ Flagged for pre-public-launch

### IN-XPS-007: Service pricing config needs review cadence *(Phase 3 carry-forward)*

**Source:** Phase 3 Task 11 (Monthly Spend sub-page)

**Detail:** Service tier pricing is hardcoded in `src/lib/data/platformPricing.ts` with a "Last verified: April 2026" header comment. UK streaming prices change frequently (Netflix raised prices twice in 2024, Disney+ restructured tiers). Before public launch, either establish a quarterly review cadence or wire to an external pricing data source.

**Status:** ⏳ Flagged for pre-public-launch

### IN-XPS-008: Consider pre-built onboarding watched-grid title pool *(Phase 3 carry-forward)*

**Source:** Phase 3 testing feedback (Joe)

**Detail:** The onboarding watched-grid (Step 3) currently queries popular titles from the user's services live at onboarding time (~500ms). An alternative: pre-build a curated pool of recognisable titles per service, refreshed weekly via cron job or Edge Function. Benefits: instant load (0ms), editorial control over what appears, consistent QA. Trade-off: another table to maintain, not personalised to the user's services until the pool is partitioned by service. Needs user testing first to validate whether the current dynamic approach produces good enough results before committing to a pre-built pool.

**Status:** ⏳ Consider after user testing

### IN-XPS-009: Retake Taste Profile limited to cluster selection only *(Phase 3 carry-forward)*

**Source:** Phase 3 post-merge review (Joe)

**Detail:** The "Retake taste profile" action in Profile → Your Taste currently opens only the cluster selection grid (RefinePreferencesPage). The original plan called for reusing onboarding Steps 3–5 (watched-grid → clusters → taste summary) for a full taste profile retake. This was deferred because the step components live inline in `OnboardingFlow.tsx` (1,122 lines) rather than as separate reusable files, making cross-component reuse impractical without either extracting them or importing OnboardingFlow in a special mode.

**Impact:** Users can refine their genre/cluster preferences but cannot redo the watched-grid portion of the taste profile without going through full onboarding again. The taste vector is re-bootstrapped from cluster representative titles only (no watched-grid signal on retake).

**Fix when needed:** Extract Steps 3–5 (StepWatchedGrid, StepGenrePreferences, StepTasteSummary) into standalone components in `src/components/onboarding/`. Import from both OnboardingFlow and ProfilePage's retake flow. This is part of the broader monolith refactoring of OnboardingFlow.tsx and ProfilePage.tsx.

**Status:** ⏳ Deferred — revisit when Phase 4/5 needs to modify these files or when user feedback indicates retake quality is a problem

---

## Onboarding implementation notes

*(Specific to the v2 onboarding flow build — applies to Phase 3 where onboarding gets wired to backend logic)*

### IN-OB-001: Genre taxonomy needs review during implementation

**Source:** Onboarding Step 4 design review

**Detail:** The genre options shown in the Figma Make designs (Feel-Good & Funny, Dark Thrillers, Epic Sci-Fi & Fantasy, Rom-Coms & Love Stories, Horror & Supernatural, Mind-Bending Mysteries, Heartfelt Drama, True Crime & Real Stories, Anime & Animation, Prestige & Award-Winners, History & War, Reality & Entertainment, Cult & Indie, Action & Adrenaline) are PLACEHOLDER. The final genre taxonomy must be reviewed during implementation, not locked from the design references.

**Considerations during review:**
- Should match v2 embedding-space taste vector dimensions where possible
- Check for category overlaps (e.g., "Feel-Good & Funny" vs "Rom-Coms & Love Stories")
- Consider adding Documentaries as a standalone category
- Confirm alignment with TMDb genre IDs for content cache joinability
- Each category should map cleanly to one or more genre clusters in the embedding space

The v1 system used 19 genre dimensions on the 24D taste vector. v2 doesn't strictly need genre dimensions (taste is now embedding-based), but the user-facing taxonomy still matters for cold-start signal capture in Step 4 of onboarding.

**Status:** ⏳ Not yet incorporated

### IN-OB-002: Step 3 watched-grid round selection algorithm

**Source:** Onboarding Step 3 design review

**Detail:** The 6 titles shown per round in the watched-grid (Step 3) must surface DIFFERENTIATED SLICES of content across the 3 rounds — not random popular titles. Titles in the Figma Make design (House of Dragon, The Crown, Abbott Elementary, Ted Lasso, 1899, The Bear) are placeholder.

**Required behaviour:**
- **Round 1:** broadly popular titles likely to be recognisable to most users (mainstream comfort viewing)
- **Round 2:** recent prestige content from user's selected services (acclaimed releases from last 1-2 years)
- **Round 3:** deeper-cut content matching user's emerging signals from Round 1+2 (less popular, genre-specific)

**Each round's title pool should be:**
- Filtered to titles available on the user's selected services from Step 2
- Mixed across film and TV
- Mixed across UK and international content
- Excluding titles already shown in previous rounds
- Refreshable via "See different titles" button

If user taps "I haven't watched any of these — skip this round," advance without recording any selections. Cold-start can proceed with whatever signal is captured from completed rounds + Step 4 genres + Step 2 services.

**Status:** ⏳ Not yet incorporated

### IN-OB-003: Selection state styling must match existing app design system

**Source:** Onboarding design review

**Detail:** Figma Make designs show selected/unselected states for genre cards (Step 4), service cards (Step 2), and watched-grid cards (Step 3) but do not show consistent styling. CC must reference the existing app's design system — do NOT invent new selection patterns.

- Service selection (Step 2): match existing service selection pattern from v1 onboarding if it exists
- Genre selection (Step 4): match existing genre chip selection pattern
- Watched-grid selection (Step 3): new pattern, but same visual language as other selection states (border highlight + checkmark icon)

Figma Make designs are UX references only. Visual implementation references the existing app.

**Status:** ⏳ Not yet incorporated

### IN-OB-004: Step 3 needs real poster art from TMDb

**Source:** Onboarding Step 3 design review

**Detail:** Figma Make design for Step 3 shows title names as orange text on grey backgrounds because Figma Make couldn't render real images. Placeholder only.

**Production requirements:**
- Each card shows actual TMDb poster image
- Poster aspect ratio matches existing content card components
- Loading state while posters fetch (use existing `ImageSkeleton` if available)
- Fallback for missing posters
- Title text underneath poster (already in design) for accessibility

Users select titles by visual recognition, not by reading names. Poster rendering is critical for Step 3 to work as intended.

**Status:** ⏳ Not yet incorporated

### IN-OB-005: Onboarding back button must preserve step state

**Source:** Onboarding cross-step review

**Detail:** When a user taps back on any onboarding step, their selections should be preserved if they return forward:
- Step 1 form fields (email, username, password, age range, viewing context)
- Step 2 service selections
- Step 3 watched-grid selections per round
- Step 4 genre selections
- Step 5 slider positions

Onboarding state held in component state or session-scoped store until Step 5's "Start exploring" commits everything to Supabase. Mid-flow back-and-forth must not lose progress.

If user abandons onboarding and re-opens app: decide whether to (a) resume from last step, or (b) restart from Step 1. Design decision, but implementation should support either.

**Status:** ⏳ Not yet incorporated

---

*End of parking lot v0.3.1. All new entries from strategy review rounds 1-3 incorporated. Phase 6.5 section removed — cleanup is distributed across the phases that perform it. Ready for CC review as part of the v2 document set.*
