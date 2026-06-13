# Phase NATIVE-3 — Onboarding + real service prefs: Summary

**Status:** Code-complete 2026-06-13; awaiting Joe's end-to-end device test. Routing + Step 1 design + touch interactivity device-verified; Steps 2–5 + completion are build-green (tsc 0, bundles, release APK builds with the new slider native module) but not yet device-run (see §Verification).
**Branch:** `phase-native-3-onboarding` (stacked on NATIVE-2; PRs into **`native-integration`**, NOT main — branch-isolation decision).
**Plan:** `docs/plans/2026-06-13-001-feat-phase-native-3-onboarding-plan.md`. Design targets: `C:\Users\User\Pictures\Videx\V2 Onboarding\Step 1–5.png`.

## What shipped

The native app is now **self-sufficient for a brand-new user** — onboarding seeds a taste profile + saved services, retiring the two NATIVE-2 stand-ins (hardcoded `DEV_SERVICES`, assumed pre-existing profile).

1. **W1 — Routing refactor + Step 1.** Gate moved to the canonical expo-router always-mounted-navigator + redirect pattern (`(tabs)` guard: `!session`→`/auth`, `session && !onboarded`→`/onboarding`). `AuthScreen` is sign-in only; "Create one" enters onboarding. **Step 1 "Join VIDEX"** (account creation, matched to `Step 1.png`): validated email/username/password/confirm, optional age-range + viewing-context chips, ToS → `supabase.auth.signUp`.
2. **W2 — Connect Services** (`Step 2.png`): 2-col service grid + Select All.
3. **W3 — Watch History** (`Step 3.png`): `useWatchedGrid` replicates the web dual-query (canonical popular titles, movie vote≥5000 / tv vote≥1500+pop≥20, interleaved, shuffled), 3 rounds × 6, See-different / skip.
4. **W4 — Your Tastes** (`Step 4.png`): 16 emoji cluster cards from `TASTE_CLUSTERS`, pick ≥3, "N selected" badge.
5. **W5 — Fine-Tune** (`Step 5.png`): summary card (prose + Genres/Titles/Services stats) + 4 sliders (`@react-native-community/slider`) with "Leaning X" captions; logic ported from web `StepTasteSummary`.
6. **W6 — Completion** (`useCompleteOnboarding`): mirrors web `completeOnboarding` verbatim — `saveUserProfile` + `saveUserPreferences`, `bootstrapTasteVector`→`saveV2TasteVector`, `bootstrapInterestCentroids`→`saveInterestCentroids`, `saveSliderState`, `profiles.onboarding_completed=true` (+ demographics). **Writes the same Supabase rows as a web-built profile.** Analytics: STARTED/COMPLETED events.
7. **W7 — Real service prefs** (`useUserServices`): Home + For You score against the user's onboarding-saved services; both `DEV_SERVICES` constants deleted.

## Design fidelity

Every step built against its `V2 Onboarding` screenshot + the web `OnboardingFlow.tsx` step component (behaviour). One deliberate deviation: the screenshots show emoji cluster icons (Step 4) — matched with an emoji map — while the web uses custom glyph tiles; cluster **names** come from the authoritative `TASTE_CLUSTERS` data. Step 1 device-verified against `Step 1.png` (match). Steps 2–5 visual diff pending the device run.

## Verification

- **Device-verified:** routing both directions (signed-out→auth→Create one→Step 1; signed-in+onboarded→tabs); Step 1 matches `Step 1.png`; touches + selection states work (age-chip highlights orange on tap); no crashes/JS errors.
- **Not yet device-run:** Steps 2–5 full flow + completion/bootstrap + For You from a fresh profile. `adb input tap` cannot focus RN TextInputs to drive the account form (automation limitation, not a bug — real touch works), and the signed-in `skipAuth` path needs a session/password CC doesn't have. **This is Joe's end-to-end test.**
- Gates: native tsc 0, `expo export` bundles, release APK builds (incl. the `@react-native-community/slider` native module via `expo prebuild`).

## Deferred (later phases)

Browse filter sheet + semantic mood chips, detail rating/report/instrumentation, light theme, query persistence, password recovery, re-onboarding existing accounts (Q3), the design-review polish pass, the NATIVE-4 cutover. Username server-availability check (green tick is format-only for now).

## Test guide for Joe

Open `Videx Dev` (currently signed out) → "Create one" → run the 5 steps with a throwaway email → confirm: each step matches its screenshot, "Start exploring VIDEX" lands on Home, and **For You renders personalised rows** from the freshly-bootstrapped profile. Then sign out / back in to confirm returning-user routing. (To get back to your own account: sign in with joegreenwas@gmail.com.)
