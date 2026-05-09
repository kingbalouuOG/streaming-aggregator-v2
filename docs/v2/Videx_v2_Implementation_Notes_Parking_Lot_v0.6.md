# Videx v2 — Implementation Notes Parking Lot

**Status:** v0.6 — Phase 5 close-out. Phase 5 shipped four migrations (036–039) + CORS + verify_jwt CI guard + Database<> generic + foryou-parity CI workflow + contextual scoring + MMR. Status flips below reflect what landed; the Phase 5 summary at `docs/v2/phase-summaries/phase-5-summary.md` is authoritative for what shipped vs deferred.
**Version:** 0.6

**Changes from v0.5 (Phase 5 kickoff portion):**
- **IN-463** status flipped from ⏳ → ✅ Incorporated. LLM thematic labels for anchored mood rooms shipped via migration 034 (`mood_room_anchor_labels`) plus the `label-anchor-room` Edge Function. Replaces v1 templated labels for anchored rooms only — global mood rooms keep their cluster-derived labels.

**Changes from v0.6 kickoff (Phase 5 close-out, 2026-05-06):**
- **IN-XPS-002** ✅ Incorporated — username_available SECURITY DEFINER RPC + AuthContext rewire (migration 038).
- **IN-XPS-004** ✅ Partially incorporated — Vault storage migration shipped (migration 039 + cron file edits); cryptographic rotation deferred to Phase 6 pending Supabase tooling (new `sb_secret_…` keys are opaque, fail `verify_jwt = true`).
- **IN-XPS-006** Did NOT ship in Phase 5 despite scoping. **Re-audited 2026-05-07**: backend RPC `delete_own_account` exists in production + client wiring is in place; UI is intentionally gated off (disabled button + "not yet available" notice). Re-targeted to Phase 5.5 with a clear five-step plan (audit RPC, capture in version-controlled migration, test, flip UI gate, add type-username-to-confirm).
- **IN-XPS-011** ✅ Incorporated — six per-function `config.toml` files + `edge-fn-jwt-guard` CI workflow.
- **IN-XPS-012** ✅ Workflow file added — `foryou-parity.yml` soft-skipped pending repo secrets configuration (`PARITY_*`).
- **IN-XPS-013** ✅ Incorporated — shared `cors.ts` helper + tightened both browser-callable Edge Functions; `*` posture replaced with allow-listed echo.
- **IN-458** Re-targeted to Phase 5.5 / 6 — migration 040 (typed pairs) deferred to keep Phase 5 scope tight; 0.8% collision rate, no functional regression.
- **IN-462** Re-targeted to Phase 5.5 — forYouStore deferred pending IN-468/469 telemetry decisions (interact with the store shape).
- **IN-465** Re-targeted to Phase 5.5 / 6 — backfill script not authored.
- **IN-467/468/469** still gated on telemetry agent run 2026-05-11.

