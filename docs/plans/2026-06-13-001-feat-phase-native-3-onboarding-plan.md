# NATIVE-3 Implementation Plan — Onboarding + real service prefs

**Status:** DRAFT for Joe's review.
**Branch:** `phase-native-3-onboarding` (stacked on NATIVE-2 / PR #24; PRs into **`native-integration`**, NOT main — per the 2026-06-13 branch-isolation decision).
**Plan source:** web `OnboardingFlow.tsx` + the shared `taste-v2` bootstrap and `storage/userPreferences` libs (all re-orchestrated, not reimplemented).

## Why this phase

NATIVE-2 shipped the core loop but For You leans on two stand-ins: a hardcoded `DEV_SERVICES` set and a *pre-existing* taste profile (only Joe's account has one). Onboarding is what removes both — a new native sign-up picks services + seeds a taste vector, so For You works for anyone and Home/For You score against the user's real services. This phase makes the native app self-sufficient for a brand-new user.

## The native flow (differs from web by design)

The provided design screenshots (`C:\Users\User\Pictures\Videx\V2 Onboarding\`) show the current app's onboarding as a **5-step flow with a top progress bar ("Step N · Title … N/5")**, where **Step 1 IS account creation** ("Join VIDEX"). To match the current design, native onboarding is the **full 5 steps**. The returning-user sign-in stays in the W6 `AuthScreen` ("Welcome back."); the **"Create one" link on that screen enters this 5-step flow** (Step 1 creates the account via `supabase.auth.signUp`).

```
AuthScreen (W6): "Welcome back." sign-in ──"Create one"──►  OnboardingFlow (steps 1–5)
       │ sign-in success                                          │ step 5 complete
       ▼                                                          ▼
AuthGate: signed in + hasCompletedOnboarding()? ──no──► OnboardingFlow ──► tabs
       │ yes
       ▼
     tabs
```

| Step | Screen (screenshot) | Collects | Shared lib it feeds |
|---|---|---|---|
| 1 Create Account | "Join VIDEX" — email/username/password + optional age range + viewing context + ToS | sign-up creds; `ageRange?`, `viewingContext?` | `supabase.auth.signUp` |
| 2 Connect Services | "Your streaming services" 2-col grid + Select All | `serviceIds: string[]` | `saveUserPreferences` → `user_services` |
| 3 Watch History | "Round 1 of 3" — 6 posters/round, 3 rounds, "See different titles" / skip | `{tmdbId, mediaType}[]` (0–18) | feeds the bootstrap |
| 4 Your Tastes | "What do you love to watch?" 16-cluster grid (emoji cards), pick ≥3, "N selected" badge | `clusterIds: string[]` | feeds the bootstrap |
| 5 Fine-Tune | "Almost there 🎉" — summary card (Genres/Titles/Services stats) + 4 sliders w/ "Leaning X" captions | `SliderState` | `saveSliderState` |

On completion (after Step 5's "Start exploring VIDEX"), a native `useCompleteOnboarding` mirrors the web `useUserPreferences.completeOnboarding` orchestration verbatim (all shared lib):
`bootstrapTasteVector(...)` → `saveV2TasteVector(vector, 0, 'onboarding_v2')`; `bootstrapInterestCentroids(...)` → `saveInterestCentroids(...)`; `saveSliderState(...)`; set `profiles.onboarding_completed = true`. Writes the same `taste_profiles` / `user_interest_centroids` / `user_services` rows as web — so a profile built on native is identical to one built on web.

## Design fidelity (Joe's requirement: match the current app as closely as possible)

**Two authoritative references, used together:**
1. **Visual targets — the provided screenshots** in `C:\Users\User\Pictures\Videx\V2 Onboarding\` (`Step 1`…`Step 5.png`). These are the pixel-level design goal — match layout, colour, selected states (orange border + filled check), progress bar, copy, and spacing.
2. **Code/behaviour reference — the web step components** in `src/components/OnboardingFlow.tsx`, which render that exact design and call the shared lib.

| Native step | Screenshot | Web code reference |
|---|---|---|
| 1 Create Account | `Step 1.png` | `StepAccount` (L544) |
| 2 Connect Services | `Step 2.png` | `StepServices` (L807) |
| 3 Watch History | `Step 3.png` | `StepWatchedGrid` (L908) |
| 4 Your Tastes | `Step 4.png` | `StepClusters` (L1006) |
| 5 Fine-Tune | `Step 5.png` | `StepTasteSummary` (L1110) |
| Step chrome (header/progress) | all | `StepHeader` (L63) + flow shell (L420+) |

Other reference sets in that folder for later phases: `Home + For You\`, `V2 Menu\`, `V2 Profile\`. **Process:** build each step against its screenshot, then a **side-by-side device-vs-screenshot diff** before moving on (the NATIVE-2 W3 method Joe verified). "Matches the current app" is a per-step acceptance criterion. The end-of-track design-review pass still applies on top.

## Locked decisions (proposed — confirm or veto)

- **D1 — Full 5-step flow (revised after seeing the screenshots):** native onboarding is the 5 steps in the design, **Step 1 = account creation** (the sign-up path; calls `supabase.auth.signUp`, collects username + optional age/viewing-context). The W6 `AuthScreen` keeps the returning-user **sign-in**; its "Create one" link enters this flow. `AuthGate` also routes a signed-in-but-not-onboarded user (e.g. interrupted mid-flow) back in via `hasCompletedOnboarding()`.
- **D2 — Reuse the entire bootstrap/prefs lib** (`bootstrapTasteVector`, `bootstrapInterestCentroids`, `saveV2TasteVector`, `saveInterestCentroids`, `saveSliderState`, `saveUserPreferences`, `hasCompletedOnboarding` — all in `src/lib`). Native writes identical Supabase rows. Zero engine reimplementation.
- **D3 — Placement (the W6 gotcha rule):** all onboarding React files live in real native dirs (`native/src/components/onboarding/`, `native/src/app/`, `native/src/hooks/`) — never under the `native/src/lib` junction.
- **D4 — Motion:** step transitions via Reanimated (the M3 vocabulary from NATIVE-1), not framer-motion.
- **D5 — Retire `DEV_SERVICES` (the phase payoff):** add a native `useUserServices` (loads `user_services` via the prefs lib) and feed real provider IDs into `useHomeFeed` + `useForYou`. Home and For You stop using the hardcoded set.
- **D6 — Analytics funnel:** emit the shared `logOnboardingEvent` events (STARTED / SERVICES_COMPLETED / CLUSTERS_COMPLETED / COMPLETED) — they're cheap shared-lib calls and the funnel is worth having from day one.

## Work items

Design targets are the provided screenshots (`…\Pictures\Videx\V2 Onboarding\Step N.png`) — no capture step needed.

- **W1 — Flow scaffold + Step 1 (Create Account):** `OnboardingFlow` container with the top progress bar + back arrow chrome (matched to `Step 1.png`), Reanimated step transitions; Step 1 "Join VIDEX" — fields + optional age range / viewing-context chips + ToS links → `supabase.auth.signUp`. `AuthScreen` "Create one" enters the flow; `AuthGate` resumes a not-onboarded session.
- **W2 — Connect Services (`Step 2.png`):** 2-col service grid (logo card + name + description + check, orange-border selected) + Select All; persists via `saveUserPreferences`.
- **W3 — Watch History (`Step 3.png`):** "Round N of 3" — dual popularity query (movies vote_count ≥5000 / TV ≥1500), 6 posters/round × 3 rounds interleaved + shuffled, "See different titles" + skip; collects selections.
- **W4 — Your Tastes (`Step 4.png`):** 16-cluster emoji-card grid from `TASTE_CLUSTERS`, "N selected" badge, min-3 validation.
- **W5 — Fine-Tune (`Step 5.png`):** summary card (Genres/Titles/Services stats + prose) + 4 sliders with "Leaning X" captions; `SliderState` (`@react-native-community/slider` or a Reanimated custom track).
- **W6 — Completion orchestration:** native `useCompleteOnboarding` (bootstrap + saves + flag + analytics), then route to Home and refetch.
- **W7 — Real service prefs:** `useUserServices`; wire into Home + For You; delete the two `DEV_SERVICES` constants.

## Gates

Web untouched (this phase adds only native files + reuses shared lib — no `src/lib` changes expected; if any arise, web tsc/tests/lint/build stay green). Native: tsc 0, `expo export` bundles, release APK runs. **Design fidelity per step:** a side-by-side screenshot vs the current app's matching onboarding screen, close before moving on. **Device-smoke every screen** (the W6 lesson — a green bundle is not a running app): full new-account run on a throwaway signup → verify For You renders from the freshly-bootstrapped profile, and a SQL check that `taste_profiles` + `user_services` rows match a web-built profile's shape.

## Risks

| Risk | Containment |
|---|---|
| New file accidentally under the `native/src/lib` junction → dual-React crash | D3 rule; device-smoke catches it |
| Bootstrap writes differ subtly from web → engine scores differently | Reuse the exact lib fns + the same call order as `useUserPreferences.completeOnboarding`; SQL-diff a native vs web profile |
| Native slider UX | Start with `@react-native-community/slider`; upgrade to a custom Reanimated track only if it feels off |
| Watched-grid query latency on device | Same dual query the web uses; cache via React Query; show skeletons |

## Open questions (recommendations inline)

- ~~Q1 — Watched grid scope~~ **RESOLVED by the screenshot** (`Step 3.png` shows "Round 1 of 3"): match the design — 3 rounds × 6.
- **Q2 — Onboarding-only phase?** Keep NATIVE-3 strictly onboarding + service-prefs (recommended) vs fold in other deferred items (Browse filter sheet, detail rating/report). Recommend separate phases — this one is already cohesive.
- **Q3 — Re-onboarding existing accounts:** ignore for now (existing profiles work) vs add a "retake" entry point in Profile. Recommend defer to a later phase.

## Out of scope

Browse filter sheet + semantic mood chips, detail rating/report/instrumentation, light theme, query persistence, password recovery, the NATIVE-4 cutover, the end-of-track design-review polish pass.
