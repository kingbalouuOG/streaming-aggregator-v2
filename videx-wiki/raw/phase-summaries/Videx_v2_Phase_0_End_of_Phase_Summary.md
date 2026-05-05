# Videx v2 — Phase 0 End-of-Phase Summary

**Phase**: 0 — Instrumentation
**Branch**: `phase-0-instrumentation`
**Phase-complete commit**: `85f35d29617cd7ad68c4f81574f09c1ba84c6dce`
**Recommended tag**: `v2-phase-0-complete`
**Completed**: 2026-04-10
**Merged to main**: _pending_ (awaiting explicit approval)

---

## 1. What was built

Phase 0 laid the behavioural signal pipeline the Phase 3+ recommendation engine will consume, closed the transitional dismissal gap so the v1 engine keeps working through Phases 1–3, and prepared the `profiles` and `user_interactions` schemas for Phase 1 onboarding. No ranking changes, no v2 UI beyond one new button (Not Interested).

**Migrations (5 applied, 3 planned)**:

| # | File | Purpose |
|---|---|---|
| 012 | `012_profiles_v2_onboarding_fields.sql` | Adds `age_range` and `viewing_context` (nullable TEXT) for v2 onboarding Step 1. |
| 013 | `013_user_interactions_v2_expansion.sql` | Adds top-level `session_id` and `source_surface` columns, renames the unused `dismiss` event_type to `not_interested`, introduces a CHECK constraint listing 15 allowed event types (v1 + Phase 0 additions + forward-compat names). |
| 014 | `014_card_impressions_table.sql` | Creates `card_impressions` (partitioned by month via pg_partman, range on `shown_at`, 3-month retention), `card_impression_daily_totals` aggregation table, and two pg_cron jobs (`card_impressions_rollup` at 01:00 UTC, `pg_partman_maintenance` at 02:00 UTC). |
| **015** | `015_card_impressions_partition_rls.sql` | **Deviation.** Enables RLS on the parent table's existing child partitions + the template table. |
| **016** | `016_card_impressions_rls_event_trigger.sql` | **Deviation.** Installs a `ddl_command_end` event trigger that automatically enables RLS and creates the per-user policies on any new `card_impressions_*` partition as it is created. |

**New client-side modules**:

| Path | Responsibility |
|---|---|
| `src/lib/lifecycle/appState.ts` | Single source of truth for Capacitor `appStateChange`. Subscribers receive `(isActive, expected)`. Owns the 3-second deep-link correlation window. Web preview falls back to `document.visibilitychange`. |
| `src/lib/instrumentation/sessionId.ts` | Lazy UUID per session. Rolls over after ≥ 5 minutes of background. Exposes `onSessionReset` for stateful consumers. |
| `src/lib/instrumentation/impressionBatcher.ts` | Synchronous `recordImpression` buffer + asynchronous `flushNow`. Six flush triggers all wired. One retry on failure then drop. `user_id` stamped at record time. |
| `src/lib/instrumentation/dwellTimer.ts` | Per-detail-page timer with pause/resume on background, `sessionIdAtStart` captured at `startDwell` and used at emit time, idempotent `exitDwell`, 5-minute abandonment fallback, 10-second deep-link safety net, session negative-weight accumulator (capped at −1.0, emitted as metadata). |

**Modified client code**:

