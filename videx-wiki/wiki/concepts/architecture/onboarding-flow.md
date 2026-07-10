---
title: Onboarding flow (5 steps)
type: concept
tags: [onboarding, taste-vector, cold-start, steps]
created: 2026-04-26
updated: 2026-07-10
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Design_Reference_v0.1.md
  - raw/phase-summaries/phase-3-summary.md
  - scripts/simulate-profile-sweep.ts
  - scripts/simulate-validate-winner.ts
related:
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/cold-start.md
  - wiki/concepts/architecture/sliders.md
  - wiki/concepts/architecture/service-fingerprints.md
---

# Onboarding flow (5 steps)

5 steps, ~90s target. Designed to maximise signal capture per step while minimising friction. Auth integrated into Step 1 (Phase 3 deviation from brief; eliminated duplicate email collection).

## Step 1 — Create Account

- Email, username, password (required).
- Terms of Service + Privacy Policy acknowledgement (implicit on Continue tap). Native (2026-07-10): the ToS/Privacy links are now live — they open the same in-app `LegalSheet` used by Profile → Privacy & Data (previously dead styled text).
- Age range dropdown labelled "(optional)".
- "How do you usually watch?" dropdown labelled "(optional)" — Solo / With a partner / With family / Mix.
- Copy: *"This helps us recommend the right content for how you watch. Entirely optional."*

## Step 2 — Your Services

- Multi-select grid in UK market share order: Netflix → Prime Video → Disney+ → BBC iPlayer → ITVX → Channel 4 → NOW → Sky Go → Apple TV+ → Paramount+.
- "Select All" affordance.
- Selection counter at bottom.
- **Minimum 1 service required.**
- Drives service-fingerprint cold-start (Pillar 3).

## Step 3 — What have you watched?

- 6-title grid (3×2) with real TMDb poster art, multi-select per round.
- 3 rounds with differentiated slices:
  - Round 1: broadly popular, recognisable mainstream.
  - Round 2: recent prestige content from user's selected services.
  - Round 3: deeper-cut content matching emerging signals from Rounds 1-2.
- Each round: "See different titles" affordance + "I haven't watched any of these — skip this round" affordance.
- Cold-start can still proceed if all 3 rounds are skipped (relies on Step 4 + service fingerprints).
- **Optional per round.**

Phase 3 implementation: Step 3 uses popular titles from user's selected services (no centroid RPC). Faster, better-known titles, pre-fetchable during Step 1.

### Pool tightening (2026-05-08)

`fetchWatchedGridCandidates` (`OnboardingFlow.tsx:164`) restructured into a **dual query** — top 36 movies and top 36 TV pulled separately and interleaved 1:1, both **ordered by `vote_count` DESC** rather than the previous `popularity` DESC:

| Bucket | Filters |
|---|---|
| Movies | `vote_count ≥ 5000`, `poster_path` and `embedding` not null |
| TV | `vote_count ≥ 1500`, `popularity ≥ 20`, `poster_path` and `embedding` not null |

Two structural fixes folded in:

1. **`vote_count` over `popularity`** — popularity is a daily-trending score that surfaces currently-airing US procedurals (NCIS, Chicago P.D., The Rookie) above true canon. `vote_count` is the cultural-penetration signal: top of votes are GoT, Stranger Things, Walking Dead, Breaking Bad, Squid Game / Interstellar, Inception, Avengers, Dark Knight, Avatar — the canonical recognition list.
2. **Per-bucket ordering** — a single popularity sort on the union returned 0 movies in the top 60 (TV popularity dominates the scale). Per-bucket querying ensures the movie/TV interleave is balanced.

