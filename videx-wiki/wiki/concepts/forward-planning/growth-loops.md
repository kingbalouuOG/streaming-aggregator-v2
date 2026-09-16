---
title: Growth loops (G-phases)
type: concept
tags: [forward-planning, growth, loops, sharing, deep-links, universal-links, attribution, households, seo]
status: in build — G0/G1 plan approved 2026-09-14; S1 links merged and deployed 2026-09-15 (PRs #172, #183, #184; migration 088 applied; routes and association files live; App Store flip + rebuilds pending; summary docs/v2/phase-summaries/phase-growth-s1-summary.md); S2 attribution built 2026-09-15 (branch feat/growth-s2-attribution, migration 090 awaiting Joe); S3 sign-in in parallel; then S4 sharing, S5 verification
horizon: H1 onward (runs beside the user track and search track from Roadmap v1.1)
created: 2026-09-14
updated: 2026-09-15
sources:
  - raw/forward-planning/Videx_Growth_Loops_Strategy_v0.1_2026-09.md
  - docs/plans/2026-09-14-003-feat-phase-g0-g1-growth-foundations-and-sharing-plan.md (repo; not snapshotted into raw/)
related:
  - wiki/sources/growth-loops-strategy-v0-1.md
  - wiki/sources/strategy-roadmap-2026-09-v1-1.md
  - wiki/concepts/architecture/notifications-v1.md
  - wiki/concepts/architecture/platform-architecture.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/registers/open-questions.md
---

# Growth loops (G-phases)

> **Status: S2 (attribution) built 2026-09-15** — `growth_events` (migration 090, awaiting Joe), Worker `POST /v1/growth/events` + `preview_fetched` / `preview_opened` on the pages, app install id + first touch + `first_open` / `link_opened` / `signup_completed`, Android Play Install Referrer as a local Expo module (`native/modules/play-install-referrer`) carrying the object for the deferred deep link, `supabase/queries/growth-dashboard.sql`, privacy + store-form drafts (not filed); see [event taxonomy](../../entities/codebase/event-taxonomy.md); follow-ups IN-GR-005..009.
>
> **Status: S1 (links) built 2026-09-14** — [ADR-015](../decisions/adr-015-object-urls-and-inbound-links.md), [inbound deep linking](../techniques/inbound-deep-linking.md), migration 088, follow-ups IN-GR-001..004. Merged, deployed, 088 applied and routes live 2026-09-15; Android fingerprints done (IN-GR-001 closed); still pending: App Store flip (IN-GR-002), rebuilds (held until the other streams finish), device checks (S5). Summary: `docs/v2/phase-summaries/phase-growth-s1-summary.md`. **G0/G1 approved.** Strategy at `docs/strategy/Videx_Growth_Loops_Strategy_v0.1.md` (summary: [source page](../../sources/growth-loops-strategy-v0-1.md)). The G0 + G1 audit and plan is `docs/plans/2026-09-14-003-…-plan.md`; its §9 records the 19 decisions Joe took on 14 Sept and §13 the five-session execution. S1 handoff: `docs/plans/2026-09-14-004-handoff-growth-s1-links.md`. Go-to-market: all loops go live together. Update this page when a session ships.

## The model

Five loops, each Input → Action → Output feeding the next input, built only where the Action's motivation is fundamental to the product. Referral incentives are ruled out. The one asset competitors lack is daily UK catalogue freshness, so every loop carries "where it is available right now" as the hook.

| Phase | Loop(s) | One-line shape |
|---|---|---|
| G0 | Foundations | Object URLs, Worker-rendered previews, app + universal links, Apple/Google sign-in with deferred deep link, `?via=` attribution |
| G1 | 1 shareable objects, 5 notification-to-share | Share a title or room from the app; recipient gets a rich preview and an install path; push taps surface "tell someone" |
| G2 | 3 household | Shared watchlists with reactions and nudges; invite link is a Loop 1 URL |
| G3 | 2 taste card | Server-rendered shareable image from `taste_profiles`, pairwise before broadcast |
| G4 | 4 programmatic SEO | Title, leaving/new-on-service pages from the daily sync; licence check first |
| G5 | Household-aware recs, SEO types 3 and 4 | Depends on G2 and G4 |

## What already exists (verified 2026-09-14)

The strategy's own §3 audit undercounts the codebase. Facts:

- **Share v1 (H0 Stream B, July 2026).** `native/src/components/ShareButton.tsx` on the detail page uses RN `Share`, shares `${API_PROXY_URL}/t/{type}/{tmdbId}`, logs `share` to `user_interactions` (growth analytics, not a ranking signal; see [event taxonomy](../../entities/codebase/event-taxonomy.md)).
- **Title share page.** Worker `GET /t/{movie|tv}/{tmdbId}` (`workers/api/src/titlePage.ts`): per-title OG and Twitter tags, poster, UK "Stream now" / "Rent or buy" lists (addon rows skipped since migration 084), canonical to `https://videxstreaming.com`, `videx://detail/…` button, UA-bucketed store CTA, 24h Cache API with the platform bucket in the key. App Store URL is still an empty constant.
- **Domain.** `videxstreaming.com` apex is the marketing site (separate repo, Vercel); the Worker holds dashboard routes `/v1/*`, `/t/*`, `/reset*`, `/privacy*`, `/terms*`. New public paths need a dashboard route.
- **iOS.** Live on TestFlight, App Store submission 10 Sept, iOS-first. So universal links and Apple sign-in are in scope.
- **Native routing.** Expo Router, file routes under `native/src/app/`; `+native-intent.tsx` already intercepts every system link (today only the IN-DEP-001 query guard). Scheme `videx`.
- **Notifications v1.** Push `data` is `{ url: 'videx://detail/…' | 'videx://watchlist', type }`; no delivery id, no open event.

## What is net-new

- App links and universal links: nothing on either platform, no `.well-known` files.
- Social sign-in: email and password only, zero OAuth code or deps. `profiles.username` is `UNIQUE NOT NULL` and the `handle_new_user` trigger reads it from sign-up metadata, so provider sign-ups need a migration before they can work.
- Deferred deep link: no pending-URL store; a signed-out link tap lands on `/auth` and the target is lost.
- Attribution: no install id (`user_push_tokens.device_id` is never written), no first-open, no referrer capture, no `via`.
- Object identity gaps: `mood_rooms.id` is regenerated by the monthly recluster and anchored rooms have no row; there is no list entity.

## Routing position (locked, ADR-015)

Object URLs are Worker-owned on the web and Expo Router-owned on device. The Vite SPA is not a distribution surface (no host, no deploy, Capacitor shell retired 2026-09-14), so PLAT-1 D5 ("React.lazy only, no router until web distribution matters") stands with its trigger resolved: the surface that distributes is server-rendered HTML. Canonical title URL is `/t/{type}/{tmdbId}-{slug}` (slug cosmetic, 301 from bare or stale). Recorded in [ADR-015](../decisions/adr-015-object-urls-and-inbound-links.md).

## Decisions taken (Joe, 2026-09-14; plan §9)

- Title URL `/t/{type}/{tmdbId}-{slug}`, id resolves, slug cosmetic, 301 to canonical. No slug column.
- Rooms shared as **snapshots**: `shared_rooms` (migration 088) frozen at share time, anonymous, personal framing stripped, no expiry or unshare. Works for global and anchored rooms; recipient sees the same titles.
- `/list/{id}` reserved only until the G2 `watchlists` entity.
- PLAT-1 D5 stands (no SPA router); ADR-015 in S1. `.well-known` served by the Worker.
- Sign-in: Apple and Google via `signInWithIdToken`; Apple button on iOS only; migration 089 gives `handle_new_user` a placeholder username claimed by a "Choose your name" prompt; auto-link on matching verified email.
- Deferred link: in-app pending link (MMKV) plus Android Play Install Referrer; no probabilistic iOS matching.
- Telemetry: new `growth_events` table (migration 090) written by the Worker; `via` = URL channel, `src` = originating session; notification opens are `growth_events` rows with `delivery_id`.
- No feature flag. `IN-GR` parking-lot family. Install id and attribution accepted as personal data (policy and store labels in S2). Web share untouched.
- "Tell someone" on arrival (the stronger nudge) and leaving-soon single-title pushes; nothing on bundles. Share glyph stays lucide `Share2`, top-right on detail and room screens.

## Shipped

- **S1 links (2026-09-15, PRs #172/#183/#184; summary `docs/v2/phase-summaries/phase-growth-s1-summary.md`):** ADR-015; `/t/{type}/{tmdbId}-{slug}` with 301 to canonical and the iOS smart banner; `shared_rooms` snapshots (migration 088) with `GET /room/:id`, `GET /v1/room/:id`, `POST /v1/share/room`; `/list/:id` reserved; AASA and assetlinks.json live (IN-GR-001 closed: Play App Signing uses the upload key); `native/app.json` associated domains + intent filter; `+native-intent` mapping + pending link (24h, resumed after sign-in or onboarding); `room/[id]` screen; share on For You room cards. Not yet in a device build (rebuild held until S2 and S3 merge). Open: IN-GR-002 (App Store CTA), IN-GR-003 (no global-room surface), IN-GR-004 (cold-start stack recheck). Strategy-thread review in the plan §11a; S2/S3 handoffs: `docs/plans/2026-09-15-001-handoffs-growth-s2-s3.md`.

## Measures to stand up in G1

Shares per WAU; preview fetched (crawler) vs opened (human); link_opened → first_open → signup funnel by `via`; share rate push-originated vs organic sessions; D7/D30 by acquisition source. Android open-to-install is deterministic via the Play referrer; iOS is inferred.
