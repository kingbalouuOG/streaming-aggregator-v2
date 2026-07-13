---
title: Next steps — Roadmap v1.0 H0 "Prove it & equip it"
type: register
tags: [register, next-steps, roadmap, h0, launch, notifications, share, beta, quiet-release]
created: 2026-04-26
updated: 2026-07-13
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

Fix what's unmeasurable, clear legal, build the two loops into v1, shake out with friends & family, then **quiet public release on both stores** (staged rollout, no press). Full item detail in the roadmap §6/§7 — **§6 status block + §7 per-item markers are the live tracker (status pass 2026-07-13)**. Headline state:

| # | Item | Status (2026-07-13) |
|---|---|---|
| 0.1 | **Launch compliance (DIY — Decision 6)**: ICO · contact details + caveat-footer removal · policy text updates · hosted `/privacy` + `/terms` · store disclosure forms. Solicitor review stays deferred to H2. | 🔶 Policies hosted + current on videxstreaming.com; contact route live (`privacy@`). **ICO = Joe's remaining action**; footers/placeholders drop on the number. Store-forms answer pack prepared (submission-pack artifact). |
| 0.2–0.5 | Measurement + integrity fixes (funnel events, click-out telemetry, crash reporting, taste dedup) | ✅ Stream A + device-verified; two completion races found in testing and fixed (PRs #57, #69) |
| 0.6–0.8 | Shakeout · weekly ritual · beta-blocking fixes | 0.8 ✅ (password-reset E2E proven on device via the `/reset` HTTPS bridge; editor_notes applied; report loop unblocked) · 0.6 ⬜ **CRITICAL PATH — doubles as Play's mandatory 12-tester/14-day closed test (gate confirmed on the account 2026-07-11); v2.1.4 = the closed-test build** · 0.7 🔶 starts with the cohort |
| 0.9 | **Notifications v1 — full build** | ✅ Built + credentialed + device-verified end-to-end (arrival, bundling, dedup, caps, tap routing warm+cold). Release valve never needed. |
| 0.10 | **Share v1 + minimal title pages** | ✅ Live (`/t/` Worker pages, OG tags, UA-aware CTA, canonical domain) |
| 0.11 | Security + ops batch | ✅ Core done (rate limit, JWT hardening, leaked-password toggle, off-site encrypted backup public+auth — restore-viable, verified; backfill fn + 404 skip-list). Stragglers ⬜ (non-gating): GitLab mirror, pg_partman check, pricing refresh. IN-XPS-004 still tooling-blocked. |
| 0.12 | **Quiet v1 public release** | 🔶 Play gate verified (closed test required); listing/data-safety/rating answers prepared; remaining: assets, demo account, Support URL (marketing site in build), then 14-day clock → production application (~7d review) + App Store review |

**H0 exit gate:** launch compliance done (ICO registered · contact details live · policies hosted + current) · instrumentation live · alerts firing on real data · share round-trip works · shakeout clean · crash-free ≥99% · quiet v1 live on both stores.

> **Week-1 delta (2026-07-07 → 07-13):** v2.1.0 → v2.1.4 shipped to both tracks; videxstreaming.com live (Worker custom domain, branded Resend auth email, privacy@ routing); a 4-reviewer pre-launch audit ran with every finding fixed or accepted-and-registered (PRs #73–#78, migrations 062–065, risk R-016); marketing site brief authored (separate repo, Payload + Next.js — in build). Engineering side of H0 is effectively complete; the clock-bound items (closed test, ICO, store reviews) own the timeline now.

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
