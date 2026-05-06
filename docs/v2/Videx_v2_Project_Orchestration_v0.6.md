# Videx v2 — Project Orchestration & Version Control Strategy

**Status:** v0.6 — Phase 5 kickoff. §3.4 catches up with the migrations that landed during the Phase 4.5 redirect / IN-466 / cold-start work (033, 034, 035 all ✅ Applied) and lists the five planned Phase 5 migrations (036–040). No process changes from v0.5; this is a state-of-reality refresh ahead of the `phase-5-contextual-signals` branch cut.
**Version:** 0.6

**Changes from v0.5:**
- §3.4: migration 033 status flipped from ⏳ Planned → ✅ Applied (2026-04-27 with the anchored mood rooms redirect).
- §3.4: migration 034 (`mood_room_anchor_labels`) added — Phase 4.5 IN-463 fast-follow, LLM-generated thematic labels for anchored rooms. ✅ Applied (April 2026).
- §3.4: migration 035 (`available_tmdb_ids_rpc_array_return`) added — Phase 4.5 cold-start fix changing `get_available_tmdb_ids` return shape to JSONB array (saves ~1.5–2s on cold starts). ✅ Applied (April 2026).
- §3.4: the placeholder "034+ taste_profiles RLS" row removed. Replaced with explicit Phase 5 rows for migrations 036 (taste_profiles RLS), 037 (drop `marked_watched` from event_type CHECK), 038 (`username_available` RPC + drop public profiles SELECT policy), 039 (cron jobs Vault-backed JWT rotation), 040 (`get_available_tmdb_ids` returns typed `(tmdb_id, media_type)` pairs — IN-458). All ⏳ Planned for Phase 5.
- New Phase 4.5 redirect / IN-466 / cold-start actuals note in §3.4.

**Changes from v0.4:**
- §11 (Confirmed Decisions): added IN-466 server-side render lock — `render-foryou-rows` Edge Function as the For You first-paint primary path with the existing `useForYouContent` client pipeline as fallback (1.5s timeout). Linked to ADR-012 and the IN-466 phase summary.
- §11: added the `_shared/recommendations-v2/` + `_shared/taste-v2/` mirror commitment per ADR-011 with `shared-tree-drift` GitHub Actions workflow as the drift control mechanism.
- §6.3 added: Variant A warmup-foryou Edge Function, fired from `App.tsx` mount.
- §3.4 migration table unchanged — IN-466 was application-layer only, no new migrations. Migration 033 status flipped from ⏳ Planned → ✅ Applied (was pending v0.4 publication, applied April 2026 with the anchored mood rooms work).

**Changes from v0.3.3:**
- §3.4: Phase 4.5 description rewritten. The clustering pipeline (HDBSCAN + Python + GitHub Actions cron) and migrations 029–032 are documented as already shipped under Gates 1–4. The remaining Phase 4.5 scope is the title-anchored ranking layer for the For You "Mood Rooms for Tonight" row + the IN-463 LLM labelling fast-follow.
- §3.4: migration 033 added — `card_impressions.metadata` jsonb column + `'anchor_room'` source_surface CHECK constraint extension. Used by the anchored mood rooms instrumentation per Strategy v1.7 §5.2.1.
- §11 (Confirmed Decisions): added the title-anchored mood rooms For You ranking lock alongside the existing HDBSCAN-pipeline lock.
- §11: cross-reference to the Phase 4 Title-Anchored Mood Rooms kick-off (April 2026) added.

**Changes from v0.3.2:**
- §3.4 migration 017 row flipped from ⏳ Planned → ✅ Applied. Description amended: adds four columns (`keywords`, `cast_top_5`, `director`, `content_rating`) + partial work-queue index. `runtime` is NOT in 017 — it already existed at `001_content_tables.sql:24` and was backfilled opportunistically (0 → 81.4% populated) rather than re-added.
- §3.4 gained a Phase 0.5 actuals note covering the four-column reality, the `supabase/cron/` directory being live, the `title_credits`/`title_genres` left-empty decision, and the production row-count gate outcomes.
- The `supabase/cron/` convention is now load-bearing (not aspirational): `enrich_new_titles.sql` is the first file there, scheduled at 06:30 UTC daily. Future phases should file recurring-job schedules in `supabase/cron/` rather than as migrations.

**Changes from v0.3.1:**
- §3.4 migration table renumbered: migrations 015 and 016 inserted as Phase 0 in-phase deviations (`card_impressions_partition_rls.sql` and `card_impressions_rls_event_trigger.sql`). Every migration from Phase 0.5 onwards incremented by 2.
- §3.4 gained a Phase 0 actuals note explaining why the renumber happened.
- §3.4 gained a new note on the distinction between schema-evolution migrations and operational automation (the latter now lives in `supabase/cron/` rather than the migration sequence).
- Applied-status column added to the migration table so the boundary between shipped and planned migrations is visible at a glance.
**Purpose:** Define the version control strategy, environment setup, and project orchestration approach for the Videx v2 build. This document captures the foundational infrastructure decisions that have been locked through three rounds of strategy review and CC codebase validation.

**Changes from v0.3:**
- Migration 014 description in Section 3.4 expanded to include `card_impression_daily_totals` aggregation table and pg_cron rollup job
- See Corrections v0.3.1 document for the full diff

**Changes from v0.2:**
- **Fundamental reframe:** v1 is archived as a Git tag rather than run in parallel with v2. No cutover ceremony, no feature flags, no Phase 6.5 cleanup phase. Cleanup of replaced v1 code happens in the phase that replaces it.
- **Section 2 (Branching Model):** simplified to reflect the archival approach. The long-lived `v2-rebuild` branch and branch-rename cutover are removed. v2 builds forward on `main`.
- **Section 3 (Environment Setup):** Supabase Pro tier locked as the active decision, with scale-up/scale-down context.
- **Section 3.3 (Schema Change Strategy):** rewritten. The "additive only until Phase 6.5" rule is obsolete. New rule: additive within a phase for safety, destructive across phases where cleanup is warranted.
- **Section 3.4 (Migration List):** updated to reflect the locked phase list, starting with the profiles baseline migration.
- **New Section 6 (Scheduled Workflows):** replaces "The Cutover." Documents the GitHub Actions monthly cron for mood room reclustering.
- **Section 7 (Managing Concurrent Work):** simplified. v1/v2 coexistence subsections removed.
- **Section 10 (Summary) and Section 11 (Confirmed Answers):** rewritten to reflect all locked decisions from strategy review rounds 1-3.
- **Section 12 (Action Items Before First Phase):** rewritten. Includes the profiles baseline migration as the first concrete task.

---

## 1. Context and Constraints

### 1.1 What we know about the current setup

- **Single Git repository** with one main branch
- **No staging environment**
- **Android app** via Capacitor, installed on Joe's test device
- **Supabase backend** on the Free tier currently, with ~20K title cache, daily pg_cron sync, Edge Functions
- **Solo development** with Claude Code as the primary implementation partner
- **Two prototype users** have seen v1; there is no meaningful live user base
- **Data dependencies** that need to keep producing data: TMDb, OMDB, Streaming Availability API, the daily sync job. These continue running through v2 development because the data they produce is still valuable — not because v1 depends on them

