---
title: Risks register
type: concept
tags: [risks, mitigations, ops]
created: 2026-04-26
updated: 2026-08-25
sources:
  - raw/reference/risks-register.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/service-role-jwt-rotation.md
  - wiki/concepts/operations/supabase-backup-restore.md
---

# Risks register

Living list of known risks and mitigations. Severity is engineering judgement; revisit at phase boundaries.

| ID | Risk | Severity | Mitigation | Owner |
|---|---|---|---|---|
| R-001 | OpenAI deprecates `text-embedding-3-small` | Medium | Pin model string. Coordinated regen of titles + user vectors. Cost negligible (~$0.03 full backfill). | Eng |
| R-002 | SA API ceases operation | Medium | Cache fully populated in Supabase; degrade to last known state with stale flag. Fallback to TMDb watch/providers + search-URL deep links. | Eng |
| R-003 | TMDb terms of service change | Medium | Comply with attribution. Maintain network-name fallback for `watch/providers`. | Eng |
| R-004 | Service-role key leaked | High | Rotate per [service-role-jwt-rotation](service-role-jwt-rotation.md). Migrate to Supabase Vault pre-launch. Audit recent activity. | Eng |
| R-005 | iPlayer / Sky Go gap stays open at launch | Low | Search-URL fallback in place. Discoverability via TMDb watch/providers preserved. Document in user-facing FAQ. | Product |
| R-006 | Mood Rooms become stale between monthly recluster | Low | Acceptable; titles do not move clusters fast. Manual recluster trigger available. | Eng |
| R-007 | HNSW recall drops as catalogue grows past 100K | Medium | Monitor in `rank-eval.ts`. Tune `ef_search`. Consider IVFFlat if recall degrades. | Eng |
| R-008 | Pricing data drifts from reality | Medium | Quarterly review (IN-XPS-007). Consider external pricing source pre-launch. | Product |
| R-009 | RLS misconfiguration silently leaks data | High | Pre-deploy checklist (see [RLS pattern](../techniques/rls-pattern.md)). Run Supabase linter at each phase boundary. Audit `pg_policies` for new tables. | Eng |
| R-010 | pg_cron job fails silently | Medium | ✅ Mitigated 2026-08-26. Materialised 2026-06-07 and ran 79 days: `cron.job_run_details` was the monitored surface and only records that pg_net *queued* the request, so every run showed `succeeded` while TMDb returned 401 to every call. Fixed in two halves — **legibility** (A1, migrations 066/067/068: honest `sync_log` counts, populated `error_details`, heartbeats, watchdog) and now **alerting** (`pipeline-health` GitHub Actions workflow, daily 09:00 UTC, 10 assertions built around the ABSENCE of expected success rather than the presence of errors — an error-triggered alert would have stayed silent for all 79 days). Runs outside Supabase deliberately; see [sync-pipeline](sync-pipeline.md). Residual: a sustained GitHub Actions outage would go unnoticed. | Eng |
| R-011 | Embedding template change breaks coherence | Medium | `eval-cluster-coherence.ts` thresholds gate any template change. Maintain previous template definition for reproducibility. | Eng |
| R-012 | Capacitor 8 plugin incompatibility on Android update | Low | Pin Capacitor + plugin versions. Test on latest Android release before Play Store update. | Eng |
| R-013 | Onboarding drop-off reduces taste vector quality | Medium | Funnel queries flag step-by-step drop-off. Iterate copy and progress UI. | Product |
| R-014 | OMDB free-tier quota exhausted | Low | Cache aggressively. Sync skips already-rated titles. Upgrade if needed. | Eng |
| R-015 | Backup retention insufficient for incident recovery | Medium | ✅ Mitigated 2026-07-11: monthly off-site encrypted `pg_dump` (public + auth schemas) via `db-backup.yml`, 90-day artifact retention. Manual snapshot before destructive migrations still applies. | Eng |
| R-016 | `claim_push_token` (migration 060) lets any authenticated user claim any push-token string — a leaked token's alert channel can be redirected/silenced | Low | ACCEPTED by design (pre-launch review 2026-07-12): token possession is treated as device-control proof; restricting claims to unowned/own rows would break the shared-device reclaim flow 060 exists for. Exposure requires a leaked Expo token AND a signed-in attacker. Revisit if tokens ever appear in logs/support tooling. | Eng |
| R-017 | Third-party API credentials expire silently and no surface says so | High | ⚠ **Materialised**: the Edge Functions' `TMDB_API_KEY` began returning 401 around 2026-06-07 and was found on 2026-08-25 — 79 days, ~22.3K titles of backlog. Partially mitigated: `backfill-missing-titles` now aborts the whole chain on the first 401/403 and writes it to `sync_log.error_details` instead of walking 300 IDs against a dead key. Residual: no expiry tracking and no alert on any key (TMDb, OMDB, SA/RapidAPI, OpenAI). Rotation is manual and undated. | Eng |
| R-018 | Long Edge Function jobs are killed mid-run and report success | Medium | ✅ Mitigated 2026-08-25 (A2): jobs are sliced and self-chain via `enqueue_function_call` (migration 067). Slices were initially sized at 18s, which caused R-020; resized to 75s the same day. A partial window is marked `failed`, never `completed`, so `getLastSyncTimestamp()` cannot advance past unfetched pages. Was costing ~42.8% of incremental runs (62 of 145 since 2026-03-31) and a matching share of SA API quota on re-fetched pages. | Eng |
| R-019 | Catalogue backlog does not drain at the scheduled cadence | Medium | ✅ Addressed 2026-08-26 (A5, migration 069). Worse than first assessed: the gap was *growing* (22,260 → 22,729 in a day, after a chain drained 595), because the daily SA sync adds ~1,000 gaps/day against a weekly chain's ~428/day. Daily cadence nets ~2,000/day and clears ~22.7k in ~11 days. **A4 is no longer needed.** A3 shipped 2026-08-26 (migration 070) — `list_missing_title_ids` is now ordered by most-recent availability, so the queue head is titles that became available in the last 30 days rather than pre-2000 catalogue. Watch `count_missing_title_ids()`: if it climbs on a daily cadence, raise `MAX_CHAIN_DEPTH`. | Eng |
| R-020 | A chain handoff is queued but never delivered, stopping the chain silently | Medium | ✅ Mitigated 2026-08-25 (migration 068). Observed live: an HTTP 502 from the Edge Runtime killed a chain at slice 12, because workers linger past their request and twelve 18s invocations exhausted the worker allowance. `enqueue_function_call` only proves pg_net *queued* the request — the same blind spot as `cron.job_run_details`, one layer down. `resume_stalled_chains()` (pg_cron, 5 min, pure SQL) restarts stalled chains and records the delivery status; slices resized 18s to 75s so there are far fewer handoffs to lose. | Eng |
| R-021 | Titles exist in the catalogue but cannot be recommended | Medium | Structural: `embed-new-titles` skips rows with `keywords IS NULL`, and `match_titles_by_vector` cannot retrieve a row with `embedding IS NULL` — so an unenriched title is invisible to For You however healthy `count(*) FROM titles` looks. Mitigated 2026-08-25 by slicing both downstream jobs and batching the OpenAI calls (100 titles/request instead of 1). Judge catalogue health on embedding coverage, not row count. | Eng |
| R-022 | Per-row DB round trips silently cap a sliced job's throughput | Low | Measured 2026-08-26: `embed-new-titles` spent ~400ms/row on a single-column `UPDATE`, capping a 75s slice at ~200 rows — the third-party API was already batched and was not the constraint. Fixed for embeddings by `bulk_set_title_embeddings()` (migration 069). Generalises: when sizing any sliced job, measure the DB round trips before assuming the external API is the bottleneck. | Eng |
| R-023 | A merged PR lands fewer commits than the branch tip | Medium | Happened 2026-08-26: PR #85 merged at `02baa65`, three commits behind the tip, silently dropping a stall-trap fix, the `truncated` drain-check fix, and a wiki entry. It surfaced only because a later branch cut from `main` was missing a field. Worse, it left the *deployed* Edge Functions ahead of `main` with no way to tell from behaviour. Recovered by cherry-pick in #86. Mitigation is procedural: check the commit count on the merge screen, and after any merge that precedes a deploy, redeploy from a freshly pulled `main` rather than a local tree. | Eng |
| R-024 | HNSW index evicted while idle, so every real cold open pays ~4s | High | ✅ Mitigated 2026-08-26 (B1, migration 073). Measured live: the same query ran 4,155ms cold (`read=508`) and 12ms warm (`read=0`) — 336x, entirely index pages coming off disk. Insidious because a developer who has just been querying the DB always measures the warm number. `warm_recommendation_caches()` runs every 5 min via pg_cron and records to `cache_warm_status`; the daily health check asserts on it, since a stopped warmer fails nothing and simply restores the 4s. | Eng |
| R-025 | A read-through cache that populates on completion does not de-duplicate concurrent callers | Low | `getAvailableTmdbIds` wrote its localStorage entry only after the RPC resolved, so two concurrent callers both missed and both fired a 1.2-2.9s / 256KB RPC. This forced `fetchHomeFeed` to serialise the call, blocking seven unrelated requests. Fixed 2026-08-26 with an in-flight promise map (B4). Applies to any cache fronting an expensive call — a result store is not enough on its own. | Eng |
| R-026 | A cache-warming job cannot help when the object is larger than the cache | Medium | Migration 073 added a 5-min HNSW warmer that ran, succeeded, and did not work: the index was 191MB against 224MB of `shared_buffers`, so ordinary activity evicted it between ticks (measured 87ms warm vs 1,797-2,637ms five minutes later). Fixed by migration 074 — halfvec halves the index to ~95MB so it fits. **Before adding any warming job, compare the object size to `shared_buffers`.** If it does not comfortably fit, warming is treating a symptom. | Eng |
| R-027 | `titles.available_services` drifts from `streaming_availability` | Medium | B3 (migration 075) denormalises availability onto `titles` so queries filter in SQL instead of shipping 321KB. A copied column can drift, and the failure is silent and user-visible: wrong availability shown, no error anywhere. Guarded by a row-level trigger, `refresh_title_available_services()` for repair, and `count_available_services_drift()` asserted daily by the health check. **The per-row trigger must be disabled around bulk loads** (`sync-content.ts` stage `sa`) and the refresh run afterwards. | Eng |

