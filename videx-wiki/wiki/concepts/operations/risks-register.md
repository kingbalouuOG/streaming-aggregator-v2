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
| R-010 | pg_cron job fails silently | High | ⚠ **Materialised 2026-06-07 — this is the risk that froze the catalogue for 79 days.** `cron.job_run_details` was the monitored surface and it only records that pg_net *queued* the request; every run showed `succeeded` while TMDb returned 401 to every call. Partially mitigated 2026-08-25 (A1/A2, migrations 066/067): `sync_log` now carries honest counts, populated `error_details`, and `heartbeat_at` + `reap_stale_sync_runs()`. **Still unmitigated: nothing alerts.** A human must read `sync_history`. See [sync-pipeline](sync-pipeline.md). | Eng |
| R-011 | Embedding template change breaks coherence | Medium | `eval-cluster-coherence.ts` thresholds gate any template change. Maintain previous template definition for reproducibility. | Eng |
| R-012 | Capacitor 8 plugin incompatibility on Android update | Low | Pin Capacitor + plugin versions. Test on latest Android release before Play Store update. | Eng |
| R-013 | Onboarding drop-off reduces taste vector quality | Medium | Funnel queries flag step-by-step drop-off. Iterate copy and progress UI. | Product |
| R-014 | OMDB free-tier quota exhausted | Low | Cache aggressively. Sync skips already-rated titles. Upgrade if needed. | Eng |
| R-015 | Backup retention insufficient for incident recovery | Medium | ✅ Mitigated 2026-07-11: monthly off-site encrypted `pg_dump` (public + auth schemas) via `db-backup.yml`, 90-day artifact retention. Manual snapshot before destructive migrations still applies. | Eng |
| R-016 | `claim_push_token` (migration 060) lets any authenticated user claim any push-token string — a leaked token's alert channel can be redirected/silenced | Low | ACCEPTED by design (pre-launch review 2026-07-12): token possession is treated as device-control proof; restricting claims to unowned/own rows would break the shared-device reclaim flow 060 exists for. Exposure requires a leaked Expo token AND a signed-in attacker. Revisit if tokens ever appear in logs/support tooling. | Eng |
| R-017 | Third-party API credentials expire silently and no surface says so | High | ⚠ **Materialised**: the Edge Functions' `TMDB_API_KEY` began returning 401 around 2026-06-07 and was found on 2026-08-25 — 79 days, ~22.3K titles of backlog. Partially mitigated: `backfill-missing-titles` now aborts the whole chain on the first 401/403 and writes it to `sync_log.error_details` instead of walking 300 IDs against a dead key. Residual: no expiry tracking and no alert on any key (TMDb, OMDB, SA/RapidAPI, OpenAI). Rotation is manual and undated. | Eng |
| R-018 | Long Edge Function jobs are killed mid-run and report success | Medium | ✅ Mitigated 2026-08-25 (A2): jobs are sliced to 18s and self-chain via `enqueue_function_call` (migration 067). A partial window is marked `failed`, never `completed`, so `getLastSyncTimestamp()` cannot advance past unfetched pages. Was costing ~42.8% of incremental runs (62 of 145 since 2026-03-31) and a matching share of SA API quota on re-fetched pages. | Eng |
| R-019 | Catalogue backlog does not drain at the scheduled cadence | Medium | Open. 22,260 missing titles vs a weekly chain capped at 2,000 ⇒ ~11 weeks even once TMDb auth is restored. Needs A3 (relevance ordering — the queue is `tmdb_id ASC`, so dead low-ID stubs come first), A4 (one-off bulk clear, ~22K TMDb fetches ≈ 1.6h, needs explicit go-ahead) and A5 (daily cadence). | Eng |

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