### 1.2 What this means for the strategy

The "two prototype users" point is the most important constraint. It's what makes the whole v2 approach simpler than a typical rebuild:

- No parallel run between v1 and v2
- No feature flags or A/B rollout infrastructure
- No cutover ceremony
- No Phase 6.5 legacy cleanup phase
- No data migration for existing users (they re-onboard on v2)

What this enables: v1 gets archived as a Git tag, and v2 builds forward directly on `main`. Each phase replaces the relevant v1 code in-place and deletes what's no longer needed. The "cleanup" happens continuously as a natural side effect of building each phase, not as a deferred chore.

What this does NOT change: the recommendation engine restructure, the two-surface architecture (Home + For You), the 5-step onboarding, the switch to embedding-based taste vectors, and all the other strategic commitments from the v2 Strategy document. Those are locked regardless of migration model. What changes is only *how* the build is sequenced and organised in Git and Supabase.

### 1.3 Questions this document answers

1. How is v1 archived and what does that archival look like in Git?
2. How does v2 build forward on main as a series of phases?
3. How do we manage Supabase schema changes within and between phases?
4. What environments do we need during the build?
5. What's the daily development workflow with Claude Code?
6. What CI and scheduled workflows are needed?
7. What's the backup strategy?
8. What concrete action items need to happen before Phase 0 can start?

---

## 2. Branching Model

### 2.1 The locked approach

v1 is archived as a Git tag on the current `main`. v2 builds forward on `main` as a series of phase feature branches, each merged back into `main` when complete.

```
main (v2 — builds forward continuously)
│
├── phase-0-instrumentation (merged)
├── phase-0.5-content-enrichment (merged)
├── phase-1-embeddings (merged)
├── phase-2-service-fingerprints (merged)
├── phase-3-taste-vector (merged)
├── phase-4-ranking-pipeline (merged)
├── phase-4.5-mood-rooms (merged)
└── phase-5-contextual-signals (merged)

tag: v1-archive (points at the last v1 commit on main)
```

The tag `v1-archive` is a permanent, immutable reference to what v1 looked like. It lives in Git forever at essentially zero storage cost. If anyone (including future-Joe) needs to reference v1 code, they run `git checkout v1-archive`, look at the code, and switch back.

### 2.2 Why tag and not branch

A Git tag is the correct primitive for "this is what v1 was at this moment in time." Tags are immutable by convention and don't participate in active development. A branch would invite the question "is v1 still being developed?" — which it isn't. The tag is a snapshot, and that's exactly what we want.

The alternative (keeping a `v1-archive` branch) adds no value and introduces the risk of accidental commits to a branch that shouldn't receive any.

### 2.3 Phase branch workflow

For each phase of v2:

1. **Start from main:**
   ```bash
   git checkout main
   git pull
   git checkout -b phase-0-instrumentation
   ```

2. **Work on the phase branch.** CC implements the phase against the spec. Joe reviews CC's plan before code, reviews code before commit.

3. **Test locally.** Run the app, verify the phase works, catch regressions.

4. **Apply any Supabase migrations** via `supabase db push` when the phase includes schema changes. This is a one-way operation — be sure before doing it.

5. **Merge to main when the phase is complete:**
   ```bash
   git checkout main
   git merge phase-0-instrumentation --no-ff
   git push origin main
   git branch -d phase-0-instrumentation
   git push origin --delete phase-0-instrumentation
   ```

   The `--no-ff` flag preserves the phase as a clear merge commit in history.

6. **Update tracking** in Notion. Note any decisions or learnings. Move to the next phase.

**Naming convention:** plain phase names, no prefix. `phase-0-instrumentation`, `phase-0.5-content-enrichment`, `phase-1-embeddings`, and so on. Since v2 is the only thing being built, the `v2/` prefix from v0.2 of this doc is redundant.

### 2.4 What if a phase needs to be rolled back?

If a phase merges to main and then proves problematic:

```bash
git revert -m 1 <merge-commit-sha>
```

This creates a new commit that undoes the merge, preserving history. The phase branch can be re-created from the revert point, fixed, and re-merged. No force-pushes, no rewriting history.

This is another advantage of the phase-branch-merge model: rollback is a normal Git operation, not a ceremony.

### 2.5 What about the v1-archive tag?

Never delete it. Tags cost effectively zero storage and the safety net is real. If you ever need to know "how did v1 handle X?", the tag is the source of truth.

Push the tag to all remotes (origin and the backup mirror from Section 8) so it's off-site-safe.

---

## 3. Environment Setup

### 3.1 What environments you need

**During v2 build:**

1. **Local development** — Vite dev server, talking to production Supabase
2. **Production Supabase** (Pro tier)
3. **Android test device** — Joe's phone with the dev APK installed via `adb`

That's it. No staging environment, no separate dev database, no preview environments. The two-prototype-user reality means "production" is essentially a test environment anyway.

**Post-launch (future):**

When v2 ships to real users, you'll want a staging Supabase, CI/CD deployment automation, crash reporting, analytics, and possibly a feature flag system. None of this is needed during the build. These are future-Joe problems.

### 3.2 The Supabase plan decision

**Locked: Supabase Pro tier for the duration of v2 development and the first months post-launch.**

Why: the Free tier's 500MB database limit cannot accommodate v2's pgvector embedding index. The full breakdown:

- 20K titles × 1536-dim × 4 bytes = ~117MB for vectors alone
- HNSW index at typical settings adds 2-3x overhead = ~350MB total for vectors + index
- Free tier is 500MB total, shared across all tables
- Once you add `card_impressions`, the expanded `user_interactions`, `mood_rooms`, `mood_room_titles`, and the general growth of other tables, Free tier capacity becomes the binding constraint

Pro tier gives you 8GB database, dedicated compute (no index build timeouts), daily automatic backups, and removes the 7-day-inactivity pause. Cost is ~£20/month (~£180 for a 9-month build window).

**Scaling down:** Supabase Pro can be downgraded back to Free via the dashboard at any time, billed pro-rata. However, the downgrade only works if your database is under Free tier limits at the time of downgrade. Once v2's embedding index is in place, you would need to drop the index and prune historical data before Free tier would accept the downgrade. Plan for Pro tier as a sustained commitment through the first months post-launch, not a short-term upgrade.

**Supabase Pro backups:** Pro tier includes daily automatic backups retained for 7 days. This is sufficient for v2 development and removes the urgency of manual snapshots before risky migrations that v0.2 flagged. Manual snapshots are still worth taking before any destructive migration for extra safety, but they're no longer the primary backup mechanism.

### 3.3 Schema change strategy

The old rule from v0.2 ("additive only until Phase 6.5") is obsolete because there is no Phase 6.5 and no parallel v1 to protect. The new rule is:

**Additive within a phase, destructive across phases where cleanup is warranted.**

What this means in practice:

- **Within a single phase,** migrations should be additive so the phase can be rolled back via `git revert` without leaving the database in a broken state. If Phase 1 adds a new `embedding` column, the column is new — not a rename of the old `content_vector` column — so that reverting the phase just leaves an unused column behind, which is harmless.

