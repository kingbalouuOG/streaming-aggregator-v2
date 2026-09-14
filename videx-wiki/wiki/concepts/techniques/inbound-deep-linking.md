---
title: Inbound deep linking (universal links, app links, pending link, room snapshots)
type: concept
tags: [technique, deep-links, universal-links, app-links, expo-router, workers, growth]
created: 2026-09-14
updated: 2026-09-14
sources:
  - docs/plans/2026-09-14-003-feat-phase-g0-g1-growth-foundations-and-sharing-plan.md (repo)
  - docs/plans/2026-09-14-004-handoff-growth-s1-links.md (repo)
related:
  - wiki/concepts/decisions/adr-015-object-urls-and-inbound-links.md
  - wiki/concepts/forward-planning/growth-loops.md
  - wiki/entities/codebase/migrations.md
---

# Inbound deep linking

How a `https://videxstreaming.com/…` link reaches the right screen, built in Growth S1 (2026-09-14). The decision record is [ADR-015](../decisions/adr-015-object-urls-and-inbound-links.md). Not device-verified yet: that is S5.

## Pieces

| Piece | Where | Does |
|---|---|---|
| Object pages | `workers/api/src/{pageShell,titlePage,roomPage}.ts`, routes in `index.ts` | `/t/`, `/room/`, `/list/` HTML with OG tags, smart banner, deep link, store CTA; 24h Cache API keyed by id + platform bucket. |
| Association files | `workers/api/src/wellKnown.ts` | AASA (`CT8F3578W8.app.videx.streaming`, `components` + legacy `paths`) and `assetlinks.json` (package `app.videx.streaming`, fingerprints from `[vars] ASSETLINKS_FINGERPRINTS`). `application/json`, no redirect. |
| iOS universal links | `native/app.json` `ios.associatedDomains: ["applinks:videxstreaming.com"]` | iOS fetches the AASA via Apple's CDN at install. |
| Android app links | `native/app.json` `android.intentFilters` (VIEW, `autoVerify`, BROWSABLE + DEFAULT, `/t/`, `/room/`, `/list/`) | Android verifies `assetlinks.json` at install. `app.config.js` spreads `config.android`, so the dev variant keeps the filter (and will not verify, being `com.videx.app.dev`). |
| Intent interceptor | `native/src/app/+native-intent.tsx` | Query guard (IN-DEP-001) → `parseInboundLink` → pending link → route. Must never throw. |
| Mapper | `src/lib/growth/inboundLink.ts` | Pure grammar → route + `via`/`src`. Tests cover every form, malformed queries and the guard ordering. |
| Pending link | `native/src/pendingLink.ts` | MMKV `{route, object, via, src, seenAt}`, 24h TTL. Resumed by `auth.tsx` (after sign-in) and `curating.tsx` (after onboarding), pushed on top of the tabs; dropped by `detail/[id]` and `room/[id]` when shown with a session, and on sign-out. |
| Stack base | `native/src/app/_layout.tsx` `unstable_settings.initialRouteName = '(tabs)'` | A cold-start link renders the tabs beneath the object so Back has somewhere to go. |
| Room snapshots | migration 088 `shared_rooms`; `POST /v1/share/room`; `GET /v1/room/:id`; `native/src/app/room/[id].tsx` | See below. |

## Journeys

- **Installed, signed in:** tap → app opens `/detail/movie-603` (or `/room/{id}`) over the tabs; pending record cleared on mount.
- **Installed, signed out:** the detail and room routes sit outside the `(tabs)` auth guard, so the object shows first. Back focuses the tabs, whose guard redirects to `/auth`; after sign-in `auth.tsx` replaces to `/` and pushes the pending route.
- **Installed, new user:** as above, then "Create one" → onboarding → curating → For You with the pending route pushed on top.
- **Not installed:** the Worker page (preview, store CTA with the Play referrer). iOS has no deterministic deferred link (D9); Android's Install Referrer lands in S2.

## Room snapshots

The For You payload's `AnchorRoomPreview` carries `titleRefs` (all room titles, ids only) since S1. The share button on each mood-room card posts `{kind: 'anchor', source_ref: 'anchor:{type}-{id}', label, description, titles}`; the Worker validates it (`workers/api/src/sharedRooms.ts`: max 60, dedupe, label de-personalised), inserts with the service role and returns `https://videxstreaming.com/room/{id}`. Payloads cached before `titleRefs` existed hide the button until the 20-min KV entry expires. `kind: 'global'` is accepted but the app has no global-room surface yet.

## Gotchas

- Every public prefix needs a Cloudflare dashboard route to `videx-api`, or Vercel answers 404 (verified 2026-09-14: `/.well-known/*` and `/room/*` return Vercel 404s before the routes exist).
- `assetlinks.json` must list the **Play App Signing** key for Play installs; the upload key (`99:CE:FF:7E…`) signs only sideloaded CI APKs. Check with `adb shell pm get-app-links app.videx.streaming`.
- The Worker runs on cached page hits (`x-videx-cache: hit` on `/t/movie/603`, 2026-09-14), so no zone Cache Rule is bypassing it; attribution fill-in depends on that.
- `onboarding_events` RLS is on with `auth.uid() = user_id` insert policies, so null-user (pre-auth) inserts are rejected — pre-auth telemetry must go through the Worker (S2).
