---
title: ADR-015 — Object URLs are Worker-owned; inbound links route through Expo Router
type: concept
tags: [adr, decision, growth, deep-links, universal-links, app-links, workers, expo-router, locked]
created: 2026-09-14
updated: 2026-09-18
sources:
  - raw/forward-planning/Videx_Growth_Loops_Strategy_v0.1_2026-09.md
  - docs/plans/2026-09-14-003-feat-phase-g0-g1-growth-foundations-and-sharing-plan.md (repo; §3, §9 D1–D5, D13)
related:
  - wiki/concepts/forward-planning/growth-loops.md
  - wiki/concepts/techniques/inbound-deep-linking.md
  - wiki/concepts/decisions/adr-014-single-server-engine.md
  - wiki/registers/open-questions.md
---

# ADR-015 — Object URLs are Worker-owned; inbound links route through Expo Router

**Status:** locked (Growth S1, 2026-09-14; decisions D1–D5 and D13 taken by Joe the same day). **Keeps PLAT-1 D5** ("`React.lazy` only, no router") and resolves its trigger clause.

## Context

G0 needs every shareable object to have one https URL that unfurls in chat apps, opens the installed app on iOS and Android, and survives sign-in. Three surfaces could own that URL: the Vite SPA, the videx-api Worker, and the Expo app. The SPA has no public host, no deploy and (since 2026-09-14) no Capacitor shell. The apex `videxstreaming.com` is the Vercel marketing site; the Worker already owns dashboard routes (`/v1/*`, `/t/*`, …) and has served the OG title page at `/t/{type}/{tmdbId}` since July. Mood rooms have no stable id: `mood_rooms.id` regenerates on the monthly recluster and anchored rooms have no row.

## Decision

1. **On the web, object URLs are Worker pages.** Server-rendered HTML with OG/Twitter tags, the iOS smart banner, an "Open in the Videx app" deep link and a UA-aware store CTA (`workers/api/src/pageShell.ts`). The Worker also serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`. Each public prefix needs a Cloudflare dashboard route (README standing rule).
2. **On device, Expo Router owns them.** Universal links (`ios.associatedDomains`) and verified app links (`android.intentFilters`, `autoVerify`) deliver the https URL to the app; `native/src/app/+native-intent.tsx` maps it to a file route. No routing library is added.
3. **The SPA is not a distribution surface.** D5 stands; its "until web distribution matters" trigger is resolved because the surface that distributes is Worker HTML. The web tree is left alone (D19).

## URL grammar

| URL | Resolves by | App route | Notes |
|---|---|---|---|
| `/t/{movie\|tv}/{tmdbId}-{slug}` | type + id only | `/detail/{type}-{id}` | Slug = `titleSlug(title, year)` (`src/lib/growth/slug.ts`), cosmetic; a bare or stale slug 301s to canonical, query kept. No slug column (D1). |
| `/room/{uuid}` | `shared_rooms.id` | `/room/{uuid}` | A snapshot, never a live `mood_rooms.id` (D2). |
| `/list/{uuid}[?invite={uuid}]` | `watchlists.id` (093) | `/list/{uuid}[?invite={uuid}]` | **Live since G2 H3 (2026-09-18).** Public preview: household name, counts, up to 6 posters, never member names; noindex; 60 s cache. The screen is H2's and owns the join. A non-uuid or unknown id gets the branded 404. |

Query contract, identical on the page and in the app:

- `via` — the URL channel: `share` · `push` · `seo` · `card` · `household`.
- `src` — the session a share originated in: `push` · `organic`.
- `invite` — a household invite token (G2 H3). Read on list links only, uuid only; anywhere else, or malformed, it is null. It goes into the list page's deep link (`videx://list/{id}?invite=…`) and Play referrer (`l=` + `i=`) after the cache read, never into a cache key or the cached body.
- Values outside these sets are dropped, never rewritten. The page passes valid values unchanged into the `videx://` deep link and into the Play URL as `&referrer=via%3D…%26src%3D…`. Edge-cache keys never include the query (`titlePageCacheKey`, `roomPageCacheKey`); the markers are filled after the cache read.

## Snapshot rule for rooms

A shared room is frozen at share time: `POST /v1/share/room` (Supabase JWT) inserts `shared_rooms` (migration 088) with the ordered `{tmdb_id, media_type}` list (max 60), a label with personal framing stripped ("Because you liked X" / "If you love X" → "More like X"), and no expiry or unshare. The public page and the app read the same row through one Worker path (`GET /room/:id`, `GET /v1/room/:id`); titles keep the snapshot order, availability is today's, and the page says "picked on {date}". Works for global and anchored rooms and survives the recluster.

## Inbound mapping contract

`parseInboundLink(path)` in `src/lib/growth/inboundLink.ts` (pure, unit-tested) returns `{ route, object, via, src }`:

- https forms above (www or apex, with or without slug, query or trailing slash) and `videx://detail/{type}-{id}`, `videx://room/{uuid}`, `videx://list/{uuid}` → the app routes above, `object` = `{type: 'title', id: 'movie-603'}` / `{type: 'room', id}` / `{type: 'list', id}`. Since H3 the result also carries `invite` (list links only); `inboundHref(link)` composes the router path `/list/{id}?invite={token}`.
- `videx://watchlist` and `videx://reset-password?…` → passed through unchanged, `object` null.
- Anything else → `'/'`, `object` null.

`+native-intent.tsx` runs `stripMalformedQuery` first (IN-DEP-001 guard), then the mapper, records object links as the **pending link** (`native/src/pendingLink.ts`, MMKV, 24h TTL) and returns `inboundHref(link)`. The pending link is resumed after sign-in (`auth.tsx`) or at the end of onboarding (`curating.tsx`), and dropped when the target screen reaches focus for a signed-in user, or on sign-out.

**Pending link v2 (G2 H3, 2026-09-18):** `{version: 2, route, object, via, src, intent: 'open' | 'join', invite, seenAt}`; shape and rules in `src/lib/growth/pendingLinkRecord.ts` (pure, tested). A list link is stored deliberately, `intent: 'join'` with a token, else `'open'`, and `route` includes `?invite=`. Version-1 rows are discarded on read. A resume consumes title and room links but **never clears a list link**: the list screen calls `clearPendingLinkFor('/list/{id}')` (query ignored) once `join_household` resolves, so a failed join can be retried after the next sign-in.

## Consequences

- Both platforms need a rebuild to claim the domain; the association files must be live first.
- Android verification depends on `ASSETLINKS_FINGERPRINTS` listing the key that signs the installed APK (Play App Signing key for Play installs).
- Notification taps do not pass through the interceptor (they `router.push` server-authored paths), so push attribution is S4's job.
- Title shares now use the canonical slugged URL on `videxstreaming.com` rather than the configured API origin.