- **Between phases,** destructive migrations are allowed and expected. Phase 1's final migration drops the old `content_vector` column because it's no longer needed after embeddings ship. Phase 3's final migration drops the `interaction_log` JSONB column because it's replaced by event-sourced `user_interactions`. Phase 6.5 doesn't exist — cleanup happens in the phase that makes it safe.

- **Every destructive migration should be a separate, final migration in the phase** so that rolling back the destructive migration is possible without reverting the whole phase's additive work.

Specifically:

- ✅ Adding new columns, tables, indexes, views — safe within a phase
- ✅ Dropping columns, tables, constraints — safe between phases, at the end of the phase that replaces them
- ✅ Renaming — handled as add-new + dual-write if needed for a brief transition, then drop-old in a separate migration at phase end
- ✅ Changing column types — handled as add-new + migrate data + drop-old
- ❌ In-place destructive changes during a phase — never, because rollback becomes impossible

### 3.4 Migration management

Supabase migrations live in `supabase/migrations/` and are applied via `supabase db push`. Each phase produces one or more numbered migrations in sequence:

| # | Migration | Phase | Status | Purpose |
|---|---|---|---|---|
| 011 | `011_profiles_baseline.sql` | Pre-Phase 0 | ✅ Applied | Codify the profiles table that currently exists only in production (not in version control). Idempotent. |
| 012 | `012_profiles_v2_onboarding_fields.sql` | Phase 0 | ✅ Applied | Add `age_range` and `viewing_context` columns for v2 onboarding Step 1 |
| 013 | `013_user_interactions_v2_expansion.sql` | Phase 0 | ✅ Applied | Expand `user_interactions` with `session_id` and `source_surface` top-level columns, rename `dismiss` to `not_interested`, add CHECK constraint on the 15 allowed event types |
| 014 | `014_card_impressions_table.sql` | Phase 0 | ✅ Applied | Create `card_impressions` table with pg_partman monthly partitioning, `card_impression_daily_totals` aggregation table, and `card_impressions_rollup` + `pg_partman_maintenance` pg_cron jobs |
| 015 | `015_card_impressions_partition_rls.sql` | Phase 0 (in-phase deviation) | ✅ Applied | Enable RLS on existing `card_impressions` child partitions and on the template table. Handles the existing-partition case at apply time. See Phase 0 summary §3 Deviation 2. |
| 016 | `016_card_impressions_rls_event_trigger.sql` | Phase 0 (in-phase deviation) | ✅ Applied | `ddl_command_end` event trigger that automatically enables RLS and creates per-user policies on any new `card_impressions_*` partition. Supersedes 015's template_table approach for new partitions. See Phase 0 summary §3 Deviation 3 and Parking Lot IN-PX-01. |
| 017 | `017_content_enrichment_columns.sql` | Phase 0.5 | ✅ Applied | Adds `keywords`, `cast_top_5`, `director`, `content_rating` to `titles` plus a partial work-queue index on `(id) WHERE keywords IS NULL`. **`runtime` was NOT added by 017** — it already existed at 001:24 and was backfilled opportunistically (0 → 81.4% populated). See Phase 0.5 summary §1. |
| 018 | `018_embeddings_pgvector.sql` | Phase 1 | ✅ Applied | Enable pgvector extension, add `embedding vector(1536)` column, create HNSW index |
| 019 | `019_drop_legacy_content_vector.sql` | Phase 1 (end) | ✅ Applied | Drop the 24D `content_vector` column and its constraint |
| 020 | `020_service_fingerprints.sql` | Phase 2 | ✅ Applied | Create `service_fingerprints` table with CHECK constraint, authenticated-only RLS |
| 022 | `022_fingerprint_variant.sql` | Phase 2.6 | ✅ Applied | Add `variant` column to `service_fingerprints` (PK now includes variant), `match_titles_by_vector` RPC for pgvector cosine similarity search (Phase 3 inheritance) |
| 023 | `023_taste_vector_v2.sql` | Phase 3 | ✅ Applied | Add `taste_vector_v2 vector(1536)`, slider columns, metadata to `taste_profiles` |
| 024 | `024_drop_legacy_taste_vector.sql` | Phase 3 | ✅ Applied | Drop v1 24D columns: `vector`, `confidence`, `seed_vector`, `quiz_completed`, `quiz_answers`, `interaction_log`, `version` |
| 025 | `025_fix_match_titles_rpc.sql` | Phase 3 | ✅ Applied | Recreate `match_titles_by_vector` as plpgsql with dynamic `hnsw.ef_search` (was capped at 40 results) |
| 026 | `026_security_linter_fixes.sql` | Infrastructure | ✅ Applied | Supabase security advisor — accepted linter warnings |
| 027 | `027_function_search_path_pin.sql` | Infrastructure | ✅ Applied | Pin `search_path` on RPC functions per security advisor |
| 028 | `028_available_tmdb_ids_rpc.sql` | Phase 3 | ✅ Applied | `get_available_tmdb_ids` RPC — single-query DISTINCT availability lookup |
| 029 | `029_mood_rooms_table.sql` | Phase 4.5 | ✅ Applied (2026-04-19) | Create `mood_rooms` (cluster metadata + `centroid vector(1536)` for frontend taste-fit scoring) and `clustering_runs` (monthly job audit log). RLS: `authenticated SELECT` on `mood_rooms`; `service_role` only on `clustering_runs`. |
| 030 | `030_mood_room_titles_table.sql` | Phase 4.5 | ✅ Applied (2026-04-19) | Join table mapping cluster membership: `(mood_room_id, tmdb_id, media_type)` composite PK, `centrality REAL`. Follows project convention — no FK to `titles`, application-level referential integrity (matches `streaming_availability`, `title_genres`, `title_credits`). RLS: `authenticated SELECT`. |
| 031 | `031_mood_rooms_rpcs.sql` | Phase 4.5 (Gate 4 hotfix) | ✅ Applied (2026-04-21) | Three server-side RPCs for mood rooms data access: `get_mood_rooms_for_user` (taste-ranked, availability-filtered top N), `get_mood_room_thumbnails` (batched preview fetch), `get_mood_room_detail` (full per-room title list). Fixes a PostgREST 1000-row cap bug in the client-side data path that was silently filtering most rooms out of the display pool (only the 2 biggest rooms surfaced). See Phase 4.5 summary. |
| 032 | `032_card_impressions_mood_room_surface.sql` | Phase 4.5 (Gate 4 hotfix) | ✅ Applied (2026-04-22) | Drop and recreate the `card_impressions.source_surface` CHECK constraint to include `'mood_room'`. The original constraint from migration 014 silently rejected every batch flush that contained a mood_room row, so the per-room impressions never landed. Plan A4 said no DDL was needed — that was wrong; the constraint was right there in 014 and bit hard during Gate 4 smoke. |
| 033 | `033_card_impressions_anchor_room_metadata.sql` | Phase 4.5 (anchored rooms redirect) | ✅ Applied (2026-04-27) | Two changes: (a) extend `card_impressions.source_surface` CHECK with `'anchor_room'` so per-row CTR distinguishes anchored from global mood-room engagement at the column level; (b) add `card_impressions.metadata jsonb` column for per-impression surface-specific context. For anchored mood rooms, metadata captures `{ anchor_tmdb_id, anchor_tier, anchor_source_cluster_id, tier_1_inside_stated_cluster }` — the data behind IN-OB-006 (onboarding cluster taxonomy review). Single DDL covers both since they ship together for the same row. |
| 034 | `034_mood_room_anchor_labels.sql` | Phase 4.5 (IN-463 fast-follow) | ✅ Applied (April 2026) | Add `mood_rooms.anchor_label_text TEXT` and `mood_rooms.anchor_label_generated_at TIMESTAMPTZ` for LLM-generated thematic labels on anchored mood rooms. Backed by the `label-anchor-room` Edge Function (called server-side from `render-foryou-rows`). Replaces the v1 templated labels for anchored rooms only — global mood rooms keep their cluster-derived labels. |
| 035 | `035_available_tmdb_ids_rpc_array_return.sql` | Phase 4.5 (cold-start fix) | ✅ Applied (April 2026) | Change `get_available_tmdb_ids` return shape from `TABLE` to JSONB array. Eliminates a per-row PostgREST envelope cost that was adding ~1.5–2s on cold starts of the `render-foryou-rows` Edge Function. Consumers (`hardFilters.ts`, anchor room generation, BYW filtering) parse the JSONB array client-side. |
| 036 | `036_taste_profiles_rls.sql` | Phase 5 (pre-launch blocker) | ⏳ Planned | Enable RLS on `taste_profiles` with `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`. Pre-existing gap surfaced by Phase 4 security review — not introduced by Phase 4. GDPR / privacy blocker for public launch. Service-role bypass preserves Edge Function reads. |
| 037 | `037_drop_marked_watched_from_check.sql` | Phase 5 | ⏳ Planned | Drop `'marked_watched'` from `user_interactions.event_type` CHECK constraint (was carried alongside `'watched'` for forward-compat in `013` but never emitted as an event_type at runtime — `emitContentInteraction` only takes `'watched'`). Read-side queries in `useForYouContent.ts` and `render-foryou-rows` cleaned up in the same PR. The `exit_reason` payload value (Detail Page Signal Spec v0.3.2 line 237) is unrelated and stays. Pre-flight: `SELECT count(*) FROM user_interactions WHERE event_type = 'marked_watched';` must be 0 before drop, else add an `UPDATE … SET event_type = 'watched'` step first. |
| 038 | `038_profiles_username_lookup_rpc.sql` | Phase 5 (IN-XPS-002) | ⏳ Planned | Replace the unscoped `FOR SELECT USING (true)` "Allow public username lookup" anon policy on `profiles` (currently at `011_profiles_baseline.sql:51-55`) with `username_available(check_username text) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE`. Onboarding signup flow updated to call the RPC instead of selecting from the table. Tightens anon read scope from "every column on every row" to "boolean answer for one username". |
| 039 | `039_cron_jobs_vault_jwt.sql` | Phase 5 (IN-XPS-004) | ⏳ Planned | Move the inline service-role JWTs out of `006_cron_schedule.sql` and `014_card_impressions_table.sql` into Supabase Vault. Re-create the five cron jobs (`enrich_new_titles`, `embed_new_titles`, `card_impressions_rollup`, `pg_partman_maintenance`, `mood-rooms-recluster`) using `(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')`. Pre-launch security blocker. **Irreversible** — rollback requires un-rotating the service-role key first. Sequenced last in Workstream C so the rest of Phase 5's Workstream C carries a clean rollback story. |
| 040 | `040_available_tmdb_ids_with_media_type.sql` | Phase 5 (IN-458) | ⏳ Planned | Extend `get_available_tmdb_ids` to return `(tmdb_id, media_type)` pairs rather than just `tmdb_id`. Closes the 0.8% movie/TV id collision rate measured during Phase 4 audit. Consumers (`hardFilters.ts`, anchor room generation, BYW filtering) updated in lockstep. |

