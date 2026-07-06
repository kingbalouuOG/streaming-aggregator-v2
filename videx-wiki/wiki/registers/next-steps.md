---
title: Next steps — Roadmap v1.0 H0 "Prove it & equip it"
type: register
tags: [register, next-steps, roadmap, h0, launch, notifications, share, beta, quiet-release]
created: 2026-04-26
updated: 2026-07-06
sources:
  - raw/forward-planning/Videx_Product_Strategy_and_Roadmap_v1.0_2026-07.md
  - docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md
related:
  - wiki/sources/strategy-roadmap-2026-07.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
  - wiki/registers/parking-lot.md
  - wiki/concepts/operations/phase-history.md
---

# Next steps

**Sequencing is now owned by the approved [Product Strategy & Roadmap v1.0](../sources/strategy-roadmap-2026-07.md)** (Joe, 2026-07-06; source of truth `docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md`). Thesis: the engine is ahead of the audience — users are the critical path. The old "internal-testing rollout → ENG-2" framing is superseded; ENG-2 remains data-gated (≥5–10K impressions, ≥500 positives) and now lands in H2 if its gate clears.

## Now — H0 "Prove it & equip it" (Jul–Sep 2026)

Fix what's unmeasurable, clear legal, build the two loops into v1, shake out with friends & family, then **quiet public release on both stores** (staged rollout, no press). Full item detail in the roadmap §6/§7; headline order:

| # | Item |
|---|---|
| 0.1 | **Launch compliance (DIY — Decision 6, 2026-07-06)**: ICO registration · contact details + caveat-footer removal · policy text updates (click-out + push consent) · hosted `/privacy` + `/terms` · store disclosure forms. **Paid solicitor review deferred to the H2 monetisation gate** (bundled with Premium consumer terms + affiliate disclosures); IN-XPS-014 re-scoped accordingly |
| 0.2–0.5 | Measurement + integrity fixes: native onboarding funnel events (broken — only `onboarding_completed`, duration 0), click-out telemetry completion (persist `link_type`, add `price_shown`), sentry-expo crash reporting, **taste-vector dedup fix** (both paths) |
| 0.6–0.8 | Friends-&-family shakeout (~10–15, internal tracks only) · weekly ritual (triage + dashboard + 2h growth block) · beta-blocking fixes (password-reset E2E, `editor_notes` 040 apply-or-remove — table confirmed missing in prod, availability-report loop E2E — 0 rows ever) |
| 0.9 | **Notifications v1 — full build** (moved from H1): arrival alerts (`streaming_history` 'added' × watchlist × services) + leaving-soon (read `streaming_availability.expires_on`, ~2K titles carry dates). Arrival alerts free forever. |
| 0.10 | **Share v1 + minimal title pages** (moved from H1): share sheet → Worker-served per-title landing (OG tags, store links) — also the SEO seed |
| 0.11 | Security + ops batch: leaked-password toggle, IN-PX-29, IN-PX-30, off-site backup, GitLab mirror, pg_partman check (overdue), pricing refresh (overdue), IN-PX-50 backfill fn; IN-XPS-004 stays tooling-blocked |
| 0.12 | **Quiet v1 public release**: Play production-access prerequisites check (14-day/12-tester closed test if personal account post-Nov-2023), listing polish/ASO, first App Store review (+1 rejection-cycle buffer), staged rollout, **no announcements**. Release valve: ship without notifications if credentialing drags >~2 weeks, fast-follow. |

**H0 exit gate:** launch compliance done (ICO registered · contact details live · policies hosted + current) · instrumentation live · alerts firing on real data · share round-trip works · shakeout clean · crash-free ≥99% · quiet v1 live on both stores.

> **Stream A delivered** (PR `fix/h0-measurement-integrity`, 2026-07-06): items **0.2** (native funnel events — `onboarding_started`/`services_completed`/`clusters_completed`/`first_home_view` + real duration), **0.3** (click-out `link_type` + `price_shown`), **0.4** (`@sentry/react-native` crash reporting + release health), **0.5** (taste-vector event-identity dedup, both paths — see [taste-vector](../concepts/architecture/taste-vector.md#event-identity-dedup-h0-stream-a-2026-07-06)), the **0.7** dashboard SQL (`supabase/queries/metrics-dashboard.sql`), and **0.8** beta-blocking fixes: `editor_notes` migration 040 **applied** to prod (had a latent non-IMMUTABLE index predicate — why it never applied; seed note live) · `availability_reports` loop **unblocked** (root cause: `service_id` was NOT NULL but the "All" default sends NULL, and the sheet showed success regardless — migration 048 drops NOT NULL + `ReportSheet` now respects the result) · in-app **password-reset** deep-link screen (`/reset-password`; needs `videx://reset-password` in the Supabase Redirect URLs allowlist). Device-level verification of the native items (onboarding funnel rows, crash capture, reset round-trip) still pending a dev build.

## Then — H1 "Grow & learn" (Oct–Dec 2026)

Community rollout against the live listing (public UK communities — Joe's Decision 4; organic only, no ad spend — Decision 3) → activation read + **engine pulse** (≥40% "very disappointed"; written branch: pulse fails → cold-start iteration, no marketing beat) → monetisation plumbing (Worker `/out` redirector; **server-verified entitlements — `user_feature_flags` is client-writable and must NOT gate Premium**) → semantic flip (IN-PX-40 fixture → IN-PX-41 bulk-enable) → pre-Christmas marketing beat.

## Then — H2 (Jan–Mar 2027) and H3

H2: rotation coach "worth it this month" (January = subscription-review season) · Premium £14.99/yr **only if MAU is in the ~5–8K break-even band** (TMDb commercial licence ~$149/mo triggers on any monetisation) · ENG-2 if its data gate passes · email digest. H3 vision (rebuilt 2026-07-06 around four bets — agents / autopilot / groups / data sovereignty + the Rewind flywheel): see the [source page](../sources/strategy-roadmap-2026-07.md).

## `search_semantic` global-flip gate (unchanged)

Semantic mood search ships behind the per-user `search_semantic` flag (ON for Joe/prototype only; OFF → deterministic presets). Gates: IN-PX-40 20-query fixture (Joe-owned; still a 2-query stub) → `search-semantic-eval` green → bulk enable + new-signup default (IN-PX-41). Roadmap slot: H1 1.3.

## Standing / time-triggered (unchanged)

| Trigger | Action |
|---|---|
| Any time (Joe-owned) | IN-PX-55 cluster rep-list expansion; IN-PX-40 fixture |
| Overdue — in H0 0.11 | pg_partman verification (IN-XPS-003); `FORBIDDEN_WORDS` review (IN-461); quarterly pricing refresh (IN-XPS-007) |
| 3 monthly recluster runs | Mood-room coverage re-eval (IN-459) |
| `actions/setup-python` v6 | Workflow upgrade (IN-460) |

## Done — prior tracks (for the record)

E&P Hardening (ENG-1 → REPO-1 → PLAT-1/2/3 → UX-1) ✅ and NATIVE-1→4 ✅ (cutover to `app.videx.streaming`, v2.0.x live on Play internal testing + TestFlight; tag-triggered CI to both stores). Full detail in [phase-history](../concepts/operations/phase-history.md).