Service-availability filter dropped: a title the user has seen elsewhere (cinema, friend's house, on a service they no longer pay for) is still a valid taste signal. Within-round shuffle (groups of 6) preserves canon-first ordering across rounds while breaking the deterministic interleave inside one.

## Step 4 — What do you watch? (Genre/cluster preferences)

- 16 taste cluster chips (`TASTE_CLUSTERS`).
- **Minimum 3 selections required, no upper cap** (cap removed during Phase 3 testing).
- Phase 3 ships clusters, not raw genres (design showed cluster chips matching `TASTE_CLUSTERS`; brief said "genre preferences" but meant clusters).
- **Native title rendered as two fixed lines** ("What do you love to" / "watch?") in `native/.../StepClusters.tsx`. Beta feedback 2026-07-09: the "N selected" chip stole horizontal room and wrapped the previously single-line title onto a second line the moment a genre was picked, jumping every card below it. Hard-splitting the title means the layout never reflows on first selection.

## Step 5 — Here's what we've learned (Sliders + Summary)

- Taste summary card at top — natural-language summary describing inferred content identity.
- Stats card (genres / titles / services counts).
- 4 delivery sliders, defaults "Balanced". See [sliders](sliders.md).
- Continuous sliders with dynamic position labels.
- Auto-save on release.

## Locked rules

- Total steps: 5. Target: ~90 seconds end-to-end.
- Progress indicator visible throughout ("Step 2 of 5").
- No skip paths.
- Back button on each step preserves state.

## Resume persistence (native, 2026-07-10)

Founder-hit resume loop: exiting the app at step 4 and returning dropped him to step 2 with services unselected and watch-history picks lost, taking 2-3 loops to finish. **Root cause:** `native/.../OnboardingFlow.tsx` held step index + every selection in `useState` (memory only), and the `(tabs)` guard remounts `OnboardingFlow` whenever onboarding isn't complete (e.g. after an auth session restore). Remount = memory wiped, step reset to `session ? 1 : 0` (= step 2 with a session).

**Fix:** a draft is mirrored to MMKV (`native/src/onboardingDraft.ts`, store id `videx-onboarding-draft`) on every change — step, services, watched keys, clusters, sliders, age/viewing context — restored synchronously on mount (no flash) and cleared on completion. The draft also persists the **original start timestamp** so a resume doesn't reset the duration clock, and a `startedLogged` flag so `onboarding_started` fires exactly once across resumes (no funnel double-fire). Back-button floor uses a separate `floorStep` (`session ? 1 : 0`), independent of the restored current step.

## Post-onboarding landing + Curating interstitial (native, 2026-07-10)

Onboarding completion now routes to a **Curating interstitial** (`native/src/app/curating.tsx`) instead of straight to the tabs. It holds an on-brand editorial "Curating your Videx" moment (Fraunces display, a single slow kicker fade that respects reduce-motion, no bare spinner) until the first For You payload resolves, then `router.replace('/(tabs)/foryou')`. A 6s backstop prevents a hung Worker from stranding the user (For You's own skeleton/retry takes over). This aligns the implementation with the two-surface locked rule "land on For You after onboarding" (see [two-surface](two-surface-architecture.md)).

The interstitial now **owns the `first_home_view` funnel event** (moved off the Home/"New" first-paint since landing is no longer Home). The event **name is unchanged** for funnel continuity even though the landing surface moved. `onboardingSignal.ts` still hands the one-shot "just onboarded" bit across the router boundary; curating consumes it and fires the event once the payload lands.

## Bootstrap weights (cluster-dominant, 2026-05-08)

Flipped from watched-grid-dominant to cluster-dominant. Declared cluster signal carries 75% weight across every tap-count tier; service fingerprints and watched-grid selections share the remaining 25%. See [ADR-013](../decisions/adr-013-cluster-dominant-bootstrap-weights.md).

| Watched-grid selections | Service fingerprints | Watched grid | Cluster (genre) |
|---|---|---|---|
| 0 | 0.25 | 0.00 | 0.75 |
| 1-4 | 0.13 | 0.12 | 0.75 |
| 5-12 | 0.09 | 0.16 | 0.75 |
| 13+ | 0.05 | 0.20 | 0.75 |

If the user selects no clusters at Step 4, the genre weight is redistributed to service fingerprints (`bootstrap.ts:101`).

### Previous values (pre-2026-05-08, retained for context)

| Watched-grid selections | Service fingerprints | Watched grid | Genre selections |
|---|---|---|---|
| 0 | 0.55 | 0.00 | 0.45 |
| 1-4 | 0.40 | 0.40 | 0.20 |
| 5-12 | 0.30 | 0.55 | 0.15 |
| 13+ | 0.20 | 0.70 | 0.10 |

## Onboarding events (analytics)

`onboarding_started`, `services_completed`, `clusters_completed`, `quiz_started`/`quiz_completed`/`quiz_skipped` (legacy v1, no longer emitted), `onboarding_completed`, `first_home_view`. See [event taxonomy](../../entities/codebase/event-taxonomy.md).

> Native (2026-07-10): `first_home_view` now fires from the post-onboarding Curating interstitial (`native/src/app/curating.tsx`), not the Home/"New" tab, because landing moved to For You. The event **name is retained** for funnel continuity. `onboarding_started` is guarded against double-firing on resume via the persisted `startedLogged` flag (see Resume persistence above).