Numbering continues forward as phases execute. The list above is the current plan; migration numbers may shift if phases add additional migrations as they develop.

**Phase 0 actuals note:** Phase 0 was originally planned to ship migrations 012–014 only. During implementation, Postgres' lack of RLS propagation from partitioned parents to child partitions surfaced as an empirical gap, which required two unplanned but in-scope migrations (015, 016) to close. Every migration number from Phase 0.5 onwards has been incremented by 2 from the v0.3.1 plan to absorb this shift. The pattern established by 016 (event trigger for partition RLS) is now a reusable Videx pattern — see Parking Lot IN-PX-01.

**Phase 0.5 actuals note:** Phase 0.5 shipped exactly the planned single migration (017), but added four columns rather than five — `runtime` already existed at `001_content_tables.sql:24` (pre-existing, commented "movies only", 0/20000 populated) and was backfilled opportunistically rather than re-added. Phase 0.5 also created the new `supabase/cron/` directory with `enrich_new_titles.sql` as its first file, establishing the operational-automation-vs-schema-evolution convention described in §3.4 below. Phase 0.5 did NOT touch `title_credits` or `title_genres` — both confirmed empty in production and intentionally left alone (see Parking Lot IN-102, IN-106). The production row-count verification gates came in at `keywords=100%`, `cast_top_5=100%`, `runtime=81.4%`, `content_rating=65.4%` (within the brief's explicit 60% tolerance for certification sparsity), and `director=77.2%` overall — the last one short of the single 80% floor but split to movies 99.7% / TV 54.9%, accepted as a structural TMDb catalogue gap and filed as IN-PX-06/IN-PX-07 for Phase 1 review. See Phase 0.5 summary §3 Deviation 3 for the full analysis.

**Phase 1 actuals note:** Phase 1 shipped two migrations (018, 019) as planned. 19,993 titles embedded with OpenAI text-embedding-3-small (1536D). Wire format spike confirmed `JSON.parse(row.embedding as string)` as the locked pattern for Phase 3. Cluster coherence eval: conditional pass (within-cohort passes for 4/5 real cohorts, between-cohort threshold of 0.3 unrealistically strict for genre-overlapping cohorts). `embed-new-titles` Edge Function + 06:45 UTC cron deployed. Legacy `content_vector` column dropped. See Phase 1 summary for full details.

**Phase 2 actuals note:** Phase 2 shipped one migration (020) creating the `service_fingerprints` table. 10 UK services fingerprinted from top-150 catalogue titles. Strategy review tightened RLS to authenticated-only (no anon), added `CHECK (title_count > 0 AND title_count = array_length(source_title_ids, 1))`, and required media_type-aware joins. Discrimination eval: conditional pass — max pairwise cosine 0.9779, mean 0.8882, both above thresholds (0.92, 0.75) due to genuine catalogue overlap between mainstream services, not model failure. MUBI and Discovery+ separate clearly. `refresh-service-fingerprints` Edge Function + Sunday 07:00 UTC cron deployed. Three services missing fingerprints: BBC iPlayer (SA API empty catalogue), NOW TV (SA API misclassified as addon), Sky Go (not in SA API). Filed as IN-250 for Phase 2.5. See Phase 2 summary for full details.

**Phase 2.5 actuals note:** Phase 2.5 shipped no migrations — it inserted 600 rows into `streaming_availability` via TMDb `/discover` backfill for BBC iPlayer (200), NOW TV (200), and Sky Go (200). All three services now have 150-title fingerprints. Anchor assertion (BBC × MUBI bottom 3): conditional pass — BBC's catalogue is genuinely broad (Suits, Pokémon, blockbusters alongside BBC originals), so 0.8908 cosine is a catalogue characteristic, not a build error. MUBI is not a Videx service. Cosine drift for original 10 services: 0.0027 (PASS, threshold 0.02). `refresh-service-fingerprints` Edge Function extended to run TMDb backfill before fingerprint recomputation (one job, one schedule). See Phase 2.5 summary.

**Phase 2.6 actuals note:** Phase 2.6 shipped one migration (022) adding a `variant` column to `service_fingerprints` and the `match_titles_by_vector` RPC function (Phase 3 inheritance — Stage 1 retrieval). Built v2_exclusivity centroids using `weight_i = 1/N_services`. Bottom-half variance gate: FAIL (5/13, required >= 8). v2 improved niche services but degraded 8 mainstream services. WU-3 (synthetic cold-start) skipped per early-exit clause. Decision: ship v1_popularity. v2 rows deleted, variant column retained for future experiments. Migration numbering shifted +2 from v0.3.3 plan (021→023, 022→024, 023→025) to absorb 022. See Phase 2.6 decision doc.

**Phase 3 actuals note:** Phase 3 shipped four migrations (023, 024, 025, 028). 023 added the `taste_vector_v2 vector(1536)` column, slider columns, and metadata to `taste_profiles`. 024 dropped the v1 24D columns (destructive — applied alongside 025 during the For You debugging session before behavioural verification was complete, flagged as a process breach). 025 fixed the `match_titles_by_vector` RPC's HNSW ef_search cap. 028 added the `get_available_tmdb_ids` RPC for single-query availability lookup. 038 insertions, 15,176 deletions net (v1 quiz subsystem deleted). Auth sign-up integrated into onboarding Step 1. Bootstrap uses dynamic 4-band weights by watched-grid count. Migrations 025 and 028 were not in the original plan — 025 was a fix discovered during implementation (ef_search was capped at 40 results), 028 was a performance optimisation (paginated 20-query approach became single DISTINCT RPC). See Phase 3 summary.

**Phase 4 actuals note:** Phase 4 shipped **zero migrations** as planned. The full multi-stage ranking pipeline replaced the Phase 3 cosine-only ranker entirely in application code. Six new pipeline files in `src/lib/recommendations-v2/` (weights, recency, contextual, diversity, ranker, types expansion). Three new Home row builders in `rows/home/`. New `ForYouPage.tsx`, `SliderTray.tsx`, `useForYouContent.ts`. Deprecated `useRecommendations.ts` and `useHiddenGems.ts` deleted at phase end. Hero upgraded from single-item to 3-5 card carousel. For You surface: 7 rows with shared 500-candidate pool + in-memory re-ranking on slider change. All four delivery sliders wired to pipeline parameters via bottom-sheet tray with haptic feedback. Evaluation harness at `scripts/evaluation/rank-eval.ts`. Stage 2 scoring implemented as 3-component weighted sum (taste 62.5% / recency 25% / contextual 12.5% placeholder) with genre-spread and cross-service de-clustering as post-processing stages, deviating from the brief's literal 5-component table (see Strategy §5.2 Phase 4 implementation note). Genre-spread chosen over MMR because loading 500 × 1536D embeddings client-side for the MMR similarity computation would add ~3MB per page load — deferred to Phase 5. Two prototype users tested; performance after optimisation: ~260ms time-to-first-render with warm filter sets. See Phase 4 summary.

**Phase 4.5 redirect / IN-466 / cold-start actuals note:** Phase 4.5 originally landed Gates 1–4 with migrations 029–032 (HDBSCAN clustering pipeline + global mood rooms infra). Two follow-on workstreams shipped under the same phase branch before merge:

- *Phase 4.5 redirect (April 2026)* — title-anchored mood rooms replaced the global mood-room For You row. Migration 033 added `card_impressions.metadata jsonb` plus the `'anchor_room'` source_surface CHECK extension. Anchor selection logic (Tier 1 behavioural / Tier 2 cluster-rep / Tier 3 top-finalScore) added in `src/lib/recommendations-v2/anchorSelection.ts`. Confirmed brief assumption that the For You "Mood Rooms for Tonight" row would benefit from per-user anchoring rather than global cluster slicing.
- *IN-463 thematic labels fast-follow (April 2026)* — migration 034 added LLM-generated label columns to `mood_rooms`. New `label-anchor-room` Edge Function (called server-side from `render-foryou-rows`). Replaces v1 templated labels on anchored rooms only.
- *IN-466 server-side render (April 2026)* — `render-foryou-rows` Edge Function shipped as the For You first-paint primary path with the existing `useForYouContent` client pipeline as fallback (1.5s timeout). Application-layer only, no migrations. ADR-011 mirror commitment activated: `_shared/recommendations-v2/` and `_shared/taste-v2/` are bit-for-bit copies of `src/lib/recommendations-v2/` and `src/lib/taste-v2/`, enforced by the `shared-tree-drift` GitHub Actions workflow.
- *Phase 4.5 cold-start fix (April 2026)* — migration 035 changed `get_available_tmdb_ids` from `TABLE` return to JSONB array, eliminating per-row PostgREST envelope cost on Edge Function cold starts. Saves ~1.5–2s.

**Operational automation vs schema evolution.** The migration sequence is reserved strictly for schema evolution — `CREATE TABLE`, `ALTER TABLE`, indexes, constraints, extension installs. Operational automation that invokes Edge Functions, schedules recurring jobs, or configures non-schema runtime behaviour lives in `supabase/cron/` as version-controlled SQL files, applied manually via `npx supabase db query < supabase/cron/<file>.sql` during the relevant phase's deployment. This keeps migration numbering tied to schema state rather than to operational config churn, and makes it obvious which artefacts roll back with `git revert` (schema migrations) versus which need a deliberate `cron.unschedule()` call (operational config). The two pg_cron jobs in migration 014 (`card_impressions_rollup`, `pg_partman_maintenance`) are an exception because they are tightly coupled to the lifecycle of the `card_impressions` table they maintain — if the table is dropped, those jobs should drop with it.

**Where migrations live:** in `supabase/migrations/` on the phase branch they belong to. Once a migration is applied to the live Supabase project via `supabase db push`, it is permanent. Treat each migration as a one-way commitment, even before the phase branch is merged to main.

**Why migrations run before phase merge:** CC needs to test the phase against the real schema during implementation. Waiting until post-merge to apply migrations means CC is working blind during testing. The trade-off is that migrations can execute against production even if the phase branch is never merged — but given the two-prototype-user context, this is acceptable.

### 3.5 Local Supabase testing

For most v2 work, local Supabase testing is not necessary. Additive migrations (new columns, new tables, new indexes) can go directly to production via `supabase db push`.

**Use local Supabase testing for:**
- Migrations that backfill or transform existing data (e.g., the `dismiss` → `not_interested` rename if it includes a data migration)
- Destructive migrations (drops)
- Anything where the worst case is expensive to recover from

**Skip local testing for:**
- Pure additive migrations
- Anything where the worst case is "the column is empty" and the migration can be re-run

### 3.6 The `.env` situation

One `.env` file for now, holding Supabase keys, TMDb key, OMDB key, Streaming Availability API key, and (new in v2) the OpenAI API key. When a staging environment becomes relevant post-launch, this splits into `.env.development`, `.env.staging`, `.env.production`. Not a concern during the build.

---

## 4. Daily Development Workflow

### 4.1 The phase loop

Each phase of v2 follows the same pattern:

**Step 1 — Spec writing (Joe + strategist in conversation).**
Before any code, a CC brief is written for the phase. The brief includes:
- Goals and success criteria
- Schema changes with migration numbers
- New code to write, with file paths and integration points
- Reference docs (Recommendation Engine Strategy, Detail Page Signal Capture Spec, Home & For You Composition Hypothesis)
- Cross-references to the Implementation Notes Parking Lot
- Known edge cases and failure modes
- Acceptance criteria, including any row-count or data-validation checks

**Step 2 — Branch creation.**
```bash
git checkout main
git pull
git checkout -b phase-X-name
```

**Step 3 — CC implementation.**
Joe gives CC the spec brief and the relevant Parking Lot entries. CC produces a plan before writing code. Joe reviews the plan. Joe answers clarifying questions. CC writes code. Joe reviews the code (or asks the strategist to review on Joe's behalf). CC commits.

**Step 4 — Local testing.**
Run v2 locally. Verify the phase works end-to-end. Test edge cases. Catch regressions.

**Step 5 — Migration application.**
If the phase includes Supabase migrations, apply them to live Supabase via `supabase db push`. One-way operation — confirm before running.

**Step 6 — Phase merge.**
```bash
git checkout main
git merge phase-X-name --no-ff
git push origin main
git branch -d phase-X-name
git push origin --delete phase-X-name
```

**Step 7 — Update tracking.**
Mark the phase complete in Notion. Note decisions, learnings, and anything that should go back into the Parking Lot for future phases. Move to the next phase.

### 4.2 When to commit

Commit frequently within a phase. Don't wait until the phase is "done":
- After each new file is created
- After each major refactor
- After each test passes
- Before any risky change

CC writes meaningful commit messages by default. Let it.

### 4.3 When to push

Push to origin at least once per day, ideally after every commit. This keeps the phase branch backed up on the remote and, if the mirror remote from Section 8 is set up, on a second host as well.

### 4.4 Reviewing CC's work

The pattern from strategy review rounds 1-3 should continue:

1. CC produces a plan
2. Joe reviews the plan (or asks the strategist to review)
3. CC asks clarifying questions
4. Joe answers
5. CC writes code
6. Joe reviews the code
7. CC commits

The tighter the review loop, the fewer surprises later. This pattern is a gate, not a suggestion — CC should not commit code without a plan-review-code-review cycle.

---

## 5. Lightweight CI Setup

### 5.1 What to set up

Two GitHub Actions workflows:

1. **Type checking and linting on push to any `phase-*` branch**
2. **Build verification on push to `main`**

No automated tests yet (test coverage is minimal and building it is not a Phase 0 concern). No deployment automation (there's no deployment pipeline yet and premature automation is waste). No preview environments.

### 5.2 The two workflow files

Create `.github/workflows/typecheck-lint.yml`:

```yaml
name: Type check and lint

on:
  push:
    branches:
      - 'phase-*'
  pull_request:
    branches:
      - main

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint . --ext .ts,.tsx
```

Create `.github/workflows/build-verify.yml`:

```yaml
name: Build verification

on:
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
        env:
          VITE_TMDB_API_KEY: stub
          VITE_OMDB_API_KEY: stub
          VITE_SUPABASE_URL: https://stub.supabase.co
          VITE_SUPABASE_ANON_KEY: stub
          VITE_OPENAI_API_KEY: stub
```

If the build requires real env var values at compile time, use GitHub Secrets to provide them. Most Vite builds tolerate stub values as long as they're syntactically valid.

### 5.3 What to do when CI fails

CI failure on a phase branch: fix the issue before merging. Don't let broken type checks accumulate.

CI failure on `main`: investigate immediately. Main should always be green because it only receives merged-and-checked phase branches.

---

## 6. Scheduled Workflows

This section replaces v0.2's "Cutover" section, which is obsolete under the v1-archival model.

### 6.1 Mood rooms monthly reclustering

Phase 4.5 introduces a monthly Python job that runs HDBSCAN clustering over the content embedding space to generate mood rooms. The job is scheduled via GitHub Actions cron, not Supabase pg_cron, because HDBSCAN has no TypeScript-native implementation and the canonical Python library (`hdbscan`) is the right tool.

Workflow file: `.github/workflows/mood-rooms-recluster.yml`

```yaml
name: Mood rooms monthly reclustering

on:
  schedule:
    - cron: '0 3 1 * *'  # 03:00 UTC on the 1st of each month
  workflow_dispatch:  # allow manual trigger for testing

jobs:
  recluster:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      - run: pip install -r scripts/mood_rooms/requirements.txt
      - run: python scripts/mood_rooms/recluster.py
        env:
          SUPABASE_CONNECTION_STRING: ${{ secrets.SUPABASE_CONNECTION_STRING }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The Python script lives at `scripts/mood_rooms/recluster.py` in the main repo. Dependencies (hdbscan, numpy, psycopg2-binary, openai) are pinned in `scripts/mood_rooms/requirements.txt`.

**Connection approach:** the script uses `psycopg2` with Supabase's direct PostgreSQL connection string (available in the Supabase dashboard), not the Supabase Python REST client. This avoids PostgREST's default row limit when pulling 20K embeddings for clustering, and is measurably faster for bulk vector reads.

**Secrets:**
- `SUPABASE_CONNECTION_STRING` — the direct PostgreSQL connection string from the Supabase dashboard, stored as a GitHub Actions Secret
- `OPENAI_API_KEY` — used for the two-pass LLM labelling of generated clusters, stored as a GitHub Actions Secret

**Runtime expectation:** 5-15 minutes per run at 20K titles. Well within GitHub Actions' 6-hour per-job limit and the ~2,000 minute/month free tier quota.

**Manual trigger:** the `workflow_dispatch` trigger allows Joe or CC to run the job on-demand from the GitHub Actions UI, useful for testing or after significant catalogue changes.

### 6.2 Future scheduled workflows

Any future scheduled jobs (e.g., aggregated metric rollups, weekly mood room rotation refreshes, scheduled embedding re-computation) go in this section. For now, mood rooms is the only one.

---

## 7. Managing Concurrent Work

### 7.1 Referencing v1 code during v2 development

If Joe or CC needs to see how v1 handled something during a v2 phase:

```bash
git checkout v1-archive
# look at the code, understand the v1 approach
git checkout <current-phase-branch>
```

This is a read-only operation — never commit to `v1-archive` or modify it. Tags are immutable by convention; treat this one as such.

Alternative: use GitHub's web UI to browse the `v1-archive` tag directly without a local checkout. Navigate to the repo, switch to the tag, browse the code.

### 7.2 Phase overlap

One phase at a time is the default. Resist the temptation to start the next phase before the previous one is merged.

If overlap becomes necessary later (e.g., Phase 4 ranking pipeline work can start while Phase 1 embeddings finish their backfill), use multiple phase branches:

```
main
├── phase-1-embeddings (in progress, backfill running)
└── phase-4-ranking-pipeline (started early, depends on phase-1)
```

When phase-1 merges to main, rebase phase-4 on top to pick up the embeddings code. This is an advanced pattern and should only be used once the basic one-phase-at-a-time workflow is comfortable.

---

## 8. Backup and Redundancy

### 8.1 Current state

The Videx repository exists in two places:
- GitHub (origin remote)
- Joe's local machine (working clone)

This is the minimum viable backup setup but has GitHub as a single point of failure. For a project at this stage, one additional layer of redundancy is worth the 5-minute setup cost.

### 8.2 Recommended: mirror remote

Set up a second Git remote (GitLab, Bitbucket, or Codeberg) and push to it alongside origin:

```bash
# One-time setup
git remote add backup https://gitlab.com/your-username/videx.git

# When pushing
git push origin main
git push backup main
```

GitLab is free for private repos and works fine as a mirror. You can script this into a `git pushall` alias if the dual push becomes annoying.

**Important: push tags to both remotes explicitly.**

```bash
git push origin --tags
git push backup --tags
```

This ensures `v1-archive` is preserved on both remotes, not just origin.

### 8.3 Supabase backups

Supabase Pro tier includes daily automatic backups with 7-day retention. This is sufficient for v2 development and meaningfully reduces backup risk compared to Free tier.

For extra safety before destructive migrations (e.g., dropping the `content_vector` column at the end of Phase 1), take a manual snapshot via the Supabase dashboard: Database → Backups → "Take a manual backup." These manual backups are retained longer than the automatic daily ones and can be restored selectively.

For the `titles` table specifically (the 20K-title cache), consider a periodic CSV export as a belt-and-braces measure. The cache takes ~20 days to rebuild from TMDb if lost, so it's worth the extra safety.

---

## 9. What This Document Doesn't Cover

Intentionally out of scope:

- **Code style and linting** — handled by existing eslint/prettier config
- **Testing strategy** — varies by phase, specified in each phase brief
- **Deployment automation** — no pipeline yet, not needed during build
- **Monitoring and observability** — post-launch concern
- **Release versioning** — Capacitor handles this, no manual version bumps needed
- **Impression batcher lifecycle manager design** — covered in Detail Page Signal Capture Spec v0.3.1, not here
- **Mood room clustering algorithm details** — covered in Recommendation Engine v2 Strategy v1.6.1, Section 5.2
- **Privacy disclosures, GDPR, and data retention** — covered in Detail Page Signal Capture Spec v0.3.1, Section 6

---

## 10. Summary: What This Document Commits To

1. **v1 is archived as a Git tag** (`v1-archive`) on the current `main` commit. Never deleted, pushed to all remotes.

2. **v2 builds forward on `main`** as a series of phase feature branches (`phase-0-instrumentation`, `phase-0.5-content-enrichment`, etc.), each merged to main when complete.

3. **No parallel run, no cutover ceremony, no feature flags.** The two-prototype-user reality makes these unnecessary.

4. **No Phase 6.5 cleanup phase.** Cleanup of replaced v1 code happens in the phase that replaces it.

5. **Supabase Pro tier** for the duration of v2 development and the first months post-launch. ~£180 expected commitment.

6. **Schema changes are additive within phases, destructive across phases.** Destructive migrations are the final migration of the phase that makes them safe.

7. **Numbered migrations** continue from 011 onward. Migration 011 is the profiles table baseline (codifying a table that currently exists only in production).

8. **Phase branches are plain-named** (`phase-0-instrumentation`), no `v2/` prefix.

9. **Rollback is `git revert -m 1 <merge-sha>`** — a normal Git operation, not a ceremony.

10. **CI runs typecheck + lint on phase branches and build verification on main.** No test automation yet. No deployment automation.

11. **Mood rooms monthly reclustering** runs via GitHub Actions cron (`.github/workflows/mood-rooms-recluster.yml`), using Python + psycopg2 + hdbscan + openai. Secrets via GitHub Actions Secrets.

12. **Mirror remote backup** (GitLab recommended) alongside origin. Tags pushed explicitly to both remotes.

13. **Supabase Pro backups** cover daily retention for 7 days; manual snapshots before destructive migrations provide extra safety.

---

## 11. Confirmed Decisions (from strategy review rounds 1-3)

The following decisions are locked and reflected throughout this document:

**Infrastructure:**
- **Supabase Pro tier:** locked (Section 3.2)
- **OpenAI text-embedding-3-small** for content embeddings: locked (see Recommendation Engine Strategy v1.6.1 Section 5.2)
- **pgvector with HNSW indexing** for nearest-neighbour retrieval: locked (Section 3.4, migration 016)
- **Dedicated `card_impressions` table** with pg_partman monthly partitioning, 90-day row retention, daily aggregate rollups: locked (see Detail Page Signal Capture Spec v0.3.1)
- **HDBSCAN mood rooms via Python + GitHub Actions monthly cron** using psycopg2 direct connection: locked (Section 6.1). Pipeline output reserved for v2.5 dedicated browse surface and Phase 7 conversational discovery — no longer backs the For You row after the Phase 4.5 anchored redirect.
- **Title-anchored mood rooms ranking layer for the For You "Mood Rooms for Tonight" row:** locked (Phase 4.5 redirect, April 2026). Five anchors per user per week from a tiered ladder (behavioural intersection → cluster representatives → top-finalScore fallback) with three Tier 1 guards. Reusable room-generation primitive at `src/lib/recommendations-v2/anchoredRoom.ts`. See Strategy v1.7 §5.2.1 and the Phase 4 Title-Anchored Mood Rooms kick-off for the full lock.

**Server-side For You first paint via `render-foryou-rows` Edge Function:** locked ([ADR-012](../../videx-wiki/wiki/concepts/decisions/adr-012-server-side-foryou-render.md), IN-466 April 2026). One client → Edge Function call replaces 5-8 sequential client → Postgres round trips. Existing `useForYouContent` client pipeline retained as fallback path (1.5s timeout calibrated against 5-12s cold-instance profile). Auth: service-role + manual JWT decode + `withUserScope(uid)` helper, after the auth-spike showed user-JWT-scoped reads cost ~280ms in the critical path. Variant A warm-pinger (`warmup-foryou`) fires from `App.tsx` mount to close the cold-start gap. Three follow-ups filed in Parking Lot v0.5: IN-467 (mirror consolidation), IN-468 (Variant B SWR cache), IN-469 (cold-start mitigation continuation). Phase summary: `docs/v2/phase-summaries/IN-466-server-side-foryou-render-summary.md`.

**Pipeline code mirroring per ADR-011:** locked (April 2026). `supabase/functions/_shared/recommendations-v2/` and `_shared/taste-v2/` mirror `src/lib/recommendations-v2/` and `src/lib/taste-v2/` for Edge Function consumption. The `shared-tree-drift` GitHub Actions workflow fails any PR that touches one tree without the other. Escape hatch: `drift-allowed: <reason>` marker in PR body or commit message for emergency one-sided patches. Long-term consolidation into a runtime-portable shared package filed as IN-467 — revisit after 1-2 months of operational experience.

**Migration and build approach:**
- **v1 archived as Git tag, v2 builds forward on main:** locked (Section 2)
- **No feature flags, no parallel run, no Phase 6.5:** locked (Sections 1.2, 2, 3.3)
- **Profiles baseline migration (011)** codifies the current production schema as the first migration: locked (Section 3.4, Section 12)
- **Phase 0.5 sync split:** one-time backfill runs from Joe's laptop, ongoing enrichment via separate `enrich-new-titles` Edge Function: locked (see Recommendation Engine Strategy v1.6.1 Section 7.2)

**Code changes surfaced by CC review:**
- **`dismiss` event renamed to `not_interested`** during Phase 0, with `getDismissedIds()` rewritten to query `user_interactions` as a drop-in replacement: locked (see Detail Page Signal Capture Spec v0.3.1 and Implementation Notes Parking Lot v0.3.1)
- **localStorage clear on first v2 launch** via `@videx_version` flag check: locked (Phase 0 housekeeping)
- **Hook-level rewrites in Phase 3** explicitly include `useHomeContent.ts`, `useContentDetail.ts`, `useSectionData.ts`, `useRecommendations.ts`, `useHiddenGems.ts`: locked (see Recommendation Engine Strategy v1.6.1 Section 7.2)
- **Detail page "More Like This" scoring in v2** uses batch Supabase query for candidate embeddings + client-side cosine similarity: locked, with a Phase 1 wire format spike as prerequisite (see Recommendation Engine Strategy v1.6.1)

**Content and enrichment:**
- **Runtime backfill** added to Phase 0.5 enrichment scope; embedding template gains a runtime line (omitted if null): locked (see Recommendation Engine Strategy v1.6.1)
- **`title_genres` via static TMDb genre mapping,** reusing the existing `GENRE_NAMES` map in `genres.ts`: locked
- **OMDB backfill sequencing:** Critically Acclaimed New Releases row gated on OMDB completion: locked (see Home & For You Composition Hypothesis v0.3)

**Product framing:**
- **"Depth vs breadth" slider renamed to "Focused ↔ Varied"** to avoid the misleading "finish what I start" framing without episode-level tracking: locked (see Home & For You Composition Hypothesis v0.3)

---

## 12. Action Items Before First Phase

These must be completed before Phase 0 can start. They are ordered roughly by dependency, though several can happen in parallel.

### 12.1 Archive v1

**Task:** tag the current `main` commit as `v1-archive` and push to all remotes.

```bash
git checkout main
git pull
git tag -a v1-archive -m "v1 final state before v2 build begins"
git push origin v1-archive
# After setting up mirror remote (12.5):
git push backup v1-archive
```

**Verification:** `git checkout v1-archive` should work and show the v1 code state. `git checkout main` returns you to active development.

### 12.2 Upgrade Supabase to Pro tier

**Task:** upgrade the Videx Supabase project from Free to Pro via the Supabase dashboard.

**Verification:** dashboard shows Pro tier active, daily automatic backups are scheduled, database size limit is 8GB.

**Cost:** ~£20/month, billed to whichever payment method is attached. Budget for 6-9 months as the realistic minimum commitment.

### 12.3 Run the profiles baseline migration

**Task:** apply migration `011_profiles_baseline.sql` to the live Supabase database. The migration is idempotent — it uses `CREATE TABLE IF NOT EXISTS` and `DROP POLICY IF EXISTS` patterns, so it will succeed against the current production state without modifying existing data.

The migration codifies the production schema:
- `profiles` table with columns: `id` (UUID PK, FK to auth.users), `username` (TEXT UNIQUE NOT NULL), `theme_preference` (TEXT DEFAULT 'system'), `onboarding_completed` (BOOLEAN DEFAULT FALSE), `region` (TEXT DEFAULT 'GB'), `is_test_user` (BOOLEAN DEFAULT FALSE), `created_at`, `updated_at`
- Five RLS policies (public username lookup, users access own profile, users can insert/update/view own profile)
- Trigger function `handle_new_user()` that auto-creates a profile row on auth.users INSERT
- Trigger `on_auth_user_created` on auth.users

The full SQL for this migration is captured in Implementation Notes Parking Lot v0.3.1 entry IN-PRE-001.

**Verification after apply:**
- `\d+ profiles` shows the same schema as before
- New auth signups still create profile rows (via the trigger)
- RLS policies remain functional

**Note on the "public username lookup" policy:** this policy allows unauthenticated read access to the entire profiles table, which was intended to support username availability checking but is wider than necessary. It is preserved exactly as-is in the baseline migration. A tightening pass is flagged in Implementation Notes Parking Lot v0.3.1 entry IN-XPS-002 as a pre-public-launch task.

### 12.4 Set up GitHub Actions CI

**Task:** create `.github/workflows/typecheck-lint.yml` and `.github/workflows/build-verify.yml` per Section 5.2. Commit them to `main` before the first phase branch is created so the CI runs from phase-0 onwards.

**Verification:** first push to `main` triggers the build verification workflow; first push to a `phase-*` branch triggers the typecheck + lint workflow. Both workflows succeed on a known-good codebase.

### 12.5 Set up mirror remote for backup

**Task:** create a private GitLab (or Bitbucket/Codeberg) repository, add it as a Git remote named `backup`, push all branches and tags.

```bash
# After creating the mirror repo on GitLab:
git remote add backup https://gitlab.com/your-username/videx.git
git push backup --all
git push backup --tags
```

**Verification:** GitLab shows all branches and tags mirrored. Future pushes to `main` can be duplicated to `backup` manually or via a push alias.

### 12.6 Verify Supabase Pro backups are active

**Task:** after the Pro tier upgrade (12.2), confirm daily automatic backups are scheduled in the Supabase dashboard (Database → Backups). Take one manual snapshot as a baseline.

**Verification:** dashboard shows at least one automatic backup entry and the manual snapshot. Retention period is 7 days or longer.

### 12.7 Confirm current main is in a known-good state

**Task:** before tagging `v1-archive`, run the current v1 app end-to-end on the Android test device. Confirm onboarding works, content loads, basic navigation functions, the quiz completes, and the home page renders. Note any outstanding v1 bugs that should be recorded (but not fixed — they're v1 and about to be archived).

**Verification:** v1 app launches and works. Any known issues are recorded in the Notion tracker or an archived notes file so future-Joe has context if ever needed.

### 12.8 Check off items in Notion

Once all the above are complete, update the Notion project tracker so Phase 0 can start with a clean prerequisite list. No Phase 0 work begins until 12.1 through 12.7 are all ticked off.

---

*End of Project Orchestration v0.3.1. All decisions from strategy review rounds 1-3 incorporated. Cross-document corrections applied per Corrections v0.3.1. Ready for Phase 0 preparation.*
