---
title: Lifecycle manager
type: concept
tags: [lifecycle, capacitor, dwell, deep-link, app-state]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - raw/phase-summaries/Videx_v2_Phase_0_End_of_Phase_Summary.md
related:
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/entities/codebase/module-map.md
  - wiki/entities/infrastructure/capacitor.md
---

# Lifecycle manager

`src/lib/lifecycle/appState.ts`. Wraps Capacitor's `App.addListener('appStateChange')`. Centralises all background/foreground coordination so the dwell timer and impression batcher don't race on multiple listeners.

## Public surface

- `subscribe(listener)` — register a listener for background/foreground transitions. Returns unsubscribe function.
- `isForeground()` — synchronous current-state check.
- `markDeepLinkExpected()` — starts a 3-second window during which the next background event is tagged `expected: true`.
- `flushImpressions()` — called by the impression batcher at lifecycle boundaries.

## Single-listener invariant

Phase 0 verification: exactly one `App.addListener('appStateChange'` in the codebase, at `src/lib/lifecycle/appState.ts:61`. Any other lifecycle subscriber must go through this manager. Multiple direct listeners would race.

## Deep-link expected-background window

Critical race fix from Phase 0 Task 9a hotfix: on Android, the `AppLauncher.openUrl()` intent dispatches **before** the openUrl promise resolves. The `appStateChange { isActive: false }` arrives in between.

Code sequence MUST be:

```typescript
markDeepLinkExpected();  // before the await
await AppLauncher.openUrl(deepLink.url);
```

Calling `markDeepLinkExpected` after the await leaves a window where the background event arrives unmarked, the dwell timer treats it as session interruption, and the 5-minute abandonment fallback fires (observed as `exit_reason='app_backgrounded'` after fast-return from Netflix).

## Dwell timer interaction

`src/lib/instrumentation/dwellTimer.ts` subscribes via `lifecycle.subscribe`. Behaviour:

1. On DetailPage mount: `startDwell()`, capture `sessionIdAtStart`, record mount timestamp.
2. On `appStateChange { isActive: false }`:
   - If `expected: true` (within 3s of deep-link click): do not pause. Deep-link click already recorded as exit_reason; background is known consequence.
   - Otherwise: pause timer, save elapsed.
3. On `appStateChange { isActive: true }`: if paused, resume.
4. On DetailPage unmount: `exitDwell()`, fire single `dwell_event` with `{ dwell_seconds, exit_reason, session_id: sessionIdAtStart }`. Idempotent.
5. On app backgrounded for >5 minutes without returning: session abandoned. Fire `dwell_event` with `exit_reason: 'app_backgrounded'` and original `sessionIdAtStart`. New session_id minted on next foreground.

`sessionIdAtStart` captured at `startDwell` time, not emit time, so a 5+ minute background mid-dwell still emits with the original session ID. Without this, abandonment events would be tagged with the new post-rollover session.

## Impression batcher interaction

The batcher subscribes to lifecycle for triggers 3 (background, foreground) and 6 (component unmount). Centralisation prevents order-of-event issues.

## Web fallback

Web preview falls back to `document.visibilitychange` instead of Capacitor `appStateChange`. Same subscriber interface, different underlying source.

## Phase 0 verification

14/14 end-to-end checks PASS on production APK against production Supabase, including:

- Dwell back-to-previous ~15s → `dwell_event` with `exit_reason='back_to_previous'`, `dwell_seconds≈15`, `session_negative_accumulator=-0.25`.
- Dwell background 30s mid-session → resumes, final `dwell_seconds` excludes the background interval.
- Dwell 6-min background → abandonment fires with `exit_reason='app_backgrounded'` and the OLD `sessionIdAtStart`.
- Fast-return after deep link → `exit_reason='deep_link_click'`, NOT `'app_backgrounded'` (race fix working).
