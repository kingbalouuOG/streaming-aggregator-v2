---
title: Next steps — Phase 5.5, 6, and immediate
type: register
tags: [register, next-steps, phase-5-5, phase-6, roadmap]
created: 2026-04-26
updated: 2026-05-13
sources:
  - docs/v2/phase-summaries/phase-search-v2-summary.md
  - docs/v2/phase-summaries/phase-5-summary.md
  - docs/v2/Videx_v2_Project_Orchestration_v0.7.md
  - videx-wiki/wiki/registers/parking-lot.md
related:
  - wiki/registers/parking-lot.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-search-v2.md
  - wiki/concepts/operations/phase-5.md
---

# Next steps

Concrete near-term work in dependency-aware order. Sourced from open Phase Search V2 follow-ups, parking-lot pending items, and pre-launch blockers.

## Immediately next (post Phase Search V2 close)

| # | Task | Source | Notes |
|---|---|---|---|
| 1 | Production APK rebuild + install | `phase-search-v2-summary.md` §9 | `npm run build ; npx cap sync android ; cd android ; ./gradlew assembleDebug` then `adb install -r`. Smoke-test all 5 search surfaces (lookup, filter-only, mood chip, suggestion routing, semantic CTA on Joe's profile). |
| 2 | Distribute APK to family-member testers | This phase | Sideload or Play Console internal track. `search_semantic` flag stays OFF for them by default — they see Mode A only. |
| 3 | Author 20-query semantic-eval fixture | IN-PX-40 (parking lot) | Gates `search_semantic` flag-flip from Joe-only → prototype users. Joe deliverable; update `scripts/test/search-semantic-fixtures.json` and re-run the eval workflow. |
| 4 | Subjective semantic-search assessment | Phase Search V2 close | Joe runs the 20-query fixture over 2 days; flip flag on for prototype users when satisfied. |

## Phase 5.5 — Quality + legal hardening (not started)

Bundles the deferred-from-Phase-5 cluster plus Phase Search V2 follow-ups. None of these are technically launch-blockers individually, but the legal cluster IS — pre-public-launch.

### Quality cluster

| Task | Source | Notes |
|---|---|---|
| Regenerate `database.types.ts` + drop remaining `as any` casts | IN-PX-21 | New dependent surfaced in Phase Search V2 (`src/lib/featureFlags.ts:47` for `user_feature_flags`). Pre-existing dependents: `AuthContext.tsx`, `anchorRoomLabels.ts`, `interactionUpdate.ts`. |
| `catch (err: any)` cleanup in `useSearch.ts:138, 223` | IN-PX-39 | Trivial — replace with `unknown` + narrowing helper. Flagged by `kieran-typescript-reviewer` on Phase Search V2 close. |
| Search-as-signal Level 2 — embed query into taste vector directly | IN-PX-44 | Add `'search'` to `TASTE_RELEVANT_EVENTS` (weight ~0.15), embed via `embed-query`. Defer until IN-PX-40 fixture lands so we have ground truth on embedding quality first. |
| Embedding fetch caching for MMR (24h TTL) | IN-PX-22 | Phase 5 added ~3MB embedding fetch per For You load — dominant new latency cost. |
| MMR partial-coverage fallback (>50% missing → genre-spread) | IN-PX-23 | Graceful degradation when embedding map is patchy. |
| Float32Array + cosine-norm precompute in MMR | IN-PX-24 | After IN-PX-22. |
| Test coverage for `computeContextualScore` + `applyMMR` | IN-PX-25 | — |
| `buildRowFromPool` options-object refactor | IN-PX-26 | Param list now long enough to warrant it. |
| `ViewingContext` to source-of-truth (`types.ts`) | IN-PX-27 | Currently duplicated. |
| `edge-fn-jwt-guard` gap — central `supabase/config.toml` | IN-PX-28 | — |
| Trim `supabase/cron/*.sql` source-of-truth confusion | IN-PX-31 | Migration 039 + cron files duplicate registrations. |
| Mirror tree consolidation (`_shared/` as source-of-truth) | IN-PX-32 | Supersedes part of IN-467. Phase Search V2's `_shared/recommendations-v2/search/semanticRetrieval.ts` is already imported directly by the client — proof-of-pattern. |
| Migration 040 (additive `get_available_tmdb_id_pairs`) | IN-458 | Re-targeted from Phase 5; closes 0.8% movie/TV id collision rate. |
| Backfill script for ~3,807 missing tmdb_ids | IN-465 | One-off Prime-skewed catalogue gap. |
| For You tab-switch preservation via zustand store | IN-462 | Net-new `zustand` dep accepted in Phase 5 brief. |

### Legal cluster (pre-public-launch blockers)

| Task | Source | Notes |
|---|---|---|
| Delete account UI gate flip + RPC audit + version-controlled migration | IN-XPS-006 | RPC + client wiring exist in production; UI gate + migration are the gaps. |
| Privacy Policy + ToS pages with functional legal links | IN-PX-34 | Store-rejection risk if left as non-functional spans. |
| Functional "Download my data" — GDPR Article 20 | IN-PX-35 | Currently a fake-success toast. |

### Flag-flip surface (decide pre-rollout)

| Task | Source | Notes |
|---|---|---|
| Admin UI surface OR documented runbook for `user_feature_flags` toggling | IN-PX-41 | Studio SQL is fine for Joe; multi-user rollout wants either. |

## Phase 6 — Launch

Per strategy §7.2: v2 is complete. Build Android release APK, run pre-launch blockers register, two prototype users re-onboard. No cutover ceremony — v2 is just the next build of the app.

| Task | Source |
|---|---|
| Run through every item in [pre-launch-blockers](pre-launch-blockers.md) | This wiki |
| Generate Android release keystore + populate `signingConfigs.release` | apk-build-and-install runbook |
| Bump `versionCode` + `versionName`, tag the release commit | apk-build-and-install runbook |
| `username_available` rate-limit at gateway | IN-PX-29 |
| Defence-in-depth in `extractUserIdFromJwt` | IN-PX-30 |
| Property-level parity probe (golden output) | IN-PX-33 |
| Cryptographic service-role JWT rotation | IN-XPS-004 — pending Supabase JWT-format secret keys or Edge auth refactor |

## Phase 7 — Conversational discovery (post-v2)

Built on top of v2 infrastructure. Phase Search V2 laid the groundwork — `card_impressions.metadata.{mode, query_hash, filter_set_hash}` is the data Phase 3 search-as-signal will consume. See [v3-conversational-discovery forward-planning page](../concepts/forward-planning/v3-conversational-discovery.md).

| Step | Notes |
|---|---|
| Search-as-signal Level 3 (Phase 3 pipeline) | IN-PX-45 — co-cluster queries, longer attribution windows, weight calibration vs held-out engagement, query-pattern detection. Level 1 (IN-PX-43, 60s/1.3× attribution boost) shipped 2026-05-14; Level 2 (IN-PX-44, query embedding directly into vector) is the intermediate step. |
| Entity search (Phase 2 / Mode B) | Out of Search V2 scope per `videx-wiki/raw/forward-planning/roadmap-search-v2-entity-and-signal.md`. |
| Spike Graphiti + Kuzu (embedded) | Validates OSS approach with zero infrastructure cost. |
| Build batch ingestion job (matches mood rooms GitHub Actions cron pattern) | Re-uses Phase 4.5 cron infrastructure. |
| Ship NL search on Browse | Replaces TMDb text-matching for queries like "dark comedy about a dysfunctional family". (Phase Search V2 Mode C is the embedding-based opt-in version of this; Phase 7 ships the full graph-traversal variant.) |
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
