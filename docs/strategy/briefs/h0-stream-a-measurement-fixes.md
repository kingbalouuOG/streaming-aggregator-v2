# H0 Stream A — Measurement & integrity fixes

**Context:** Roadmap v1.0 H0 items 0.2, 0.3, 0.4, 0.5, 0.7 (dashboard half), 0.8 (see `docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md` §6/§7). These are the prerequisites for the friends-&-family shakeout: until they land, activation is unmeasurable, crashes are undiagnosable, and beta interaction data would pollute taste vectors. All findings below were verified against the live codebase/DB on 5–6 Jul 2026.

**Deliverable:** one PR (branch `fix/h0-measurement-integrity` or similar). Six work items, roughly ordered:

## A1 — Fix native onboarding funnel events (roadmap 0.2, size S)

Broken today: `onboarding_started` fires in a mount effect at `native/src/components/onboarding/OnboardingFlow.tsx:59` — but step 0 is account creation, so no session exists and `src/lib/analytics/logger.ts:11-13` drops session-less events. `onboarding_completed` fires with hardcoded `{ total_duration_seconds: 0 }` (~line 72). Production shows only `onboarding_completed` rows, duration always 0.

Fix: stamp start time locally at mount; fire/queue `onboarding_started` post-auth; add `services_completed`, `clusters_completed`, `first_home_view` on native; pass real duration to completion. Web reference implementation: `src/components/OnboardingFlow.tsx` (fires 5 events with real durations; `src/App.tsx` ~634 computes duration; `first_home_view` ~363). Ignore the dead `quiz_*` events in the taxonomy.

Verify: complete onboarding on a dev build → `public.onboarding_events` shows every step with non-zero duration.

## A2 — Complete click-out telemetry (roadmap 0.3, size XS–S)

`deep_link_click` is already rich (service, URL, dwell, confidence, position, origin surface — `src/lib/storage/interactions.ts:243-264` + `src/lib/instrumentation/clickContext.ts`). Two gaps: (a) `linkType: 'exact' | 'search'` is computed (`src/lib/openDeepLink.native.ts:34`) and passed but **silently dropped** by `emitDeepLinkClick` — persist it in metadata; (b) add `price_shown` (the rent/buy price displayed at click time — wire from `native/src/components/WhereToWatch.tsx`).

This completes the north-star metric (Weekly Watch Decisions) and future affiliate/B2B seed data.

## A3 — Crash reporting (roadmap 0.4, size S)

No Sentry/Crashlytics anywhere in `native/`. Add `sentry-expo` (or `@sentry/react-native` per current Expo 56 guidance — check current docs), DSN via env (`EXPO_PUBLIC_*` pattern, add to CI secrets note), source maps if cheap, release health on. The H0 exit gate reads "crash-free ≥99%" from this.

## A4 — Taste-vector dedup fix (roadmap 0.5, size S–M) — **integrity-critical**

Neither taste-update path dedups repeated events: the 24h recompute replays every `user_interactions` row (`src/lib/taste-v2/interactionUpdate.ts` ~268 — plain loop, no event-identity dedup) and the incremental EMA applies each event separately. Real incident: a tester's repeated mark-watched taps emitted 4× `watched` for one title and skewed his vector (UI fixed in PR #35; the data-layer gap remains). Future importers would mass-replay history into this hole.

Design decision to make in-session (document in the PR): dedup/replace rules — e.g. per (user, content_id, event_type) apply once / keep latest — applied consistently on BOTH paths, and whether the recompute re-anchors on bootstrap. Add unit tests (Vitest rig exists — see `src/lib/recommendations-v2` tests for the pattern). Consider whether existing polluted vectors (prototype users) need a one-off recompute after the fix.

## A5 — Beta-blocking fixes (roadmap 0.8, size S–M)

1. **Password reset E2E:** the email sends from the auth screen, but the in-app reset screen was deferred (comment in `native/src/providers/auth.tsx`) and the link lands wherever the Supabase Site URL points — with no deployed web surface this may be a dead end. Verify the full flow on a device; fix = in-app reset screen (deep-link handling) or a minimal hosted reset page. Strangers WILL forget passwords.
2. **`editor_notes` (migration 040):** table does NOT exist in production (verified `to_regclass('public.editor_notes')` → null, 5 Jul) while native Home references it. Determine actual behaviour (silent fallback? swallowed error?), then either apply 040 + seed at least one editor note, or remove/guard the dead path. ⚠ Remote `schema_migrations` is not authoritative — verify live schema with `to_regclass` before/after (see wiki: supabase-migration-workflow runbook).
3. **Availability-report loop E2E:** `availability_reports` has 0 rows ever, yet it's the hedge for our #1 strategic risk. Submit a report from a dev build → confirm the row lands; check the prompt is discoverable on the detail page; fix whatever blocks it.

## A6 — Metrics dashboard queries (roadmap 0.7, size S)

SQL files under `supabase/queries/` (house pattern — `dashboard.sql` exists): activation funnel (using A1's events), Tier-1 metrics (detail-view rate @10, watchlist conversion @10, deep-link CTR), WWD (deep-link clicks + mark-watched within 7 days of an impression/detail-view of that title, excluding bulk logging) + WWD/WAU, W1/W4 cohort retention. These power the weekly ritual.

## Out of scope

Notifications, share/title pages (Stream B) · security/ops items (Stream D) · store listing/release (Stream E) · any engine tuning beyond the dedup fix.

## Done means

PR green (typegen-check, lint, foryou-parity untouched or green) · each item verified on a dev build or live DB as described · wiki log entry appended for the dedup design decision (`videx-wiki/log.md`) · parking-lot register statuses updated where items close (e.g. availability-report loop).
