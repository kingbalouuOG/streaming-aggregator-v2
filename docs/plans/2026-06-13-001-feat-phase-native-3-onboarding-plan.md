# NATIVE-3 Implementation Plan — Onboarding + real service prefs

**Status:** DRAFT for Joe's review.
**Branch:** `phase-native-3-onboarding` (stacked on NATIVE-2 / PR #24; PRs into **`native-integration`**, NOT main — per the 2026-06-13 branch-isolation decision).
**Plan source:** web `OnboardingFlow.tsx` + the shared `taste-v2` bootstrap and `storage/userPreferences` libs (all re-orchestrated, not reimplemented).

## Why this phase

NATIVE-2 shipped the core loop but For You leans on two stand-ins: a hardcoded `DEV_SERVICES` set and a *pre-existing* taste profile (only Joe's account has one). Onboarding is what removes both — a new native sign-up picks services + seeds a taste vector, so For You works for anyone and Home/For You score against the user's real services. This phase makes the native app self-sufficient for a brand-new user.

## The native flow (differs from web by design)

Web onboarding is 5 steps starting with account creation. **Native splits auth out** — the W6 `AuthScreen` already does sign-up. So native onboarding is the **4 taste steps**, gated after sign-in:

```
AuthGate (W6): signed in?  ──no──►  AuthScreen
       │ yes
       ▼
hasCompletedOnboarding()?  ──no──►  OnboardingFlow (steps 1–4)  ──complete──►  tabs
       │ yes
       ▼
     tabs
```

| Step | Screen | Collects | Shared lib it feeds |
|---|---|---|---|
| 1 Services | service grid (the 10 UK services over junctioned logos) | `serviceIds: string[]` | `saveUserPreferences` → `user_services` |
| 2 Watched grid | 3 rounds × 6 posters ("tap what you've watched & enjoyed") | `{tmdbId, mediaType}[]` (0–18) | feeds the bootstrap |
| 3 Taste clusters | 16-cluster grid from `TASTE_CLUSTERS`, pick ≥3 | `clusterIds: string[]` | feeds the bootstrap |
| 4 Sliders + summary | 4 sliders (catalogueAge, comfortZone, contentMix, variety) + prose | `SliderState` | `saveSliderState` |

On completion, a native `useCompleteOnboarding` mirrors the web `useUserPreferences.completeOnboarding` orchestration verbatim (all shared lib):
`bootstrapTasteVector(...)` → `saveV2TasteVector(vector, 0, 'onboarding_v2')`; `bootstrapInterestCentroids(...)` → `saveInterestCentroids(...)`; `saveSliderState(...)`; set `profiles.onboarding_completed = true`. Writes the same `taste_profiles` / `user_interest_centroids` / `user_services` rows as web — so a profile built on native is identical to one built on web.

## Locked decisions (proposed — confirm or veto)

- **D1 — Auth split:** native onboarding is steps 1–4 only; account creation stays in the W6 AuthScreen. The gate adds a `hasCompletedOnboarding()` check inside the signed-in branch of `AuthGate`.
- **D2 — Reuse the entire bootstrap/prefs lib** (`bootstrapTasteVector`, `bootstrapInterestCentroids`, `saveV2TasteVector`, `saveInterestCentroids`, `saveSliderState`, `saveUserPreferences`, `hasCompletedOnboarding` — all in `src/lib`). Native writes identical Supabase rows. Zero engine reimplementation.
- **D3 — Placement (the W6 gotcha rule):** all onboarding React files live in real native dirs (`native/src/components/onboarding/`, `native/src/app/`, `native/src/hooks/`) — never under the `native/src/lib` junction.
- **D4 — Motion:** step transitions via Reanimated (the M3 vocabulary from NATIVE-1), not framer-motion.
- **D5 — Retire `DEV_SERVICES` (the phase payoff):** add a native `useUserServices` (loads `user_services` via the prefs lib) and feed real provider IDs into `useHomeFeed` + `useForYou`. Home and For You stop using the hardcoded set.
- **D6 — Analytics funnel:** emit the shared `logOnboardingEvent` events (STARTED / SERVICES_COMPLETED / CLUSTERS_COMPLETED / COMPLETED) — they're cheap shared-lib calls and the funnel is worth having from day one.

## Work items

- **W1 — Gate + flow scaffold:** `hasCompletedOnboarding()` check in `AuthGate`; `OnboardingFlow` container (step state, progress indicator, Reanimated step transitions, back handling).
- **W2 — Services step:** service-selection grid; persists via `saveUserPreferences`.
- **W3 — Watched grid step:** dual popularity query (movies vote_count ≥5000 / TV ≥1500), 6 posters × 3 rounds, interleaved + shuffled; collects selections. Reuses `PosterGridCard`/expo-image.
- **W4 — Clusters step:** 16-cluster grid from `TASTE_CLUSTERS` (name/adjective/mood copy), min-3 validation.
- **W5 — Sliders step:** 4 sliders + the prose summary; `SliderState` (a native slider — `@react-native-community/slider` or a Reanimated custom track).
- **W6 — Completion orchestration:** native `useCompleteOnboarding` (bootstrap + saves + flag + analytics), then route to Home and refetch.
- **W7 — Real service prefs:** `useUserServices`; wire into Home + For You; delete the two `DEV_SERVICES` constants.

## Gates

Web untouched (this phase adds only native files + reuses shared lib — no `src/lib` changes expected; if any arise, web tsc/tests/lint/build stay green). Native: tsc 0, `expo export` bundles, release APK runs. **Device-smoke every screen** (the W6 lesson — a green bundle is not a running app): full new-account run on a throwaway signup → verify For You renders from the freshly-bootstrapped profile, and a SQL check that `taste_profiles` + `user_services` rows match a web-built profile's shape.

## Risks

| Risk | Containment |
|---|---|
| New file accidentally under the `native/src/lib` junction → dual-React crash | D3 rule; device-smoke catches it |
| Bootstrap writes differ subtly from web → engine scores differently | Reuse the exact lib fns + the same call order as `useUserPreferences.completeOnboarding`; SQL-diff a native vs web profile |
| Native slider UX | Start with `@react-native-community/slider`; upgrade to a custom Reanimated track only if it feels off |
| Watched-grid query latency on device | Same dual query the web uses; cache via React Query; show skeletons |

## Open questions (recommendations inline)

- **Q1 — Watched grid scope:** match web (3 rounds × 6 = up to 18) — recommended (bootstrap quality depends on signal) — vs trim to 2 rounds for a faster native first run.
- **Q2 — Onboarding-only phase?** Keep NATIVE-3 strictly onboarding + service-prefs (recommended) vs fold in other deferred items (Browse filter sheet, detail rating/report). Recommend separate phases — this one is already cohesive.
- **Q3 — Re-onboarding existing accounts:** ignore for now (existing profiles work) vs add a "retake" entry point in Profile. Recommend defer to a later phase.

## Out of scope

Browse filter sheet + semantic mood chips, detail rating/report/instrumentation, light theme, query persistence, password recovery, the NATIVE-4 cutover, the end-of-track design-review polish pass.