## Strategy-doc risks (resolved or tracked)

Per strategy v1.6.3 §8.1, additional risks tracked alongside this register:

- LLM embeddings don't discriminate well — ✅ MITIGATED (Phase 1 head-to-head validated).
- Service fingerprints too coarse/similar — Phase 2 conditional pass; Phase 2.6 confirmed exclusivity weighting doesn't help.
- Contextual signals feel invasive or slow onboarding — optional fields, late-bound.
- Phase 0.5 backfill silently fails — ROW-COUNT VALIDATION as hard acceptance criteria.
- Negative dwell signals collapse taste vector — −1.0 session cap.
- pgvector wire format breaks client retrieval — ✅ MITIGATED (Phase 1 spike).
- HDBSCAN bad clusters at scale — ✅ Resolved Phase 4.5 (UMAP+HDBSCAN ships 68 clusters at 53.5%).
- GitHub Actions cron silent failure — monitor monthly; add Supabase write-timestamp alert if reclustering >35 days old.
- Hook rewrites drag scope — CC reviewed; Phase 3 spec enumerates files.
- Phase 0.5 backfill exceeds laptop uptime — script supports resume-from-last-completed.
- Conversational discovery gets deprioritised, Reelgood ships better cross-platform — accept as competitive risk.

## Open questions

- Will Phase 5 contextual scoring be implemented before launch or deferred?
- Does Critically Acclaimed Home row require manual curation in addition to OMDB-driven gating?
- iOS launch timing — currently Capacitor configured for Android only.
- Whether to publish Mood Room labels as user-editable favourites.
