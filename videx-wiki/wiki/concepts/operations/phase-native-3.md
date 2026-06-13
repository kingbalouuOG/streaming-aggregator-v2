---
title: Phase NATIVE-3 — Onboarding + real service prefs
type: concept
tags: [react-native, expo, capacitor-migration, native, onboarding, taste-bootstrap]
created: 2026-06-13
updated: 2026-06-13
sources:
  - docs/v2/phase-summaries/phase-native-3-summary.md
related:
  - wiki/concepts/operations/phase-native-2.md
---

# Phase NATIVE-3 — Onboarding + real service prefs

Third phase of the Capacitor → RN migration. Makes the native app self-sufficient for a brand-new user: onboarding seeds a taste profile + saved services, retiring NATIVE-2's stand-ins (hardcoded `DEV_SERVICES`, assumed pre-existing profile). Code-complete 2026-06-13; routing + Step 1 device-verified, Steps 2–5 + completion pending Joe's end-to-end test.

## The flow

5 steps matching `C:\Users\User\Pictures\Videx\V2 Onboarding\Step 1–5.png`:
1. **Create Account** — "Join VIDEX": validated fields + optional age/viewing-context → `supabase.auth.signUp`. (Sign-up moved out of the W6 AuthScreen, which is now sign-in only; "Create one" enters the flow.)
2. **Connect Services** — 2-col grid → `saveUserPreferences`.
3. **Watch History** — `useWatchedGrid` dual-query (canonical popular titles), 3 rounds × 6.
4. **Your Tastes** — 16 emoji cluster cards from `TASTE_CLUSTERS`, ≥3.
5. **Fine-Tune** — summary stats + 4 sliders (`@react-native-community/slider`).

## Routing (refactor from W6 gate)

Canonical expo-router **always-mounted-navigator + redirect**: root `Stack` (`(tabs)`, `auth`, `onboarding`, `detail/[id]`); the `(tabs)/_layout` guard redirects `!session`→`/auth`, `session && !onboarded`→`/onboarding` (via `useOnboardingStatus` over the shared `hasCompletedOnboarding`). The onboarding route owns its step state so `signUp` mid-flow doesn't remount it.

## Completion = identical Supabase rows to web

`useCompleteOnboarding` mirrors the web `completeOnboarding` verbatim, reusing the shared lib wholesale: `saveUserProfile` + `saveUserPreferences`, `bootstrapTasteVector`→`saveV2TasteVector`, `bootstrapInterestCentroids`→`saveInterestCentroids`, `saveSliderState`, then `profiles.onboarding_completed=true`. A native-built profile is byte-equivalent to a web-built one. `useUserServices` then feeds the real saved services into Home + For You (W7).

## Notes / gotchas

- New native dep `@react-native-community/slider` → needs `expo prebuild` before the gradle build links it.
- `adb input tap` cannot focus RN TextInputs to drive the account form (automation limit, not a bug — real touch works); full-flow device verification is therefore Joe's end-to-end test.
- Cluster icons: screenshots use emoji (matched via a map); web uses custom glyph tiles. Names come from `TASTE_CLUSTERS`.
- All onboarding React files in real native dirs (`native/src/components/onboarding`, `hooks`, `app`) — never under the `native/src/lib` junction (the NATIVE-2 dual-React rule).