**Changes from v0.4:**
- **IN-466** status flipped from ⏳ → ✅ Incorporated. Server-side render landed via the `render-foryou-rows` Edge Function. Cold-fallback contract: client falls through to the existing `useForYouContent` pipeline on any Edge failure (5xx, malformed JSON, network, >1.5s timeout — tightened from the brief's 5s after the cold-instance profile came in 5-12s).
- Phase 4.5 section gained four new entries from the IN-466 implementation:
  - **IN-467**: long-term consolidation of `_shared/recommendations-v2/` mirror — the path-(a) mirror copy ships drift-controlled (CI check on `src/lib/recommendations-v2/` ↔ `_shared/recommendations-v2/`); a future refactor into a runtime-portable shared package eliminates duplication entirely.
  - **IN-468**: Variant B — stale-while-revalidate localStorage snapshot of the rendered For You payload. Deferred pending measured warm p95; revisit if real-WAN p95 exceeds 1.0s.
  - **IN-469**: Cold-start mitigation continuation. Variant A (warmup-foryou Edge Function fired from App.tsx mount) shipped this phase; future options include pg_cron-driven pre-warm to keep an instance permanently hot, and Variant B for instant-paint via cache.
  - **IN-470**: wire `featuredLastWeek` through to the Edge Function for week-on-week anchor variety. Filed during the simplification pass when the request-body field was deleted as dead code (always passed as `[]`); revive when the threading is implemented.
- Cross-phase section gained four new entries:
  - **IN-XPS-010**: Pro→Free Supabase downgrade risk inventory — pg_partman + pg_cron breakage, project auto-pause, bandwidth/db-size ceilings — surfaced when cost optimisation came up during the IN-466 build.
  - **IN-XPS-011**: CI guard against `verify_jwt = false` drift on user-callable Edge Functions. Pre-public-launch hardening — required because `extractUserIdFromJwt` decodes without verifying signature (relying on Supabase gateway pre-verification).
  - **IN-XPS-012**: promote the parity probe (`scripts/_inspect_foryou_parity.mjs`) to a CI smoke test. The `shared-tree-drift` workflow only catches file-level drift; semantic divergence between Edge and client paths can still ship with both trees passing.
  - **IN-XPS-013**: pre-launch CORS tightening on user-callable Edge Functions — currently `*`, should narrow to the known Capacitor + future web origins.

**Changes from v0.3.4:**
- Phase 4.5 section gained three new entries:
  - **IN-463**: hybrid LLM labelling for anchored mood rooms — replace "If you love {anchor}" with thematic labels via gpt-4o-mini. Phase target 4.5 fast-follow. Depends on standing up the first request-time LLM Edge Function in this codebase.
  - **IN-464**: detail-page "Make a room from this title" feature — Spotify-Song-Radio analogue using the room-generation primitive at `src/lib/recommendations-v2/anchoredRoom.ts`. Phase target 6+.
  - **IN-465**: catalogue-sync gap surfaced by the anchored rooms probe — 3,807 tmdb_ids appear in `streaming_availability` but are absent from `titles` entirely. Replaces the probe's misdiagnosed "21% embedding gap" framing. Phase target post-Phase-4.5 investigation.
- Onboarding-flow section gained one new entry:
  - **IN-OB-006**: onboarding cluster taxonomy review under v2 engine assumptions. Three options (sharpen, drop, hybrid). Decision deferred until Phase 4.5 anchored rooms ship 3 months of telemetry. Phase target Phase 6 review.
- Counts updated to reflect new entries.

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

**Phase target update:** originally scoped into Phase 5 Workstream F (migration 040). Deferred at Phase 5 close to keep scope tight — collision rate is 0.8% with no functional regression today. Re-targeted to Phase 5.5 / Phase 6.

**Status:** ⏳ Not yet incorporated (Phase 5.5 / 6).

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

### IN-460: Upgrade `actions/setup-python` when v6 ships (Node.js 20 deprecation)

**Source:** Phase 4.5 Gate 3 first successful workflow run (run #2, 2026-04-21)

**Detail:** The `.github/workflows/mood-rooms-recluster.yml` workflow uses `actions/setup-python@v5`, which runs on Node.js 20. GitHub surfaces a deprecation notice on every run:

> Node.js 20 actions are deprecated. Actions will be forced to run with Node.js 24 by default starting **June 2nd, 2026**. Node.js 20 will be removed from the runner on **September 16th, 2026**.

Until the deprecation bites, the workflow runs normally. Between 2026-06-02 and 2026-09-16 the action will be force-upgraded to Node 24 (may introduce behaviour changes). After 2026-09-16 the workflow will fail outright unless we either pin to a Node-24-compatible version or set `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` (which is a dead-end that only buys a short extension).

**Action:** when `actions/setup-python@v6` is released with Node 24 support, bump the pin:

```yaml
- uses: actions/setup-python@v6  # was @v5
```

Same goes for `actions/checkout@v5` if GitHub releases a Node-24 major. Check both when making the change.

Not urgent in April 2026 — just a calendar reminder to check setup-python's release page in May 2026 or set an alert for when v6 ships. No functional impact until the June deadline.

**Status:** ⏳ Not yet incorporated (time-triggered action item)

### IN-461: Review FORBIDDEN_WORDS compound-noun carve-outs after May cron

**Source:** Phase 4.5 relabel audit (2026-04-21)

**Detail:** The programmatic `FORBIDDEN_WORDS` check in `scripts/mood_rooms/label.py` rejects any label whose whitespace-split tokens overlap the forbidden set (`whispers, echoes, shadows, whimsical, tales, chronicles, realm, allure, reverie, dreamscape, odyssey, tapestry, unleashed, unveiled`). The brief's own approved labels include two that would be rejected by this check if the LLM generated them:

1. **"Bedtime Fairy Tales"** (room #29) — contains `tales`. The brief carves it out manually on the premise that "Fairy Tales" is an established compound noun, equivalent to the brief's own exception for "Stand-Up Showcase".
2. **"American Music & Film Docs"** (room #12) — passes whitespace token count (5 tokens via `&`) but the `&` is a conjunction, not a content word.

Neither survives the relabel because the relabel script is a hand-written override path with no validation. But the next cron run (May 2026) will validate all new LLM-generated labels against `FORBIDDEN_WORDS`. Stability preservation (Jaccard ≥ 0.8) means existing clusters keep their manual labels — so this only affects **new clusters in future runs**.

**Decision (locked for now):** keep the check strict. The trade of losing "Fairy Tales" and similar compound phrasings to prevent a recurrence of the six-different-"Echoes"-rooms problem is correct. The LLM will find alternative phrasings for concepts that currently use forbidden head nouns.

**Action for May post-run review:** for any new cluster generated in the May run, inspect the LLM's phrasing for concepts that previously would have wanted "Fairy Tales" / "Showcase" (kids' fantasy, comedy specials, anthology formats). If the alternative phrasings read as forced or worse than the forbidden-word version, revisit this decision and introduce a compound-noun allow-list. If alternatives are clean, leave as-is and remove this item at Phase 5 close-out.

**Status:** ⏳ Not yet incorporated (May 2026 review)

### IN-462: For You tab-switch preservation

**Source:** Phase 4.5 Gate 4 smoke (2026-04-22)

**Detail:** When the user switches away from For You (Home / Browse / Watchlist / Profile tabs) and back, `<ForYouPage />` conditionally unmounts and remounts. On remount, `useForYouContent` fires its load effect and re-runs the full pipeline: Stage 1 candidate retrieval via `match_titles_by_vector` (500 titles), extended metadata fetch, Because-You-Watched anchor resolution, MoreFrom person fetch, Watchlist row, plus the new mood-rooms RPCs. Observed on Gate 4 browser smoke: 20+ fetches totalling ~1.7MB transferred every time the user returns to For You.

The `poolRef` in-memory cache inside `useForYouContent` is component-scoped, so unmount destroys it. Same for `useMoodRoomsRow`'s `poolCacheRef`. The localStorage weekly-pool cache survives, but the hook still fires the thumbnail RPC on remount to keep previews fresh.

Impact: noticeable latency cost (~1-2s) on every tab bounce. Predates Phase 4.5 — this is how Phase 4 shipped — but now more visible because the mood rooms RPCs add a few more fetches to the tab-remount waterfall.

**Not fixed in Phase 4.5.** Accepted as pre-existing architecture; fixing properly requires hoisting the candidate pool + row data out of the component scope (a store / context / Zustand / module-level cache with session-bound TTL) so the data survives tab unmount. That's a meaningful rewrite of `useForYouContent`'s cache model, too large to land inside a Gate 4 hotfix.

**Action for Phase 5:** design a session-scoped store for For You's candidate pool + row results + slider state. Mood rooms piggyback on the same pattern (their weekly pool is already persisted but the previews aren't). Target: tab-switch cost drops to zero RPCs for returns within N minutes; re-fetch only on genuinely stale data (slider change, provider change, session timeout).

**Phase target update:** originally Phase 5 Workstream E. Deferred at Phase 5 close pending the telemetry agent's findings on warm-path p95 + cold-start incidence (run 2026-05-11) — those decisions feed into IN-468 (SWR cache) and IN-469 (cold-start mitigation), which interact with the IN-462 store shape. Re-targeted to Phase 5.5.

**Status:** ⏳ Not yet incorporated (Phase 5.5).

### IN-463: Hybrid LLM labelling for anchored mood rooms

**Source:** Phase 4 strategy review — title-anchored mood rooms shipped with "If you love {anchor}" labels in v1.

**Detail:** Phase 4.5 redirect ships with literal-anchor naming. A future iteration could replace these with LLM-generated thematic labels (e.g. "Tarantino-style hangouts" instead of "If you love Once Upon a Time in Hollywood"). The pattern: pass anchor + top-N closest titles to gpt-4o-mini for a thematic name + one-sentence description. Cache labels keyed on `(anchor_tmdb_id, version_hash)` so the same anchor across users doesn't trigger duplicate LLM calls.

**Pre-requisites:**
- Stand up the first request-time LLM Edge Function in this codebase (see H1 from the Mood Rooms Anchored Investigation report — pattern to copy is `embed-new-titles/index.ts`)
- Add a `mood_room_anchor_labels` table or equivalent kv cache
- Rate-limit handling for the Edge Function (none exists today)

**Why deferred:** "If you love {anchor}" is functional and honest. The probe report Section 5 confirmed the rooms read fine with literal naming. LLM labelling is polish, not a structural fix.

**Trigger to revisit:** post-Phase-4.5 telemetry showing low CTR specifically attributed to the literal naming (e.g. user dwell on the row but low room-tap-through; suggests the names aren't compelling enough). Or strategist preference once the anchored row is stable.

**Phase target:** Phase 4.5 fast-follow.

**Status:** ✅ Incorporated (April 2026). Migration 034 (`mood_room_anchor_labels`) added `mood_rooms.anchor_label_text` and `mood_rooms.anchor_label_generated_at`. New `label-anchor-room` Edge Function generates thematic labels via the LLM, called server-side from `render-foryou-rows`. Replaces literal-anchor naming on anchored rooms only; global mood rooms keep their cluster-derived labels.

### IN-464: Detail-page "Make a room from this title" feature

**Source:** Phase 4 strategy review — anchored rooms enable a Spotify-Song-Radio analogue at the detail-page level.

**Detail:** Once anchored mood rooms are stable and the room-generation primitive is exposed at `src/lib/recommendations-v2/anchoredRoom.ts`, the detail page gains a "Mood room from this" affordance. Tapping generates an anchored room around the current detail-page title using the user's services. Optionally savable as a pinned room (which would reintroduce per-user room persistence — to be designed when this lands).

**Pre-requisites:**
- Phase 4.5 anchored rooms shipped and stable ✅ (the primitive `buildAnchoredRoom` exports from `src/lib/recommendations-v2/anchoredRoom.ts` as of the redirect)
- Decision on persistence model for saved rooms (new `user_anchor_rooms` table, or a generalised "saved lists" model)
- UI design for the detail-page affordance

**Why deferred:** the room-generation primitive landed in Phase 4.5 to enable this; the remaining work is UI + storage decision, not a recommendation-engine decision.

**Phase target:** Phase 6+.

**Status:** ⏳ Not yet incorporated.

### IN-465: Catalogue-sync gap surfaced by anchored rooms probe

**Source:** Phase 4.5 keyword-less embedding backfill investigation (2026-04-27).

**Detail:** The Mood Rooms Anchored Probe (`docs/v2/Mood_Rooms_Anchored_Probe_2026_04_26.md` §4.1) reported "79.2% on-service embedding coverage (14,492 / 18,298 titles)" and framed the 21% gap as a keyword-precondition issue in the embedding work-queue. The Phase 4.5 backfill investigation showed this framing is wrong:

- **Whole `titles` table:** 20,116 rows; 20,109 embedded. Only **7 titles** in the entire catalogue lack embeddings, all of them TMDb-deleted stubs (404 on `/movie/{id}` or `/tv/{id}`) with no overview, no cast, no director, no runtime — genuinely un-enrichable.
- **The "21% on-service gap" is 3,807 tmdb_ids** that appear in `streaming_availability` (heavily Prime-skewed: 6,333 stream-type rows for ~3,500 distinct titles, then Apple 491, Channel 4 195, ITVX 85, Netflix 63) but are **absent from the `titles` table entirely**. Sample tmdb_ids skew toward low numbers (`tv/3`, `movie/68`, `movie/72`…) — old catalogue or region-edge titles outside `scripts/sync-content.ts`'s discover sweep.

The keyword-less embedding precondition is fine — relaxing it would bring in 7 unembeddable stubs. The actual gap is on the content-sync side. Three suspect causes (no investigation yet): (a) `sync-content.ts` discover sweep doesn't cover these IDs; (b) the SA→TMDb confirmation step has been dropping them silently (note `tmdb_confirmed: false` flag may already track this); (c) the SA sync writes `streaming_availability` rows even when the `titles` upsert fails.

**Operational scope:** ~3,800 backfilled titles × full enrich is well within budget — TMDb at 50 req/sec is ~80 seconds of API time; embedding cost ~$0.05. The work is in writing/running the script, not paying for it.

**Two questions to answer upfront when this gets prioritised** (before any backfill code):

1. **Why does Prime fall outside the discover-sweep?** Test against TMDb directly. If it's a discover-endpoint quirk (e.g. `with_watch_providers=9` returns a partial set on Prime UK that excludes back-catalogue), the fix is potentially a Prime-specific discover query — paginate with date-range buckets, switch to `popularity.asc` over older years, or use a complementary endpoint (`/discover/movie?with_watch_monetization_types=flatrate&with_watch_providers=9`). If it's instead a region/availability filter issue (e.g. SA API surfacing a title to a UK Prime user that TMDb doesn't list as UK Prime), that's a different shape of fix — likely a tolerance loosening on the SA→TMDb confirmation step rather than a discover change. Diagnose first, fix appropriately.

2. **Are the 3,807 missing titles concentrated in any genre / era / popularity tier?** Run a profile against `streaming_availability` joined with whatever metadata exists on the SA-supplied rows (release_year, genres, original_language). The decision changes significantly: if it's "obscure Prime back-catalogue from before 2010 that nobody searches for", the fix is low-priority and a one-off backfill is sufficient. If it's "current Prime exclusives users actually want" (recent releases, high IMDb rating, English-language), the fix is high-priority and may justify a recurring sync improvement, not just a backfill.

Sample tmdb_ids from the original investigation already skew toward low numbers (`tv/3`, `movie/68`, `movie/72`…) which suggests "old catalogue" — but that's eyeballed, not rigorous. The profile run is a 30-minute query, well worth doing before scoping the fix.

**Why deferred:** anchored mood rooms ship cleanly at the current coverage. The gap silently underweights ~3,800 titles regardless of ranking strategy (anchored or global) — same effect on both. Closing the gap is a content-sync improvement, not a Phase 4.5 ranking concern.

**Phase target:** post-Phase-4.5 investigation. Likely a one-off backfill script + a sync-pipeline audit.

**Phase 5 status:** scoped into Workstream F (one-off backfill script `scripts/backfill_missing_titles.ts`). Deferred — script not authored, profile-and-discover-fix questions in this entry are still unanswered. Re-targeted to Phase 5.5 / 6.

**Status:** ⏳ Not yet incorporated (Phase 5.5 / 6).

### IN-466: For You cold-start latency — broader architecture review

**Source:** Joe's testing feedback (2026-04-30): "The first load on For You is too slow. It's a real issue that I don't really consider viable for me to go to market with."

**Detail:** The For You surface's cold path (no localStorage caches warm) takes 4-6 seconds to render. Three quick wins have already shipped under the Phase 4.5 redirect umbrella:

1. **localStorage cache for `availableTmdbIds`** — 10-minute TTL keyed on sorted service IDs. Second open within 10 minutes is instant. (April 2026, hardFilters.ts)
2. **Migration 035: collapse `get_available_tmdb_ids` from TABLE → JSONB array** — eliminates 20 paginated round-trips for ~18k IDs in favour of one. Saves ~1.5-2s on cold start over WAN. (April 2026, migration 035)
3. **Anchored mood rooms label cache (table + localStorage)** — IN-463 ships with two-tier caching (DB + per-user localStorage), so thematic labels don't add to cold-path latency on repeat opens. (April 2026, migration 034)

**Remaining cold-path components, after the quick wins:**

| Component | Cold-path cost | Reason |
|---|---|---|
| `getV2TasteProfile` | ~100-200ms | Single Supabase row read; profileCache 5-minute in-memory hit |
| `buildFilterSets` (without availability cache) | ~500-800ms | Three parallel Supabase reads (dismissed, thumbsDown, watchlist) + getAvailableTmdbIds (now 1 round trip after 035) |
| `fetchCandidatePool` | ~500-700ms | match_titles_by_vector RPC (500 results) + extended-metadata fetch (top 100 IDs) |
| `useAnchorMoodRooms` | ~600-1000ms | selectAnchors (2 reads + cluster embeddings) + 5 parallel buildAnchoredRoom calls; max-of-set wallclock |
| Background BYW + MoreFrom + Watchlist | non-blocking | Doesn't gate first paint, but adds visible row population delay |

Net floor: **~2-3 seconds for first render after our quick wins**, dominated by RPC round-trip latency × number of queries. Beyond the quick wins, the architecture is fundamentally chatty — cold-start on residential WAN can't go much lower without restructuring the data flow.

**Architectural options to investigate next**, in increasing scope:

1. **Server-side render the first viewport.** An Edge Function that takes (userId, services, sliders) and returns a single JSON payload with the top 20 Recommended For You + 5 anchored mood rooms + Hidden Gems pre-computed. Reduces N round trips to 1. The Edge Function runs in Supabase's network with sub-50ms latency to Postgres, so it's much faster than serial client-side fetches over WAN. Reuses all existing pipeline code (ranker.ts, anchorSelection.ts, anchoredRoom.ts) but exposes a "render the row" endpoint per row type. **Estimated time-to-first-render after this: ~400-600ms.** Biggest impact, also biggest scope.

2. **Persistent localStorage of computed rows.** On every successful For You load, snapshot the resolved rows (Recommended For You ContentItems + anchor previews + etc.) to localStorage with a 1-hour TTL. Next session shows cached rows instantly while fresh data fetches in the background; swap when fresh data resolves. Stale-while-revalidate pattern. Smaller scope than (1); helps repeat-session UX but doesn't help first-ever launch.

3. **Pre-warm via Home tab.** If the user lands on Home first (typical), kick off the For You data fetches in parallel with Home's loads. By the time the user navigates to For You, the data is hot. Adds minor complexity to Home/For You coordination; helpful but doesn't address true cold-start (direct For You launch).

4. **Realtime push for slider changes.** Instead of re-querying the pipeline on slider drag, server pushes pre-computed alternate-slider variants. Heavy infrastructure for a marginal UX win; defer.

5. **Reduce candidate pool size.** Drop from 500 → 300 candidates; see if row quality holds. Simple test, ~300-400ms saved on the cold path. Low-cost A/B if we have the harness ready (Phase 4 rank-eval.ts script).

**Pre-launch viability assessment:** the three quick wins shipped here bring cold-start from ~5s to ~2-3s. Joe's gate is "viable for go-to-market". Whether 2-3s clears the bar is a product call — Netflix does ~2s for similar cold paths over LTE. If it doesn't clear, **option (1) (server-side row render) is the right next investment**, in the order: write the Edge Function in a new `/functions/render-foryou-rows/` directory, return the same shape as `useForYouContent` does today, swap the hook to invoke the Edge Function as its primary data source with the existing client-side path as fallback.

**Phase target:** discuss with strategist after Joe re-tests the post-quick-wins build. If still not viable, schedule **option (1)** as a dedicated Phase 4.7 or treat as a pre-launch blocker.

**Status:** ✅ Incorporated (April 2026). Server-side render via `render-foryou-rows` Edge Function shipped as a dedicated phase (IN-466 kick-off brief). Architecture: path-(a) mirror copy of `recommendations-v2/` + `taste-v2/` into `supabase/functions/_shared/` per ADR-011, with `shared-tree-drift` CI check guarding against the two trees diverging. Auth: service-role + manual JWT decode + `withUserScope(uid)` helper, after the `auth-spike` showed user-JWT-scoped reads cost ~280ms of the 600ms budget in RLS overhead. Latency: warm p50 ~850ms wall (700ms server), cold 5-12s (Edge Function instance cold-start dominates). Cold case mitigated by Variant A warm-pinger (App.tsx fires `warmup-foryou` at mount). Client fallback contract intact: any Edge failure (5xx, malformed JSON, network, >1.5s timeout) falls through to the existing `useForYouContent` pipeline. Three follow-ups filed — IN-467, IN-468, IN-469 below — capturing the deliberate v1 trade-offs that should be revisited post-launch.

---

### IN-467: Long-term consolidation of `_shared/recommendations-v2/` mirror

**Source:** IN-466 implementation — Cowork pushed back on the path-(a) "single canonical copy" framing as half-true. Mirror is canonical for Edge consumers but the client still imports from `src/lib/`. Path-(b) was the only route to one true copy across both runtimes.

**Detail:** ADR-011 mandates shared modules live in `supabase/functions/_shared/`; that's the locked Edge Function pattern. To consolidate the *client* side as well would require either (a) refactoring `recommendations-v2/` + `taste-v2/` into a runtime-portable package consumed by both client and Deno via a build step, or (b) fully migrating the client off the mirror by routing all its calls through Edge Functions (longer-term: client only consumes Edge Function APIs, no shared code).

The IN-466 build shipped option (a) of the original brief — mirror copy with a `shared-tree-drift` CI check. The CI check makes drift visible but doesn't eliminate it; emergency client-only fixes can ship with a `drift-allowed: <reason>` escape hatch in the PR body.

**Why this matters:** every Phase 5+ change to weights, scoring, or row composition has to ship to *both* trees. The CI check enforces this, but the cognitive load is real and accumulates over months.

**Phase target:** revisit after 1-2 months of accumulated Edge Function usage. If drift incidents are zero or low, leave as-is. If drift becomes a maintenance tax, schedule path-(b) as a dedicated phase (likely Phase 5/6 boundary).

**Status:** ⏳ Filed; revisit after launch + 1-2 months of ops experience.

---

### IN-468: Variant B — stale-while-revalidate localStorage snapshot of For You payload

**Source:** IN-466 phase summary — deferred per Cowork's "ship Edge Function FIRST, measure, then add snapshot" framing.

**Detail:** Variant A (warm-pinger at app boot) closes the cold-start gap to ~800ms warm. For instant-paint UX, Variant B caches the rendered payload in localStorage with stale-while-revalidate semantics:
- On `useForYouContent` mount: read cache, render immediately if hit. Fire fresh fetch in background. Replace state when fresh data lands.
- TTL: 1 hour; invalidate on any explicit signal (thumbs ±, watchlist ±, marked watched, not interested), slider change, service change.
- Storage: `videx.foryou_render.v1.{userId}` (~30 KB gzipped per user — confirmed via the `_measure_foryou_pool_size` script).

**Trade-off:** the cache adds an instant-paint UX win but introduces invalidation complexity. The existing client-side caches (filter sets cache, anchor selection weekly cache) achieve a similar effect for repeat visits within a session, so the marginal value is for true cold-launch ("first open after the device booted").

**Phase target:** revisit if the IN-466 warm-path p95 turns out to need it post-launch. Joe's gate is "viable to GTM"; if warm path holds at ~1s, defer indefinitely.

**Status:** ⏳ Deferred; revisit post-launch if needed.

---

### IN-469: Cold-start mitigation continuation (warm-pinger evolution)

**Source:** IN-466 phase summary — Variant A shipped this phase; further options noted for future.

**Detail:** The cold-start profile measured during IN-466 build:
- Cold-cold (first invocation after deploy): 12s
- Cold instance (first batch): 5-6s
- Warm steady-state: 800-1300ms

Variant A (App.tsx-fired warm-pinger at mount) closes the cold gap *for users who open the app and wait a few seconds before navigating to For You*. Doesn't help if the user opens directly on the For You tab in <2s.

Three further options on the table:
1. **Pre-warm via Home tab** (original IN-466 entry option 3). When the user lands on Home, fire the full `render-foryou-rows` call in parallel with Home's loads. By the time they navigate to For You, data is hot. Adds Home/For You coordination complexity.
2. **pg_cron-driven warm-pinger.** Schedule `warmup-foryou` invocation every 5 min via pg_cron. Keeps an Edge Function instance permanently warm. Costs ~8.6k invocations/month (free at our scale on Pro tier).
3. **Variant B as the answer** (see IN-468). Skip cold-start entirely by reading from localStorage cache on first paint.

**Phase target:** measure cold-start incidence in production telemetry first. If <10% of For You opens hit cold, no further work needed. If higher, schedule option 2 as the cheapest fix.

**Status:** ⏳ Variant A shipped (App.tsx mount, IN-466). Further options deferred pending production cold-start telemetry.

---

### IN-470: Wire `featuredLastWeek` through to the Edge Function

**Source:** Code review of IN-466 implementation (TypeScript review S7, 2026-04-30).

**Detail:** The client-side `useAnchorMoodRooms` hook reads the previous week's anchor selection from localStorage (`videx.anchor_rooms.weekly.v1.{userId}.{weekBucket-1}`) and uses it to apply a variety penalty — anchors featured last week are excluded from this week's selection so the row feels fresh week-on-week.

When the Edge Function path is taken (the default in IN-466), this signal is not threaded through. The Edge Function calls `selectAnchors` with no `featuredLastWeek` filter, so week-on-week variety degrades silently. The freshness within the current week still works (anchor selection is cached for 7 days locally).

The Edge Function originally accepted a `featuredLastWeek?: string[]` field in its request body, but the field was always passed as `[]` because the threading from `useForYouContent` → `tryRenderForYouEdge` was never wired. Dropped during the IN-466 simplification pass to remove dead code; revive when the threading is implemented.

**Fix when needed:** in `useForYouContent`, before invoking `tryRenderForYouEdge`, read the previous week's anchor cache from localStorage (use the same `buildWeekKey` helper from `useAnchorMoodRooms`), pass the keys through. Re-add the `featuredLastWeek?: string[]` field to the request body shape and the Edge Function orchestrator, plus the `selectAnchors` filter.

**Phase target:** revisit when production telemetry shows users notice the same anchors recurring week-on-week. Likely Phase 5 or later.

**Status:** ⏳ Filed; revisit if week-on-week anchor variety becomes a noticed problem.

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

**Status:** ✅ Incorporated (Phase 5 — migration 038 replaces the open policy with a `username_available(check_username text)` SECURITY DEFINER RPC; `AuthContext.checkUsernameAvailable` rewired to use `supabase.rpc(...)` instead of selecting from `profiles` directly; anon SELECT on `profiles` now denied).

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

**Status:** ✅ Partially incorporated (Phase 5 — Vault storage migration done, cryptographic rotation deferred). Migration 039 + cron file edits move the inline JWT out of source into Supabase Vault. The four affected pg_cron jobs (`daily-content-sync`, `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`) now read `vault.decrypted_secrets` at job execution. **Same JWT value remains** — full cryptographic rotation deferred to Phase 6 because the Supabase dashboard UI no longer exposes a path to issue a new long-lived JWT signed by the current ECC signing key (new keys are opaque `sb_secret_…` tokens that fail `verify_jwt = true` on Edge Functions). Phase 6 picks up rotation when Supabase ships JWT-format secret keys or we refactor Edge Function auth to validate opaque tokens. CI guard against re-introduction (`grep 'Bearer eyJ'` in SQL) — not added; the migration's removal of inline JWTs is the prevention.

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

**Re-audit during Phase 5 review (2026-05-07):** the original framing above was incomplete. Actual state:

- ✅ **Backend RPC `delete_own_account` exists in production.** Referenced in [`027_function_search_path_pin.sql:28`](supabase/migrations/027_function_search_path_pin.sql:28) — its `search_path` is pinned, which means it's already deployed. Typed in `database.types.ts:1479`.
- ✅ **Client wiring is in place.** [`AuthContext.tsx:132-142`](src/components/AuthContext.tsx:132) calls `supabase.rpc('delete_own_account')`, then clears localStorage and signs out. [`App.tsx:914`](src/App.tsx:914) threads `auth.deleteAccount` to `ProfilePage`'s `onDeleteAccount` prop.
- ❌ **The UI is intentionally gated off.** The "Delete Account" button inside the confirmation modal at [`ProfilePage.tsx:887-893`](src/components/ProfilePage.tsx:887) is `disabled` with `cursor-not-allowed`, and the modal carries the "not yet available" notice. Clicking it does nothing.
- ⚠️ **The RPC's definition is NOT in any version-controlled migration.** It was created via Studio at some point (likely Phase 3) and lives in production unaudited from the repo side. Migration 027 only pins its `search_path`. There's no record in source control of what the RPC actually does — what tables it cascades across, what `auth.users` row deletion behaviour, what error handling. This is a real audit gap.

**Phase target:** originally Phase 5 (per Phase 5 brief §1.3). **Did not ship in Phase 5.** Re-targeted to Phase 5.5.

**Phase 5.5 implementation steps:**

1. **Audit the existing RPC.** Run `\df+ public.delete_own_account` in Studio to dump the function body. Verify it cascades across all six user-scoped tables AND deletes the `auth.users` row. Compare against the brief's GDPR Article 17 list.
2. **Capture the RPC in a new migration** (e.g. `041_delete_own_account.sql`) so the source-of-truth is git-tracked. Use `CREATE OR REPLACE FUNCTION` so the production state is reproduced from git on a fresh project. Reference IN-PX-31 (cron source-of-truth confusion) — same anti-pattern.
3. **Test on a throwaway account.** Create a test user via Studio, populate it with sample interactions / watchlist / preferences, run the RPC, verify zero rows remain across all tables and the auth.users row is gone.
4. **Flip the UI gate.** Replace the disabled button at `ProfilePage.tsx:887-893` with one that fires `onDeleteAccount`, shows a loading state during the RPC call, handles error toasts, and on success navigates back to the sign-in screen.
5. **Add a final-confirmation flow.** GDPR-compliant pattern: type-username-to-confirm before the destructive action fires. Current modal only has a single click between intent and execution.

**Status:** ⏳ Re-targeted to Phase 5.5 — wiring exists in code, UI gate + RPC audit + version-controlled migration are the missing pieces.

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

### IN-XPS-010: Supabase Pro→Free downgrade risk inventory

**Source:** Cost optimisation question raised during the IN-466 build (April 2026).

**Detail:** Pre-launch, the question came up of downgrading the Supabase project from Pro to Free to reduce monthly spend. The codebase has several Pro-tier dependencies that would silently break on Free. Documented here so the trade-off is explicit before anyone tries it:

**What breaks on Free:**

1. **pg_partman partition creation.** Migration 014 sets up monthly partitioning of `card_impressions` via daily pg_cron maintenance. If pg_cron stops on Free, **next month's partition isn't created → INSERT failures → impression data loss** (cross-references IN-XPS-003 which flags this exact failure mode for partman monitoring).
2. **Scheduled cron jobs.** `daily-content-sync` (migration 006), `enrich-new-titles` (Phase 0.5 cron), monthly mood-rooms-recluster trigger — all stop firing if pg_cron isn't available. Catalogue goes stale.
3. **Project auto-pause.** Free projects pause after ~1 week of inactivity. App breaks until first request restarts it (~30s cold). Bigger issue once there are users than during dev.
4. **Bandwidth ceiling.** Free is 5 GB/month. Each For You render is ~140 KB. ~35,000 renders/month hits the cap; at 2-3 renders/user/day, that caps active users at ~50-100.
5. **Database size ceiling.** Free is 500 MB. Titles + embeddings alone are ~100 MB+; add `card_impressions`, `user_interactions`, `streaming_availability`, `taste_profiles` and the ceiling could already be near.
6. **Daily backups.** Pro has PITR + daily backups. Free has weekly snapshots only. Less safety net.

**What does NOT break on Free:**

- All Edge Functions (sync-incremental, embed-new-titles, enrich-new-titles, label-anchor-room, render-foryou-rows, warmup-foryou). Free's 25s timeout is well above the 12s cold path.
- pgvector + HNSW indexes work the same.
- RLS, auth, all table queries — unchanged.
- Local dev workflow (live reload, APK build) — unaffected.

**If a downgrade is genuinely needed pre-launch:**

1. Disable scheduled cron jobs first (or accept stale catalogue).
2. Manually create `card_impressions` partitions ahead of time covering the planned downgrade window.
3. Trigger the project at least weekly to prevent auto-pause.
4. Verify current DB size is comfortably under 500 MB.

**Reversibility:** the downgrade is reversible — re-upgrading restores everything. So a temporary downgrade is technically possible, but it's not free in operational risk.

**Status:** ⏳ Documented; no action unless cost optimisation comes up again.

### IN-XPS-011: CI guard against `verify_jwt = false` drift on user-callable Edge Functions

**Source:** Security review of IN-466 (2026-04-30, hardening item H1).

**Detail:** `extractUserIdFromJwt` in `supabase/functions/_shared/userScope.ts` decodes the JWT payload without verifying the signature, relying on Supabase's edge-runtime gateway to pre-verify the token (default `verify_jwt: true`). This is correct under current deploy posture but creates a silent-fail-open risk: if a future engineer disables `verify_jwt` for any user-callable Edge Function (e.g. to allow no-auth invocations), `extractUserIdFromJwt` would happily decode an attacker-forged `sub` claim from any well-formed unsigned JWT.

**Fix:** add a CI check that fails the build if any function under `supabase/functions/` has `verify_jwt = false` set in `supabase/config.toml` without a co-located `// SECURITY:` justification comment in the function's `index.ts`. Cheap to add, catches the failure mode at PR review.

**Alternative:** add an explicit `jose.jwtVerify(token, JWKS)` call in `extractUserIdFromJwt` cached behind a module-level promise — costs ~10ms per cold start, negligible vs RLS overhead we'd pay otherwise. Less ergonomic than the CI check.

**Phase target:** pre-public-launch hardening sweep. Do not ship to production users without one of the two mitigations.

**Status:** ✅ Incorporated (Phase 5 — chose the CI-check option). Six new per-function `supabase/functions/<name>/config.toml` files explicitly set `verify_jwt = true`, codifying the Supabase Edge Runtime default so a regression is git-detectable. New `.github/workflows/edge-fn-jwt-guard.yml` triggers on PRs touching `supabase/functions/**` and fails any PR where `verify_jwt = false` appears in a per-function config outside a reserved `_no_auth_/` namespace.

### IN-XPS-012: Promote parity probe to CI smoke test

**Source:** Architecture review of IN-466 (2026-04-30, "Pattern Drift latent").

**Detail:** ADR-012 calls out that the fallback path (existing client pipeline) and the Edge Function path must produce equivalent output. The `shared-tree-drift` CI workflow enforces *that the trees match at file level*, but a single PR can legally update both trees in lockstep with subtly different logic and the workflow passes. The only real safeguard against semantic divergence is the `scripts/_inspect_foryou_parity.mjs` probe — currently a one-shot manual script.

**Fix:** create a fixture user in a dedicated CI-only Supabase project (or reuse the dev branch), seed deterministic interaction history, run the parity probe in CI on every PR that touches `src/lib/recommendations-v2/` or `supabase/functions/_shared/recommendations-v2/`. Fail if the Edge output diverges from the client output (same titles, same order modulo the documented variance bands).

**Trade-off:** adds CI cost (one full Edge Function invocation per relevant PR) and requires the fixture user to be carefully maintained. But the gap is real — without it, "fallback would silently produce stale rankings" is a documented risk with no enforcement.

**Phase target:** revisit after the first `drift-allowed:` escape-hatch use, or after the first production incident traceable to client-vs-Edge divergence.

**Status:** ✅ Workflow file added (Phase 5); enforcement pending secrets. New `.github/workflows/foryou-parity.yml` triggers on push to `phase-*` and PR to `main`. Soft-skips with a warning when `PARITY_*` repo secrets aren't configured. Once Joe configures secrets (`PARITY_USER_JWT`, `PARITY_USER_ID`, `PARITY_SERVICES`, `PARITY_SUPABASE_URL`, `PARITY_SUPABASE_SERVICE_ROLE_KEY`) for a test user flagged via `profiles.is_test_user` (column already exists per IN-PRE-001), the probe enforces parity on every relevant PR.

### IN-XPS-013: Pre-launch CORS tightening on user-callable Edge Functions

**Source:** Security review of IN-466 (2026-04-30, hardening item H2).

**Detail:** `render-foryou-rows` (and other user-callable Edge Functions) currently set `Access-Control-Allow-Origin: *`. Because the function requires a valid Bearer token, `*` doesn't grant cross-origin data access — but it does allow any origin to trigger render compute against a stolen token, making credential-theft consequences worse than they need to be.

**Fix when public web build ships:** tighten CORS to known origins — the Capacitor app uses `https://localhost` (file:// equivalent), and any future web build will have a known origin like `https://app.videx.tv`. Add both to an allow-list. Today, `*` is correct because the dev workflow uses arbitrary LAN IPs.

**Phase target:** pre-public-launch hardening sweep, alongside IN-XPS-011.

**Status:** ✅ Incorporated (Phase 5). New shared helper `supabase/functions/_shared/cors.ts` exports `corsHeaders(origin)` that echoes the Origin header only when allow-listed. Allow-list: `capacitor://localhost`, `https://localhost`, regex `^http://localhost(:port)?$`, plus a `VIDEX_ALLOWED_DEV_ORIGINS` env hook for live-reload over LAN IP. Applied to both browser-callable Edge Functions (`render-foryou-rows`, `label-anchor-room`); the four cron-only functions don't face a browser. Verified post-deploy: allow-listed origin gets `Access-Control-Allow-Origin: capacitor://localhost` echoed back; unknown origin gets no `Access-Control-Allow-Origin` header (browser treats as rejected).

---

## Phase 5.5 follow-ups (filed 2026-05-07 from Phase 5 review pass)

These came out of the post-merge review of PR #4 (security-sentinel + data-integrity-guardian + performance-oracle + kieran-typescript-reviewer + architecture-strategist + code-simplicity-reviewer + a doc audit) plus a Phase 5 close-out review of legal disclosures. IN-PX-21 through IN-PX-33 are quality/hardening; IN-PX-34 and IN-PX-35 are pre-launch legal blockers (privacy policy + GDPR Article 20).

### IN-PX-21: Regenerate `database.types.ts` and delete `as any` casts

**Source:** Phase 5 TypeScript review (kieran-typescript-reviewer) + data-integrity audit.

**Detail:** Phase 5 added migrations 036–038 + table `mood_room_anchor_labels` (migration 034). `src/lib/database.types.ts` predates these and was NOT regenerated. Phase 5 commits worked around the staleness with three `as any` / `(supabase.rpc as any)` / `(supabase.from as any)` casts in `AuthContext.tsx`, `anchorRoomLabels.ts`, and `interactionUpdate.ts`. Each cast suppresses real type signal at exactly the boundaries you most want types for (RPC payload shape, JSONB fields, table schema).

**Fix:** Run `npx supabase gen types typescript --project-id fmusugdcnnwiuzkbjquo --schema public > src/lib/database.types.ts`. Delete each cast that has a "until regenerated" comment. Verify `npx tsc --noEmit` clean. Promote regen to a CI gate on every migration PR going forward (workflow file: `.github/workflows/typegen-check.yml` — run `gen types`, fail if diff against committed file).

**Phase target:** Phase 5.5.

**Status:** ⏳ Filed; trivial implementation, ~30 min.

### IN-PX-22: Embedding fetch caching for MMR

**Source:** Phase 5 performance review (performance-oracle).

**Detail:** `fetchEmbeddingsForCandidates(top 200)` runs on every load (no cache) on both client and Edge paths. Wire payload ~3MB JSON over residential WAN = 600–1500ms transfer alone, dominant new Phase 5 latency cost. The user's top-200 by finalScore is highly stable across loads (taste vector + filters + sliders sticky over hours).

**Fix:** Cache the embedding map keyed on `userId:tasteVectorHash:filterSetsHash`, 24h TTL on the client (localStorage) and per-instance memory on the Edge. Even a 5-minute session cache would help the back-button-into-ForYou case. Files: `src/hooks/useForYouContent.ts:41-66`, `supabase/functions/render-foryou-rows/index.ts` (`fetchEmbeddingsForCandidates`).

**Phase target:** Phase 5.5.

**Status:** ⏳ Filed.

### IN-PX-23: MMR partial-coverage fallback

**Source:** Phase 5 performance review.

**Detail:** When `applyMMR` hits candidates without embeddings (e.g. Hidden Gems or Outside Your Usual rows pulling from below rank 200), it treats redundancy as 0 and falls back to pure `finalScore` ordering for those picks. Net effect: those rows lose intra-row diversity that `applyGenreSpread` actively enforced — same-genre clusters can appear. The current `buildRowFromPool` fallback to `applyGenreSpread` only triggers when the entire embeddingMap is empty, not on partial coverage.

**Fix:** in `applyMMR`, if >50% of selected so far have no embedding, bail out and let the caller fall through to `applyGenreSpread`. File: `src/lib/recommendations-v2/diversity.ts:170-223`.

**Phase target:** Phase 5.5.

**Status:** ⏳ Filed; small change, observable user-facing diversity improvement.

### IN-PX-24: Float32Array + cosine-norm precompute in MMR

**Source:** Phase 5 performance review.

**Detail:** `cosineSimilarity` recomputes vector norms on every call. With ~58M FLOPs per row in the worst case, precomputing each embedding's norm once when building the map saves ~3× on the hot loop. Float32Array (vs `number[]`) further halves memory and is JIT-friendlier under V8 / SIMD-vectorisable.

**Fix:** Change `embeddingMap` shape to `Map<string, { vec: Float32Array; norm: number }>`. Inline the dot-product in `applyMMR`'s inner loop using the cached norm. File: `src/lib/recommendations-v2/diversity.ts:135-147`.

**Phase target:** Phase 5.5 (after IN-PX-22 caching, since both touch the embedding map).

**Status:** ⏳ Filed.

### IN-PX-25: Test coverage for `computeContextualScore` and `applyMMR`

**Source:** Phase 5 TypeScript review.

**Detail:** Both new pure functions are determinism-friendly with non-trivial branching (time buckets × genres × viewing contexts × runtime thresholds for contextual; embedding presence × λ for MMR). Genre-boost tables in `weights.ts` are data, mature today, but anyone editing them needs a regression net. No tests today.

**Fix:** Add ~5 tests in `src/lib/recommendations-v2/__tests__/` (or `scripts/test/`):
- A late-night comedy candidate scores higher than a late-night documentary.
- `with_family` + Horror genre candidate lands below 0.5.
- `applyMMR(λ=1)` returns finalScore-sorted output (no diversification).
- `applyMMR` with empty embeddingMap returns finalScore-sorted output (graceful degradation).
- `applyMMR` with all candidates same embedding returns top-1 only (perfect redundancy).

**Phase target:** Phase 5.5.

**Status:** ⏳ Filed.

### IN-PX-26: `buildRowFromPool` options object

**Source:** Phase 5 TypeScript review + architecture review.

**Detail:** `buildRowFromPool(scored, sliders, config, getServices?, embeddingMap?)` is now five positional parameters, two of which are optional. Callers that want to pass `embeddingMap` must pass `undefined` for `getServices`. Adding a sixth parameter (likely in Phase 6+) compounds the awkwardness.

**Fix:** Convert to options object: `buildRowFromPool(scored, sliders, { config, getServices, embeddingMap })`. Touch points: `useForYouContent.ts` (3 call sites), `render-foryou-rows/index.ts` (3 call sites incl. `buildOutsideYourUsual`).

**Phase target:** Phase 5.5 (do before any Phase 6 feature adds a 6th param).

**Status:** ⏳ Filed.

### IN-PX-27: `ViewingContext` type to source of truth

**Source:** Phase 5 TypeScript review.

**Detail:** `PipelineContext.viewingContext` is typed `string | null` but `contextual.ts:94` casts to `ViewingContext` (the union currently in `weights.ts`). Type narrowing happens at the wrong layer.

**Fix:** Move `ViewingContext` from `weights.ts` to `types.ts`, change `PipelineContext.viewingContext` to `ViewingContext | null`, drop the cast. Bad strings get caught at the `profiles.viewing_context` boundary instead of silently neutralising at score time. Mirror to `_shared/recommendations-v2/types.ts` and `_shared/recommendations-v2/weights.ts`.

**Phase target:** Phase 5.5.

**Status:** ⏳ Filed.

### IN-PX-28: `edge-fn-jwt-guard` gap — central `supabase/config.toml`

**Source:** Phase 5 security review (security-sentinel).

**Detail:** Current `.github/workflows/edge-fn-jwt-guard.yml` greps `supabase/functions/*/config.toml`. A future PR setting `[functions.<name>] verify_jwt = false` in the **central** `supabase/config.toml` would bypass the guard.

**Fix:** Add a second grep step targeting `supabase/config.toml` for `verify_jwt\s*=\s*false`. Trivial.

**Phase target:** Phase 5.5.

**Status:** ⏳ Filed.

### IN-PX-29: `username_available` rate-limit at gateway

**Source:** Phase 5 security review.

**Detail:** Migration 038's RPC returns a boolean — no data leak — but enables one-at-a-time username enumeration. With no rate limit, an attacker can enumerate the username space cheaply for credential-stuffing reconnaissance.

**Fix:** Add per-IP rate-limit either via Supabase Auth Rate Limits (if the dashboard surface allows it for arbitrary RPCs), or via Cloudflare in front of `/rest/v1/rpc/username_available` once a hosted public web origin exists. Until public web ships, low priority.

**Phase target:** Phase 6 (pre-public-launch).

**Status:** ⏳ Filed.

### IN-PX-30: Defence-in-depth in `extractUserIdFromJwt`

**Source:** Phase 5 security review.

**Detail:** `extractUserIdFromJwt` decodes JWT payload without verifying the signature, relying on Supabase gateway `verify_jwt = true` to reject unsigned tokens. Phase 5 locked in per-function `config.toml` configs to enforce this. But if a developer later moves a function under `_no_auth_/` AND calls `extractUserIdFromJwt`, they'd have a forgeable user ID with no signature check. The `_no_auth_/` directory is empty today.

**Fix:** Add a runtime assertion in `extractUserIdFromJwt` that throws if the function path is under `_no_auth_/`. Or — simpler long-term — replace the hand-rolled decode with `jose.jwtVerify(token, JWKS)` cached behind a module-level promise (~5ms cold-start cost, negligible).

**Phase target:** Phase 6 (pre-public-launch).

**Status:** ⏳ Filed.

### IN-PX-31: Trim `supabase/cron/*.sql` source-of-truth confusion

**Source:** Phase 5 data-integrity review.

**Detail:** Migration 039 unschedules + reschedules four cron jobs with Vault reads. The three `supabase/cron/*.sql` files (Phase 0.5–2 era operational automation) were also updated in Phase 5 to use Vault reads — but they have the same jobname-based upsert behaviour as the migration. Result: two source-of-truth files for the same registration. If anyone edits the schedule in one place but not the other, they'll silently overwrite each other on next re-apply.

**Fix:** Either (a) make migration 039 the sole owner — add a comment header to each `supabase/cron/*.sql` saying "MANAGED BY MIGRATION 039 — DO NOT RE-APPLY"; or (b) delete the three files entirely (their schedules now live in 039). Recommend (b); their current existence is purely historical.

**Phase target:** Phase 5.5.

**Status:** ⏳ Filed.

### IN-PX-32: Mirror tree consolidation

**Source:** Phase 5 architecture review (architecture-strategist).

**Detail:** `src/lib/recommendations-v2/*` and `supabase/functions/_shared/recommendations-v2/*` are bit-for-bit mirrors enforced by `shared-tree-drift` CI. Phase 5 brought the mirror to 11 files. The drift control is necessary but reactive — every refactor pays a mirror tax.

**Fix:** Move leaf modules with no app-only dependencies (`weights.ts`, `contextual.ts`, `diversity.ts`, `recency.ts`, possibly `titleAdapter.ts`) into `supabase/functions/_shared/recommendations-v2/` as the source of truth. `src/lib/recommendations-v2/` re-exports them. Halves the drift surface without a build step. Modules that pull in app-only imports (`anchoredRoom.ts` uses `supabase` singleton; `ranker.ts` uses `@/lib/taste-v2/types`) stay mirrored.

**Phase target:** Phase 6 boundary or earlier if drift incidents > 2 in any 30-day window (per IN-467).

**Status:** ⏳ Filed; supersedes part of IN-467's "evaluation criteria".

### IN-PX-33: Property-level parity probe

**Source:** Phase 5 architecture review.

**Detail:** `foryou-parity` workflow runs `scripts/_inspect_foryou_parity.mjs` as a smoke test. It catches semantic divergence at row-composition level on a fixture user. As Phase 5 doubled the parity surface (contextual + MMR + embedding fetch in BOTH paths), the next refactor will likely break parity in subtle ways the smoke probe misses.

**Fix:** Extend the probe to property-level: deterministic seed + golden output checked into `scripts/test/foryou-parity-golden.json`. Re-run on every PR touching `recommendations-v2/` or `render-foryou-rows`. Diff against golden. Update golden via explicit `--update-golden` flag in the script when the change is intentional.

**Phase target:** Phase 6 / before any new Edge-client paired feature.

**Status:** ⏳ Filed.

### IN-PX-34: Privacy Policy text + functional legal links

**Source:** Phase 5 close-out review (2026-05-07) — gap surfaced when Joe asked whether the privacy text was app-specific or boilerplate.

**Detail:** Two distinct surfaces, with one already-good and one a pre-launch blocker:

**Already in good shape (no action):** Profile → Privacy & Data → "What Videx learns about you" modal at [`ProfilePage.tsx:814-836`](src/components/ProfilePage.tsx:814) is custom-written and lines up with the Detail Page Signal Capture Spec. Lists exactly what gets tracked ("what you rate, what you add to your watchlist, what you mark as watched, titles you mark as not interested, which services you tap to start watching, titles you tap to view details, how long you spend looking at title details, your genre and taste preferences, your streaming service subscriptions") and explicitly what doesn't ("location, other apps, anything outside Videx, actual viewing on streaming platforms"). This is the user-facing privacy disclosure for IN-XPS-001 and is correctly app-specific.

**Pre-launch blocker (action needed):** at the signup flow, [`OnboardingFlow.tsx:636-637`](src/components/OnboardingFlow.tsx:636) reads:

> *"By creating an account, you agree to our Terms of Service and Privacy Policy"*

The "Terms of Service" and "Privacy Policy" text is styled as `<span className="text-primary">` to look like links — but they are plain `<span>` elements, not anchors. There is no `PrivacyPolicy.tsx` page in `src/components/`, no `/privacy` or `/terms` route in `App.tsx`, no markdown file under `docs/legal/`. Users visually see "links" that go nowhere.

**Why it's blocking:** UK GDPR + Apple App Store + Google Play Store all require a functional privacy policy URL/page accessible BEFORE account creation. Shipping with non-functional placeholder links is a store-rejection risk for Phase 6 (iOS in particular — Apple's review explicitly checks for working links).

**What needs writing (app-specific, not boilerplate):**
- **What data we collect** — match the "What Videx learns" modal content exactly. Reference Detail Page Signal Capture Spec.
- **Where it's stored** — Supabase project (London region, UK data residency). Pro tier with PITR backups.
- **Third parties** — TMDb (content metadata), OMDB (IMDB ratings), Streaming Availability via RapidAPI (deep link URLs), OpenAI (embeddings + LLM labels for mood rooms). Each call out what's sent and whether PII flows.
- **What we don't do** — no ad networks, no cross-app tracking, no location, no ML training on user content, no data sales.
- **User rights** — access, deletion (link to IN-XPS-006 once landed), portability (link to IN-PX-35 once landed), correction.
- **Retention** — `card_impressions` rolled up after 90 days (per migration 014); rest persists until account deletion.
- **Contact** — support email, postal address (UK ICO requires this).

**Implementation:**
1. Author `docs/legal/privacy-policy.md` and `docs/legal/terms-of-service.md` as version-controlled source.
2. Render via a new `PrivacyPolicyPage.tsx` / `TermsPage.tsx` component reading the markdown (use `react-markdown` or copy text inline).
3. Wire signup-flow spans to clickable links opening these pages (modal sheet on mobile, route on web).
4. Add a "Legal" entry to Profile → Settings linking to both.

**Phase target:** Phase 5.5 (block-of-work alongside IN-XPS-006 — same legal-disclosures cluster).

**Status:** ⏳ Filed.

### IN-PX-35: Functional "Download my data" — GDPR Article 20

**Source:** Phase 5 close-out review (2026-05-07).

**Detail:** [`ProfilePage.tsx:771`](src/components/ProfilePage.tsx:771) has a "Download my data" button that on click fires:

```ts
toast.success("Download started", { description: "Your data export will be ready shortly." })
```

That's the entire implementation. No actual data export happens. The toast is misleading — there is no download started, no email queued, no file generated.

**Why it's blocking:** GDPR Article 20 (right to data portability) requires that data subjects can obtain their personal data in "a structured, commonly used and machine-readable format." UK GDPR carries the same requirement post-Brexit. Shipping with a fake-success toast is worse than not having the button at all (it actively misrepresents what the app does, which is a separate consumer-protection issue beyond GDPR).

**What needs to ship:**
1. **Backend** — a SECURITY DEFINER RPC `export_user_data()` that returns a JSON blob containing all user-scoped rows: `profiles` (one row, the caller's), `taste_profiles`, `user_services`, `user_genres`, `watchlist`, `user_interactions`, `card_impressions` (last 90 days; older rows already rolled up to aggregates). Optionally also onboarding events from `onboarding_events`.
2. **Format** — JSON is the lowest-friction; CSV is more user-readable for watchlist specifically. Recommend JSON top-level with one CSV file per table inside if exporting via ZIP. For Phase 5.5, JSON-only is fine.
3. **Delivery** — three options:
   - **Sync small export:** RPC returns the JSON, client triggers `Blob` download. Works for small accounts (<500 watchlist + <few thousand interactions). Simplest implementation.
   - **Async via email:** RPC kicks off a job, sends an email with the export attached or a signed S3 URL. Required for large accounts.
   - **In-app file save:** Capacitor's Filesystem plugin to write the JSON to the device. Mobile-friendliest.
   Recommend sync-Blob for Phase 5.5 (covers 99% of accounts at current scale), upgrade to async when an account size exceeds the sync limit.
4. **UI** — replace the toast with: loading state on the button while the RPC runs, success toast linking to the saved file path, error toast on failure.

**Caveat:** the `export_user_data` RPC uses the same audit pattern as `delete_own_account` — IT must have its definition in a version-controlled migration. Don't repeat the IN-XPS-006 source-of-truth gap.

**Phase target:** Phase 5.5 (legal-disclosures cluster with IN-XPS-006 + IN-PX-34).

**Status:** ⏳ Filed.

---

## ADR-013 follow-ups (filed 2026-05-08 from cluster-dominant bootstrap PR)

Out of the best-practices research run during the cluster-dominant bootstrap retune (ADR-013). Each is a known industry pattern that improves recsys quality but was deliberately deferred from the launch-blocking PR. None are pre-launch blockers — post-launch optimisations that tighten the system once we have real behavioural data to validate against.

### IN-PX-36: Programmatic similarity-threshold dedupe on cluster representatives

**Source:** ADR-013 best-practices research (2026-05-08).

**Detail:** Manual dedup ran in ADR-013 (each title now in exactly one cluster). Industry SemDeDup (NVIDIA NeMo, arXiv 2502.09667) prescribes a stricter pass: drop any cluster rep whose embedding has cosine ≥ ~0.9 to another rep in the same cluster, *or* to any rep in another cluster. Catches sequels (Toy Story 1/2/3 sit so close in embedding space that all three contributing dilutes the centroid even though they're distinct TMDb IDs) and franchises (Avengers films) that the manual pass missed.

**Fix:** SQL function or build-time check that loads all `representativeTmdbIds` embeddings, computes pairwise cosine, flags any pair > 0.9. Either auto-prune (keep the one closest to the cluster centroid, NeMo's approach) or surface as a CI lint failure for manual review on the next cluster edit.

**Phase target:** Phase 6 (post-launch optimisation cluster). Re-run `scripts/simulate-validate-winner.ts` after applying to confirm CAF / persona-distinctness lift.

**Status:** ⏳ Filed.

### IN-PX-37: Popularity de-bias on recommendation ranking

**Source:** ADR-013 best-practices research; Steck et al., Netflix Research (arXiv 2403.05440); arXiv 2404.12008 spectral analysis of popularity-bias amplification.

**Detail:** Cosine on content embeddings has a documented popularity bias — popular titles have richer Wikipedia / IMDB text feeding their embedding, producing denser, more "central" representations that cosine-rank inflates. We saw the empirical version pre-ADR-013: every persona's top recs were Marvel/Avengers because those titles sit at the centre of the embedding space and pull toward any L2-normalised user vector.

ADR-013 mitigated this on the *bootstrap* side (cluster-dominant weights pull profiles away from the central blob). The *ranking* side still has the bias.

**Fix:** Either (a) inverse-popularity downweight on the final score: `score' = score - λ · log(vote_count)`, or (b) MMR re-rank at candidate generation extended with a popularity penalty term. We already implemented MMR for genre diversity in Phase 5 (`src/lib/recommendations-v2/diversity.ts`); extending it is incremental.

**Phase target:** Phase 6 (post-launch). Tune λ from telemetry (CTR by popularity quartile).

**Status:** ⏳ Filed.

### IN-PX-38: Phase 2 — two-tower neural recommender

**Source:** ADR-013 best-practices research. NVIDIA Merlin two-tower for cold start, Allegro 2025 (arXiv 2508.03702), Spotify Research Sept 2025 generalised user representations, Google Cloud retrieval reference architecture.

**Detail:** The current architecture (weighted centroid of service / watched / cluster vectors → cosine retrieval) is the textbook content-based cold-start baseline. The industrial upgrade path consensus is a two-tower model: an item tower over content features (we already have OpenAI title embeddings — the harder piece is done), a user tower over context + onboarding signals + early implicit behaviour, trained jointly with a contrastive loss, served via ANN. Generalises the centroid trick (a frozen centroid is just an untrained user tower) and learns the explicit-vs-implicit signal weighting from data instead of hand-setting it (which is what ADR-013 had to do empirically via simulation).

**Fix:** R&D project. Initial scope: PyTorch two-tower over the existing 1536D item embeddings + a user tower with learned embeddings for service IDs / cluster IDs / age range / viewing context / onboarding tap history / early implicit interactions. Train on `user_interactions` data once we have ≥10k interactions per active cohort. Serve via existing `match_titles_by_vector` RPC (just replace the user-side input).

**Why this isn't urgent:** the centroid baseline is sufficient for the prototype-user phase. The two-tower upgrade pays off once we have enough behavioural data to train it. Pre-launch we don't.

**Phase target:** Phase 7+ (post-Phase-6 launch, after behavioural data accumulates). Major effort, separate roadmap entry.

**Status:** ⏳ Filed for future planning.

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

### IN-OB-006: Onboarding cluster taxonomy review under v2 engine assumptions

**Source:** Phase 4 mood rooms probe (April 2026) — surfaced empirical question about whether the v1-shaped onboarding clusters still serve the v2 engine.

**Detail:** The current 14-cluster onboarding picker (Step 4) was designed for v1's 24D handcrafted vector where clusters mapped to dimension activations. In v2 the engine works on individual title embeddings. The probe confirmed:

- Anchored rooms can surface signals **outside** stated cluster picks (Sinners → Horror for a user who never picked horror, where the user has clear behavioural evidence for horror but no horror cluster pick)
- The Prestige-Award-Winners cluster is structurally diffuse (representatives spread across content neighbourhoods) — the centroid mismatch the brief flagged is real
- Watched-grid picks (onboarding Step 3) are structurally well-aligned with the v2 engine because they're individual titles, not aggregated categories

Three options for redesign, deliberately not selecting one:

1. **Sharpen clusters.** Trim to fewer, tighter clusters. Drop Prestige. Validate each remaining cluster's representatives sit close in embedding space.
2. **Drop clusters entirely.** Step 4 becomes a second round of title-picking (or merges with Step 3). Each pick is an anchor candidate natively.
3. **Hybrid: titles within broad genre buckets.** 6–8 broad buckets organise the title-picking. Buckets are not stored as signals; the title picks are.

**Required input from Phase 4.5 telemetry** (instrumented via migration 033 `card_impressions.metadata`):

- Frequency of Tier 1 anchors falling outside any user-selected cluster (high frequency suggests cluster taxonomy is too narrow)
- Per-cluster anchor surfacing rate (low rate for any cluster suggests that cluster is structurally weak, à la Prestige)
- CTR by anchor source tier (does the user actually engage more with Tier 2 cluster-derived anchors than Tier 1 behavioural anchors? Tells us how much the cluster signal is worth)

**Why deferred:** title-anchored mood rooms work regardless of which onboarding direction is chosen. Shipping Phase 4.5 with current clusters as Tier 2 source captures three months of telemetry that informs the redesign with data instead of guesswork.

**Phase target:** Phase 6 review, post-Phase-4.5 telemetry analysis.

**Status:** ⏳ Not yet incorporated

---

*End of parking lot v0.4. Phase 4.5 redirect added entries IN-463, IN-464, IN-465, IN-OB-006. All entries from strategy review rounds 1-3 incorporated. Phase 6.5 section removed — cleanup is distributed across the phases that perform it. Ready for CC review as part of the v2 document set.*
