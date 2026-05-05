---
title: Next steps — Phase 5, 6, and immediate
type: register
tags: [register, next-steps, phase-5, phase-6, roadmap]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
related:
  - wiki/registers/parking-lot.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
  - wiki/concepts/operations/phase-history.md
---

# Next steps

Concrete near-term work in dependency-aware order. Sourced from open Phase 4/4.5 carry-forwards, parking-lot pending items, and pre-launch blockers.

## Immediately next (Phase 4.5 close-out)

| # | Task | Source | Notes |
|---|---|---|---|
| 1 | Write Phase 4.5 end-of-phase summary doc | Implementation Guide §4.6; phase summaries gap noted in [phase-summaries source page](../sources/phase-summaries.md) | Per process: every phase produces one. Phase 4.5 currently missing. |
| 2 | Flip parking-lot status for IN-451 to IN-456 from ⏳ to ✅ | Parking-lot v0.3.4 carries them as Not yet incorporated; work shipped per ADR-005 | Update parking lot to v0.3.5 (or later) when refreshed. |
| 3 | Re-snapshot raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_*.md after Phase 4.5 status updates | AGENTS.md refresh cadence | Triggers wiki re-ingest of parking-lot. |

## Phase 5 — Contextual signals (planned, not started)

Per strategy §7.2: replace `contextual.ts` placeholder (returns 0.5 in Phase 4) with real scoring. When this ships, the 62.5/25/12.5 weight split must be re-evaluated.

| Task | Source | Notes |
|---|---|---|
| Device detection scorer | Strategy §5.2 (slider modifications, contextual fit) | Capacitor `Device` plugin already available. |
| Viewing-context scorer (solo / partner / family) | Strategy §4.1 | Reads `profiles.viewing_context` (added migration 012). Soft nudge, never filters. |
| Time-of-day mood adaptation | Strategy §7.2 Phase 5 | Re-orders mood rooms within the weekly window. |
| Re-evaluate 62.5/25/12.5 Stage 2 split | Phase 4 summary; Strategy §5.2 implementation note | Contextual currently carries 12.5% with zero ranking influence; real signal absorbs from taste/recency. |
| MMR upgrade to replace genre-spread heuristic | Phase 4 summary; pluggable `applyGenreSpread` already designed | Loads 500 × 1536D embeddings client-side; needs ~3MB transfer + ~23M float ops budget. |
| Hidden Gems threshold tuning | Phase 4 summary | From observed engagement. |
| For You tab-switch preservation | Parking-lot IN-462 | UX consistency. |

## Phase 5/6 cleanup

| Task | Source | Notes |
|---|---|---|
| `taste_profiles` RLS migration (033+) | Phase 4 security review M1; pre-launch blocker #1 | GDPR / privacy blocker. |
| Service-role JWT → Supabase Vault | Parking-lot IN-XPS-004; pre-launch blocker #2 | Pre-public-launch. |
| Profiles "public username lookup" RLS tightening | Parking-lot IN-XPS-002; pre-launch blocker #3 | Pre-public-launch. |
| Delete account cascade wiring | Parking-lot IN-XPS-006; pre-launch blocker #5 | GDPR Article 17. |
| Data export wiring | Privacy policy draft; pre-launch blocker #6 | GDPR Article 15. |
| Consolidate `watched`/`marked_watched` and `removed`/`watchlist_remove` event types | Parking-lot IN-PX-02 | CHECK constraint accepts both today; cleanup migration. |
| Supabase `<Database>` generic on shared client | Phase 3/4 summaries | 47 pre-existing errors across 6 files. |
| Availability page-count adaptive strategy | Phase 4 summary | At ~100K titles before silent truncation. |
| `getAvailableTmdbIds` `media_type` distinction | Parking-lot IN-458 | — |

See full set in [pre-launch-blockers register](pre-launch-blockers.md) and [deferred-items register](deferred-items.md).

## Phase 6 — Launch

Per strategy §7.2: v2 is complete. Build Android APK, install on test device, verify end-to-end. No cutover ceremony — v2 is just the next build of the app. Two prototype users re-onboard on next app launch.

| Task | Source |
|---|---|
| Run through every item in [pre-launch-blockers](pre-launch-blockers.md) | This wiki |
| Generate Android release keystore + populate `signingConfigs.release` | apk-build-and-install runbook |
| Bump `versionCode` and `versionName`, tag the release commit | apk-build-and-install runbook |
| Two prototype users re-onboard | Strategy §7.2 |

## Phase 7 — Conversational discovery (post-v2)

Built on top of v2 infrastructure. See [v3-conversational-discovery forward-planning page](../concepts/forward-planning/v3-conversational-discovery.md).

| Step | Notes |
|---|---|
| Spike Graphiti + Kuzu (embedded) | Validates the OSS approach with zero infrastructure cost. |
| Build batch ingestion job (matches mood rooms GitHub Actions cron pattern) | Re-uses Phase 4.5 cron infrastructure. |
| Ship NL search on Browse | Replaces TMDb text-matching for queries like "dark comedy about a dysfunctional family". |
| Ship recommendation explanation | Each For You row item carries traversable path. |
| Ship conversational discovery surface | Mood rooms as mapping surface for vague queries. |

## Time-triggered reviews

| Trigger | Action |
|---|---|
| First month tick-over after Phase 0 | Verify pg_partman creates new partitions automatically (IN-XPS-003). |
| 3 monthly mood room reclustering runs | Re-evaluate coverage (IN-459); revisit hybrid HDBSCAN+kmeans only if engagement data reveals under-served titles. |
| `actions/setup-python` v6 ships | Upgrade workflow YAML (IN-460). |
| May 2026 cron | Review `FORBIDDEN_WORDS` compound-noun carve-outs (IN-461). |
| Quarterly | Refresh `platformPricing.ts` (IN-XPS-007); refresh service catalogue and provider IDs in `platforms.ts`. |

## Deprioritised / explicitly later

See [deferred items register](deferred-items.md).
