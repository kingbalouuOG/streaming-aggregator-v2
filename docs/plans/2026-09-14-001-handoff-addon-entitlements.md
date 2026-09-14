# Handoff: add-on channels as sub-entitlements (build session)

**Date:** 2026-09-14 · **Brief:** `docs/strategy/briefs/addon-entitlements.md` (read it in full first) · **Prerequisites:** migration 084 applied; the "ingestion floor + addon label" PR merged; Worker redeployed from `main`.

Paste the block below into a fresh session.

---

Context: Videx. Build the add-on channel entitlement model described in
docs/strategy/briefs/addon-entitlements.md — read it IN FULL first, then
videx-wiki/wiki/registers/parking-lot.md IN-SC-004 and the sync-pipeline
runbook section "Vendor id resolution" so you know how availability rows
arrive. The direction is decided (sub-entitlements of the parent service,
one entitlement per channel however it is bought, a curated picker); the
open questions in the brief §"Open questions" are yours to resolve with
Joe, not to inherit.

State you are starting from:
- `streaming_availability.stream_type = 'addon'` rows carry `addon_id` and
  `addon_name` (Prime ~18k rows, Apple ~2.7k, NOW 318 — NOW is only passes).
- Migration 084 excludes addon rows from `titles.available_services`, so
  today a channel-only title is on nobody's services. That is the interim
  you are replacing with a per-user answer.
- The detail page already lists channel-only options under "Via a channel"
  (`detailAdapter.channelOptions`, `native/src/components/WhereToWatch.tsx`).
  Search hits and the share page already ignore addon rows. Fingerprints
  exclude them by rule (`platformAdapter.ts`).
- `user_services` holds the parent services a user selected in onboarding.

Deliver, in this order (the Worker contract must ship before the app —
wave-1 lesson, wiki log 2026-09-10):
1. Migration 085: `service_addons` curated registry (parent service id,
   addon_id, display name, standalone service id where one exists,
   curated flag, sort) seeded with the brief's first list, and the
   per-user entitlement store (extend `user_services` or add
   `user_service_addons`; RLS as `user_services`; include in
   `delete_own_account()` and `export_user_data()` — IN-PX-54 rule).
   Verify live schema with to_regclass before assuming anything; do NOT
   `supabase db push` (ledger gaps — see the migrations wiki page).
2. Derivation + engine: keep `available_services` as "reachable without a
   channel"; add the channel answer (second array or query-time join) and
   extend the hard filter in `src/lib/recommendations-v2/hardFilters.ts`,
   `src/lib/server/homeRender.ts` and the Worker so a channel row counts
   only when the user holds parent + channel (or the mapped standalone
   service). Measure the query cost against the GIN index.
3. Worker: accept channel ids in the profile/services contract; extend
   `VALID_SERVICE_IDS`; deploy from `main` BEFORE any app build.
4. Native: onboarding service step and Profile → services get a curated
   channel picker under the Prime / Apple / NOW tiles (chips, not a modal);
   where-to-watch promotes held channels to tier 1 and keeps the "Via a
   channel" list for the rest. `npm run lint` in `native/` after a root
   install.
5. Device verification on an ad-hoc iOS build (TestFlight delivery is
   broken on Joe's phone — use `ios-release.yml -f profile=preview`), then
   wiki: parking-lot IN-SC-004 closed, a concepts/product page for the
   entitlement model, log entry.

Constraints: `titles` has exactly two writers and you are not becoming a
third. Anything touching production data needs Joe's approval with counts
in hand. Worktree branch off main, relative paths, wiki updated from the
same worktree. The relevance floor in `backfill-missing-titles` treats
channel-only titles as "other" (200 votes); decide with Joe whether
curated channels earn the included floor (20) and change it there if so.