- `src/lib/storage/recommendations.ts` — IN-008 rewrite of `getDismissedIds()` to query `user_interactions` instead of localStorage. Four legacy functions deleted. Module-level session cache + `invalidateDismissedIdsCache` export.
- `src/lib/utils/recommendationEngine.ts` — Removed the `cleanExpiredDismissals()` import and call at L557.
- `src/lib/storage/interactions.ts` — `dismiss → not_interested` rename, added `source_surface` + `session_id` top-level fields, new `markNotInterested`, `emitDwellEvent`, `emitDeepLinkClick`, migrated `emitDetailView` to top-level `source_surface='detail'`.
- `src/lib/openDeepLink.ts` — Signature change to accept `DeepLinkContext`. Confidence tagging with `linkType` (exact vs search). `markDeepLinkExpected()` called **before** the `await AppLauncher.openUrl` to avoid a race.
- `src/components/DetailPage.tsx` — Dwell-timer mount/unmount integration, `setLastAction` on thumbs / watchlist / watched buttons, new "Not Interested" button with `EyeOff` icon, both `handleServiceTap` and `handleRentBuyTap` thread `linkType` through to `openDeepLink`.
- `src/components/ContentRow.tsx` — New `sourceSurface` prop, per-row dedup `Set<string>` keyed by `content_id:session_id`, cleared on `onSessionReset`, fires `recordImpression` in a `useEffect`.
- `src/App.tsx` — `flushNow()` fire-and-forget in `handleTabChange` (flush trigger #5) and `handleItemSelect` (flush trigger #6), all 5 home ContentRows receive `sourceSurface="home"`.
- `src/main.tsx` — IN-012 localStorage v1 purge gated by `@videx_version='2'` flag. Exact key list + `tmdb_*`/`sa_*`/`omdb_*` prefixes.

**Diff size** (all 15 commits): 17 files changed, 1,792 insertions, 104 deletions.

---

## 2. Verification — what was proven green

### Database-level (via `npx supabase db query --linked`)

| Check | Result |
|---|---|
| Migrations 011 → 016 applied in order, remote matches local | ✅ |
| `\d profiles` shows `age_range`, `viewing_context` (NULL for existing rows) | ✅ |
| `\d user_interactions` shows `session_id`, `source_surface`, CHECK constraint | ✅ |
| `dismiss` insert rejected with CHECK violation (service-role bypass) | ✅ |
| `not_interested` insert succeeds with new columns populated | ✅ |
| `card_impressions` partitioned correctly (monthly partitions + default + template) | ✅ |
| `SELECT * FROM cron.job` shows `card_impressions_rollup` + `pg_partman_maintenance` | ✅ |
| Parent + every existing partition + template all `rowsecurity=true` | ✅ |
| New partition created via `create_partition_time()` inherits RLS and both policies from the event trigger | ✅ (proven by forcing a Sept 2026 partition post-016) |

### Client-side (typecheck + lint + build)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean on every commit |
| `npx eslint <touched files>` | ✅ Zero new warnings (one pre-existing `useLayoutEffect` exhaustive-deps at `DetailPage.tsx:91` untouched) |
| `npm run build` | ✅ Clean production build |
| Single-listener invariant: `git grep "addListener('appStateChange'"` | ✅ Exactly one hit in `src/lib/lifecycle/appState.ts:61` |

### End-to-end on real device (production APK against prod Supabase)

| # | Check | Result |
|---|---|---|
| 1 | localStorage v1 purge runs once, sets `@videx_version='2'`, preserves user data | ✅ |
| 2 | Impression pipeline: ~75 rows after home browse, all `source_surface='home'`, single session_id, every `content_id` count = 1 (dedup working) | ✅ |
| 3 | `count(*) FROM card_impressions WHERE user_id IS NULL` = 0 | ✅ |
| 4 | `detail_view` carries top-level `source_surface='detail'` | ✅ |
| 5 | Dwell back-to-previous, ~15 s → `dwell_event` with `exit_reason='back_to_previous'`, `dwell_seconds ≈ 15`, `session_negative_accumulator = -0.25` | ✅ |
| 6 | Dwell background 30 s mid-session → resumes, final `dwell_seconds` excludes the background interval | ✅ |
| 7 | Dwell 6-min background → abandonment fires with `exit_reason='app_backgrounded'` and the OLD `sessionIdAtStart` | ✅ |
| 8 | Session negative accumulator caps at −1.0 across 5+ rapid back-navs | ✅ |
| 9 | IN-008 end-to-end: insert `not_interested` row, refresh recs, title disappears | ✅ |
| 10 | Not Interested button emits `not_interested` + `dwell_event` with `exit_reason='not_interested'`, title vanishes on next refresh | ✅ |
| 11 | Deep link high-confidence (Netflix, exact deep link, app installed) → `confidence='high'` | ✅ |
| 12 | Deep link low-confidence (Prime, `FORCE_SEARCH_FALLBACK` + `linkType='search'`) → `confidence='low'` | ✅ |
| 13 | Fast-return after deep link → `exit_reason='deep_link_click'` NOT `'app_backgrounded'` (race fix working) | ✅ |
| 14 | Android hardware back button triggers unmount → `exit_reason='back_to_previous'` | ✅ |

All 14 end-to-end checks passed against the production Supabase instance with a real signed-in test user.

---

## 3. Deviations from the locked plan

Three deviations, all documented and all in-scope for correctness of what Phase 0 was supposed to deliver. Not scope creep.

### Deviation 1 — Migration 014 schema-prefix amendment

**What changed**: The committed-and-pushed migration 014 SQL was amended via `git commit --amend` + `--force-with-lease` (commit `11ddf33` superseded `5c49a34`) before it was applied to production.

**Why**: On Supabase Pro, pg_partman v5.3.1 installs into the `public` schema, not into a `partman` schema as the canonical pg_partman docs suggest. The first `supabase db push` attempt failed at `partman.create_parent(...)` with `schema "partman" does not exist`. Transaction rolled back cleanly. The amendment drops the `partman.` prefix from three references (`create_parent`, `part_config`, `run_maintenance_proc`) and reorders `create_parent`'s named arguments to match the v5 signature.

**Impact**: Zero functional impact. The amended migration applied cleanly. Comment block in the SQL file documents the install history and the v5 signature change so future rebuilds from source control understand why pg_partman is unqualified.

### Deviation 2 — Migration 015: existing partition RLS hardening

**What**: New migration not in the original plan's 012/013/014 set. Enables RLS on each child partition that existed at apply time, creates a `card_impressions_template` table with the same policies, and wires it via `part_config.template_table`.

**Why**: Joe's added Task 3 verification check (`SELECT rowsecurity FROM pg_tables WHERE tablename LIKE 'card_impressions_p%'`) returned `rowsecurity = false` on every child partition after 014 applied. In Postgres, RLS does not propagate from a partitioned parent to its children, and 014's `ENABLE ROW LEVEL SECURITY` on the parent was insufficient. Without 015, direct partition access (`SELECT * FROM card_impressions_p20260401`) would have bypassed RLS entirely.

**False trail embedded in 015**: The template_table approach was based on a misreading of the pg_partman v5 docs. Template tables propagate constraints, indexes, and `CLUSTER` settings — NOT RLS state or policies. This was empirically caught during verification (force-creating a new partition still showed `rowsecurity = false`), which led to migration 016. 015's header was amended to document this limitation explicitly so future maintainers don't assume it's a complete fix. Migration 015 remains required because it handles the existing-partition case and the template is still useful for constraint propagation.

### Deviation 3 — Migration 016: event trigger for new partitions

**What**: Second new migration beyond the plan. A `ddl_command_end` Postgres event trigger (`card_impressions_rls_on_create`) fires on every CREATE TABLE, filters aggressively to `public.card_impressions_p%` and `card_impressions_default`, and calls a plpgsql function (`card_impressions_ensure_rls`) that enables RLS and recreates both policies inline with the DDL.

**Why**: The only mechanism that gives zero exposure window for both normal partman daily maintenance AND manual `create_partition_time` calls. Two alternatives were considered and rejected: (B) a secondary pg_cron cleanup job at 02:05 UTC after partman maintenance, and (C) a wrapper procedure replacing the partman maintenance cron. Both B and C had non-zero exposure windows for manual partition creation, and C added ordering coupling between two cron jobs.

**Implementation notes**:
- `SECURITY DEFINER` with `SET search_path = public, pg_catalog` and `ALTER FUNCTION ... OWNER TO postgres` hardening
- `REVOKE EXECUTE FROM PUBLIC` defence in depth
- 5-condition defensive filter (`command_tag`, `object_type`, `schema_name`, `in_extension`, `object_identity` prefix/exact match) using `IS DISTINCT FROM` for NULL safety
- Per-partition `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING` that logs failures loudly without aborting the firing DDL (fails open — a blocked CREATE TABLE would break the daily partman cron and cascade)
- Empirically verified viable on Supabase via a `BEGIN`/`ROLLBACK` permission probe before writing the migration
- Field names in `pg_event_trigger_ddl_commands()` empirically verified via a throwaway probe trigger before relying on them

**Impact**: Zero RLS exposure window for any future `card_impressions_*` partition, regardless of how it's created. Verified end-to-end by force-creating a Sept 2026 partition via `create_partition_time` and confirming `rowsecurity = true` + both policies immediately.

### Deviation 4 — Post-verification Task 9a hotfix (commit `85f35d2`)

**What**: Two bugs in Task 9a (deep link confidence tagging) caught during the on-device verification pass on 2026-04-10, fixed in a single commit after the plan's locked task list was notionally "complete".

**Bug 1 — Race condition**: `markDeepLinkExpected()` was called AFTER `await AppLauncher.openUrl(...)`, but on Android the intent dispatches before the openUrl promise resolves. The `appStateChange` background event raced in before the correlation window was armed, the dwell timer took the normal-background branch, and the 5-minute abandonment fallback fired (observed as `exit_reason='app_backgrounded'` after fast-return from Netflix).

**Fix**: Moved `markDeepLinkExpected()` to before the await. Race eliminated structurally.

**Bug 2 — Classification**: `AppLauncher.openUrl` returning successfully does not mean the user landed in the native app. For services in `FORCE_SEARCH_FALLBACK` (Prime Video) or any service with no exact deep link, `getDeepLink` returns a search-page URL tagged `type: 'search'`. The OS routes it — success — but the browser opens the search page, not the target app. Observed as `confidence='high'` on Prime Video despite landing in browser.

**Fix**: Added `linkType: 'exact' | 'search'` to `DeepLinkContext`. On the success path, `confidence = linkType === 'exact' ? 'high' : 'low'`. Search URLs always emit `low`. Both call sites in `DetailPage.tsx` already had `deepLink.type` from `getDeepLink` and now thread it through.

**Why this counts as in-phase correctness rather than scope creep**: The plan specified IN-013 (deep link confidence tagging) as Task 9a. My first implementation had two bugs. They were caught by Joe's own verification steps during the native pass, and the fix is a minimal correction to the original task. Deferring these fixes to Phase 1+ would have shipped Phase 0 with deep link signals that would have corrupted Phase 3's taste vector learning the moment it came online.

---

## 4. What was learned

### Technical lessons worth carrying forward

1. **pg_partman `template_table` is for constraints, not RLS.** The v5 docs hint at "properties cloned to new partitions" but specifically mean CLUSTER, UNIQUE, CHECK constraints, and index definitions. RLS state and policies are NOT cloned. The only correct pattern for RLS on partman-managed partitioned tables is an event trigger (migration 016's approach) — see Parking Lot entry below for the reference.

2. **Supabase installs pg_partman into `public`, not `partman`.** This is common to several Supabase extensions (pgcrypto, pg_trgm, pg_partman) and keeps extension object lookups on the default search path. Any migration using partman on Supabase should reference its functions unqualified. Extension install order matters: pg_partman was manually installed via `supabase db query` on 2026-04-09 before the first migration 014 could apply, because `CREATE EXTENSION IF NOT EXISTS pg_partman` inside the migration depends on the extension already being enabled by the dashboard's extension management or a prior explicit install.

3. **Capacitor's `appStateChange` and `AppLauncher.openUrl` race.** On Android, the intent dispatches before the `openUrl` promise resolves. Any JS state that needs to be "set before the background event arrives" must be set BEFORE the `await`, not after. Phase 0 learned this the hard way via Native C's `exit_reason='app_backgrounded'` false positive.

4. **`AppLauncher.openUrl` success ≠ landing in the target app.** A successful return from `openUrl` means the OS intent resolver accepted the URL. For search-fallback URLs (or any URL the target service's native app doesn't have an App Link for), the browser handles the URL instead. The heuristic `openUrl resolved → high confidence` is wrong for any service without a reliable exact deep link. Tag the URL at resolve time (exact vs search) rather than inferring confidence from the openUrl outcome.

5. **Session ID capture must happen at the moment of interaction, not at emit time.** The dwell timer captures `sessionIdAtStart = getCurrentSessionId()` in `startDwell()` and reuses that value for every subsequent `emitDwellEvent`. Without this, the 5-minute abandonment case would emit dwell events tagged with the NEW session ID (the one minted after rollover) instead of the session the user was actually looking at the page during. This pattern will matter for any future Phase 3 consumer that does session-bounded analytics.

6. **Event triggers are available on Supabase Pro under the `postgres` role.** Empirically verified via a `BEGIN`/`CREATE EVENT TRIGGER`/`ROLLBACK` probe before committing to the approach. Worth knowing for any future table that needs DDL-level automation.

### Process lessons

1. **Empirically verify Postgres function signatures before writing migrations.** For migration 014, I assumed the pg_partman v4 `create_parent` signature from the docs; the actual v5 signature had reordered named parameters. One `SELECT pg_get_function_arguments` query against the remote caught it. Same pattern used successfully for migration 016 (`pg_event_trigger_ddl_commands()` field names) and saved a second round of amendments.

2. **Joe's added verification checks surfaced both partition RLS bugs.** The original plan's verification list didn't include "enable RLS on new partitions" as a standalone check — it was absorbed into "partitions exist and work". Joe added "force-create a partition and check rowsecurity" as an explicit post-015 step, which is what caught the template_table false trail. The lesson: verification checks that force the system into its edge-case paths are worth more than checks that verify the happy path works.

3. **Running the full production APK end-to-end caught two race conditions that desktop testing could not.** Bug 1 (Task 9a fast-return race) was a native-specific timing issue. Bug 2 (Prime Video high-confidence misclassification) was a misunderstanding of what `AppLauncher.openUrl` success means on Android. Neither would have shipped to Phase 1 without on-device verification.

---

## 5. Parking Lot entries to file

These should be added to `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0_3_2.md` (or its successor) before Phase 1 kick-off.

### IN-PX-01: RLS on pg_partman-managed partitioned tables requires an event trigger

Postgres does not propagate RLS from a partitioned parent to its child partitions. pg_partman's `template_table` mechanism propagates constraints, indexes, and CLUSTER settings, but does NOT propagate RLS state or policies — despite what the v5 docs appear to imply. `inherit_privileges = true` covers GRANT-style privileges only, not RLS.

Any future partitioned table in Videx that needs RLS (analytics tables, log tables, anything added in Phases 4.5+) must follow the pattern established in migration 016: a `ddl_command_end` event trigger that fires on every `CREATE TABLE`, filters to the target table's partition name prefix, and applies `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` inline. Use `SECURITY DEFINER` + `SET search_path` + `REVOKE EXECUTE FROM PUBLIC` hardening. Wrap the per-partition work in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING` so partition creation never gets blocked.

Migration 016 (`src/../supabase/migrations/016_card_impressions_rls_event_trigger.sql`) is the reference implementation. Migration 015 remains useful as a template for handling the existing-partition case at apply time, but its `template_table` wiring should not be relied on for RLS on new partitions.

**Reference**: Task 3 verification of Phase 0 surfaced this gap empirically after the initial `template_table` assumption proved wrong on 2026-04-09. See migration 015's `KNOWN LIMITATION` header block and migration 016's narrative header for the full story.

### IN-PX-02: Consolidate v1 `watched`/`removed` event types with v2 `marked_watched`/`watchlist_remove`

Migration 013's CHECK constraint accepts both sets of names — the v1 names still emitted by current code (`watched`, `removed`) and the v2 names from Signal Spec §5.1 (`marked_watched`, `watchlist_remove`) — to avoid rewriting v1 emitters during Phase 0. The event log will carry two names for the same concept until a future cleanup migration consolidates them.

A cleanup migration in Phase 2 or later should: (a) backfill historical v1 events to the v2 names via `UPDATE user_interactions SET event_type = ... WHERE event_type IN (...)`, (b) update all code emitting `watched` / `removed` to use the v2 names, (c) remove the v1 names from the CHECK constraint. Worth auditing any analytics queries or taste-vector recomputation jobs that reference either name before the consolidation.

### IN-PX-03: Revisit impression dedup granularity if Phase 3 analytics needs per-row CTR

**Filing as precautionary — Phase 3 may or may not hit this.**

The impression batcher dedups on `(content_id, session_id)` inside `ContentRow`. This handles React remounts cleanly (a remount within the same session does not double-log) and keeps `card_impressions` row counts proportional to unique cards shown. But it means if the same movie appears in both "For You" and "Popular on Your Services" during the same session, only one row lands in `card_impressions`. The row-title signal ("which row was this impression in?") is lost.

If Phase 3 analytics need per-row CTR instead of per-card-per-session impression counts, the dedup key needs to change to `(content_id, source_surface, row_title, session_id)` or similar. Review at the start of Phase 3 before impression analytics work begins. Migration-free change — just a client-side constant.

### IN-PX-04: `@app_hidden_gems` localStorage key doesn't actually exist

The localStorage purge in `main.tsx` (Task 9c / IN-012) includes `@app_hidden_gems` in its exact-match key list. During the Phase 0 codebase audit, I searched the repo and confirmed this key is **not actually written anywhere** by v1 code. It was listed in the Phase 0 brief for belt-and-braces robustness, which is fine — it's a no-op. But any future audit of `main.tsx` should note that this is an intentional no-op rather than active cleanup, and it can be removed from the list when the purge is eventually retired post-launch.

---

## 6. Files changed summary

```
 src/App.tsx                                        |  17 +-
 src/components/ContentRow.tsx                      |  48 +++-
 src/components/DetailPage.tsx                      | 138 ++++++++++-
 src/lib/instrumentation/dwellTimer.ts              | 258 +++++++++++++++++++++
 src/lib/instrumentation/impressionBatcher.ts       | 179 ++++++++++++++
 src/lib/instrumentation/sessionId.ts               |  89 +++++++
 src/lib/lifecycle/appState.ts                      | 125 ++++++++++
 src/lib/openDeepLink.ts                            | 119 ++++++++--
 src/lib/storage/interactions.ts                    | 124 +++++++++-
 src/lib/storage/recommendations.ts                 | 100 ++++----
 src/lib/utils/recommendationEngine.ts              |   3 -
 src/main.tsx                                       |  59 ++++-
 supabase/migrations/012_profiles_v2_onboarding_fields.sql    |  22 +
 supabase/migrations/013_user_interactions_v2_expansion.sql   |  81 +++++
 supabase/migrations/014_card_impressions_table.sql           | 181 +++++++++++
 supabase/migrations/015_card_impressions_partition_rls.sql   | 123 ++++++++
 supabase/migrations/016_card_impressions_rls_event_trigger.sql | 230 ++++++++++++
 17 files changed, 1,792 insertions(+), 104 deletions(-)
```

---

## 7. Commit history (oldest to newest)

```
ea1e456 [Phase 0] Rewrite getDismissedIds to query Supabase (IN-008)
af78f4e [Phase 0] Add lifecycle manager and session ID modules (IN-006, IN-009)
6731985 [Phase 0] Rename dismiss→not_interested; add session/source_surface emitters
02905c1 [Phase 0] Migration 012: profiles v2 onboarding fields
fa9487f [Phase 0] Migration 013: user_interactions v2 expansion
11ddf33 [Phase 0] Amend migration 014: unschema partman references for Supabase v5.3.1
13f2435 [Phase 0] Migration 015: card_impressions partition RLS hardening (Task 3 followup)
850d847 [Phase 0] Amend migration 015: document template_table RLS limitation
3ef0755 [Phase 0] Migration 016: card_impressions partition RLS via event trigger (Task 3 followup, supersedes 015 template approach)
907f999 [Phase 0] Add dwell timer and wire DetailPage lifecycle
458f0c0 [Phase 0] Add impression batcher and wire ContentRow + home flushes
1fa71ed [Phase 0] Deep link confidence tagging (IN-013)
78bb557 [Phase 0] Not Interested button on detail page (Task 9b / IN-007)
31e40f3 [Phase 0] localStorage v1 purge on first launch (Task 9c / IN-012)
85f35d2 [Phase 0] Fix two deep link confidence bugs surfaced by native testing
```

---

## 8. Recommendations for Phase 1 kick-off

1. **Tag and merge first.** Create tag `v2-phase-0-complete` at commit `85f35d2` on `phase-0-instrumentation`, then merge to main with `--no-ff`. Push tag + main.
2. **File the four Parking Lot entries** above into the next revision of the Parking Lot doc before drafting the Phase 1 brief.
3. **Phase 1's onboarding spec can now assume** `profiles.age_range` and `profiles.viewing_context` exist. Both are nullable TEXT with no default, so the onboarding Step 1 UI is the only writer.
4. **Phase 3's engine work** can assume `user_interactions` has `session_id` and `source_surface` as queryable top-level columns, and that `dwell_event` rows carry `session_negative_accumulator` as a real metadata field (not just a debug log). If Phase 3 decides not to use it, retire the field in a dedicated migration and update `dwellTimer.ts` to stop emitting it.
5. **Phase 3 should re-evaluate** whether the `watched`/`marked_watched` and `removed`/`watchlist_remove` dual naming (see IN-PX-02) is worth consolidating before engine work begins, because the taste vector will need to treat both as the same signal until the cleanup lands.

---

## 9. Sign-off

All 9 tasks from the Phase 0 plan complete, plus three in-phase deviations (migrations 015, 016, and a Task 9a hotfix) all documented above. All 14 end-to-end verification checks green against production Supabase with a real signed-in test user on a production APK build. Typecheck, lint, and production build all clean at the phase-complete commit.

Ready to tag, merge to main, and start Phase 1.
