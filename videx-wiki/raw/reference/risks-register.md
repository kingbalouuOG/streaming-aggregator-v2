---
title: Risks Register
generated: 2026-04-26
sources: [docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md §8, parking lot cross-phase entries]
---

# Risks Register

Living list of known risks and mitigations. Severity is engineering judgement; revisit at phase boundaries.

| ID | Risk | Severity | Mitigation | Owner |
|---|---|---|---|---|
| R-001 | OpenAI deprecates `text-embedding-3-small` | Medium | Pin model string. Plan coordinated regen of titles + user vectors. Embedding cost is negligible (~$0.03 full backfill). | Eng |
| R-002 | SA API ceases operation | Medium | Cache fully populated in Supabase; degrade to last known state with stale flag. Fallback to TMDb watch/providers + search-URL deep links across the board. | Eng |
| R-003 | TMDb terms of service change | Medium | Comply with attribution. Maintain alternative paths (network-name fallback) if `watch/providers` becomes unavailable. | Eng |
| R-004 | Service-role key leaked | High | Rotate immediately per `service-role-jwt-rotation.md`. Migrate to Supabase Vault pre-launch. Audit recent activity. | Eng |
| R-005 | iPlayer / Sky Go gap stays open at launch | Low | Search-URL fallback in place. Discoverability via TMDb watch/providers preserved. Document the limitation in user-facing FAQ. | Product |
| R-006 | Mood Rooms become stale between monthly recluster | Low | Acceptable; titles do not move clusters fast at our cadence. Manual recluster trigger available. | Eng |
| R-007 | HNSW recall drops as catalogue grows past 100K | Medium | Monitor `match_titles_by_vector` precision in `rank-eval.ts`. Tune `ef_search`. Consider IVFFlat alternative if recall degrades. | Eng |
| R-008 | Pricing data drifts from reality | Medium | Quarterly review (parking lot IN-XPS-007). Consider integrating an external pricing source pre-launch. | Product |
| R-009 | RLS misconfiguration silently leaks data | High | Pre-deploy checklist (see `rls-pattern.md`). Run Supabase linter at each phase boundary. Audit `pg_policies` for any new table. | Eng |
| R-010 | pg_cron job fails silently | Medium | Monitor `cron.job_run_details` weekly. Add alerting to non-zero failure counts. | Eng |
| R-011 | Embedding template change breaks coherence | Medium | `eval-cluster-coherence.ts` thresholds gate any template change. Maintain previous template definition for reproducibility. | Eng |
| R-012 | Capacitor 8 plugin incompatibility on Android update | Low | Pin Capacitor + plugin versions. Test on latest Android release before Play Store update. | Eng |
| R-013 | Onboarding drop-off reduces taste vector quality | Medium | Funnel queries (`docs/funnel-queries.sql`) flag step-by-step drop-off. Iterate copy and progress UI. | Product |
| R-014 | OMDB free-tier quota exhausted | Low | Cache aggressively. Sync stage skips already-rated titles. Upgrade to paid tier if needed. | Eng |
| R-015 | Backup retention insufficient for incident recovery | Medium | Manual snapshot before each destructive migration. Off-site monthly `pg_dump` recommended pre-launch. | Eng |

## Open questions

- Will Phase 5 contextual scoring be implemented before launch or deferred? Currently Phase 4 placeholder returns 0.5; Phase 5 is the planned replacement.
- Does the Critically Acclaimed home row require manual curation in addition to OMDB-driven gating?
- iOS launch timing — currently Capacitor configured for Android only.
- Whether to publish Mood Room labels as user-editable favourites in a future phase.
