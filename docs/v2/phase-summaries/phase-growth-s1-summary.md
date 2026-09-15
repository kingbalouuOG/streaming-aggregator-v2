# Growth S1 (links): summary

**Date:** 2026-09-15 · **Workstream:** Growth (G0) · **Scope:** G0-1 to G0-4 from [plan 2026-09-14-003](../../plans/2026-09-14-003-feat-phase-g0-g1-growth-foundations-and-sharing-plan.md), [handoff 2026-09-14-004](../../plans/2026-09-14-004-handoff-growth-s1-links.md) · **PRs:** #172 (S1), #183 (page cache version, regenerated database types), #184 (Android link verification fingerprint)

**Status: code complete, merged, deployed and verified on the live domain.** Not yet active on phones: the next native builds are deliberately held until the other growth streams finish (Joe, 2026-09-15), so the device checks move to S5.

## What shipped

- **ADR-015 (the URL decision record)** (`videx-wiki/wiki/concepts/decisions/adr-015-object-urls-and-inbound-links.md`).
  - On the web, the Worker serves object URLs; on phones, Expo Router opens them. The web SPA is not a distribution surface; D5 stands.
  - It records the `/t/`, `/room/` and `/list/` grammar, the `via` / `src` rules (share, push, seo, card, household / push, organic), the snapshot rule for rooms and the link-to-screen mapping.
  - Registers: the D5 row is updated in open questions, and the IN-GR family is open in the parking lot.
- **Worker**
  - **Title pages:** `/t/:type/{tmdbId}-{slug}`. A bare or stale slug gets a 301 and keeps the query.
    - The page now carries a slugged canonical and the iOS smart banner.
    - `via` and `src` are passed into the app deep link and the Play referrer. They're added after the cache read, so the cache isn't split per share.
    - The page code is shared with the room page (`pageShell.ts`), and cache keys carry `PAGE_CACHE_VERSION`.
  - **Room snapshots:** `GET /room/:id` (the public page), `GET /v1/room/:id` (the same data as JSON for the app), and `POST /v1/share/room`.
    - Sharing needs the user's Supabase sign-in token and is rate-limited per user.
    - A room holds at most 60 titles, and personal labels are neutralised to "More like X".
  - **Lists:** `GET /list/:id` is reserved and returns a noindex 404.
  - **Link verification files:** the iOS `apple-app-site-association` file (modern and legacy formats) and Android's `assetlinks.json` (fingerprints from `[vars] ASSETLINKS_FINGERPRINTS`).
- **Migration 088 `shared_rooms`**
  - Applied by Joe and verified live: RLS on, no policies, no anon or authenticated grants.
  - `delete_own_account` and `export_user_data` were rebuilt from 086's versions with `shared_rooms` added.
  - `src/lib/database.types.ts` was regenerated (#183).
- **Shared library (`src/lib/growth`), all unit-tested:**
  - `titleSlug`
  - `parseInboundLink`, which runs after the IN-DEP-001 query guard
  - The `normaliseVia` / `normaliseSrc` helpers
  - The room snapshot data contract (`roomSnapshot.ts`)
- **Native app (in main, not in any build yet)**
  - `app.json` gains iOS associated domains and one Android intent filter (`autoVerify`, for `/t/`, `/room/` and `/list/`). A test keeps these in step with the verification files.
  - `+native-intent` maps incoming links to screens and records a **pending link** (`native/src/pendingLink.ts`): kept for 24h, resumed once after sign-in (`auth.tsx`) or at the end of onboarding (`curating.tsx`), and cleared on sign-out.
  - The tabs sit underneath any screen opened from a cold-start link (`unstable_settings.initialRouteName = '(tabs)'`), so Back has somewhere to go.
  - New `room/[id]` screen.
  - A share button on the For You room cards.
  - Title shares now use the canonical slugged URL.

## Verified live on videxstreaming.com (2026-09-15)

- **iOS file:** `/.well-known/apple-app-site-association` returns 200 `application/json` with the correct content, and Apple's CDN copy (`app-site-association.cdn-apple.com/a/v1/videxstreaming.com`) returns 200.
- **Android file:** `/.well-known/assetlinks.json` returns 200 with `99:CE:FF:7E:70:01:19:F5:21:03:8A:D5:2C:AC:C6:1A:F7:42:B6:5C:E0:0D:9E:58:E3:A0:C1:1E:18:41:4C:57`. Google's Digital Asset Links API (`statements:list`) reads the same statement.
- **Title page:** `/t/movie/550?via=share` gets a 301 to `/t/movie/550-fight-club-1999?via=share`. The page has the slugged canonical, `apple-itunes-app` meta and `videx://detail/movie-550?via=share`.
- **Reserved and error paths:**
  - `/list/x` is a noindex 404.
  - An unknown `/room/{uuid}` shows the branded "Room not found" page, noindex.
  - `/v1/room/{uuid}` returns a JSON 404.
  - An unauthenticated `POST /v1/share/room` returns 401.
- **Also routed now:** `/delete-account`, which had been served since launch but never routed, returns 200.
- **Checks:** root lint (0 errors), root and native typecheck, 598 tests, web build, native lint, `expo export --platform android` and the Worker bundle check all pass; CI is green.

## What Joe did

- Applied 088.
- Added dashboard routes `/.well-known/*`, `/room/*`, `/list/*` and `/delete-account*`.
- Confirmed Play App Signing uses the same key as the upload key, so one fingerprint covers store installs and sideloaded builds. IN-GR-001 is closed.

## Still open

- **IN-GR-002:** the App Store button on the pages still says "Coming soon" until approval is confirmed and the listing URL supplied. The smart banner already ships.
- **Rebuilds:** held until the other streams finish. Until then, universal and app links do nothing on devices; the pages work without them.
- **Device checks, moved to S5:**
  - Android `adb shell pm get-app-links app.videx.streaming` shows `verified`.
  - A link opened with the app closed, and again with it open, on both platforms.
  - Sign out, open a link, then sign in or sign up, and land on the object.
  - Share a room and open it as a non-user and as a second user.
  - **IN-GR-004:** the tabs-underneath change applies to every cold-start deep link, so recheck the password reset link and cold-start notification taps.

## Where the plan was wrong or incomplete

1. **Migration numbers moved.** 085–087 went to the channel entitlements work, so S1 is **088**, S3 `handle_new_user` is **089** and S2 `growth_events` is **090**. 086 had also rewritten `delete_own_account` and `export_user_data`, so later migrations must build on those versions.
2. **No native room screen existed.** The native app has no anchored-room screen and no global-room surface; a room card just opened one title. Room sharing therefore lives on the For You room cards, and `kind: 'global'` is accepted by the API but nothing calls it (IN-GR-003).
3. **Room previews carried only 4 thumbnails.** The For You payload gained `AnchorRoomPreview.titleRefs` so a share snapshots the whole room. A feed cached before this has no share button until its 20-minute cache expires.
4. **Detail and room screens have no sign-in guard.** A signed-out recipient sees the object straight away, then meets `/auth` when going Back. The pending link still resumes it after sign-in. `(tabs)/_layout.tsx` needed no change; the plan had it as a consumer.
5. **Cold-start stack.** The tabs-underneath change wasn't in the plan (IN-GR-004).
6. **Stale page cache.** Title pages cached before the S1 deploy kept serving the old HTML. Fixed with `PAGE_CACHE_VERSION` in #183; bump it on any page markup change.
7. **§10 open facts, answered:**
   - The Worker runs on cached page hits (no zone cache rule is in the way), so `waitUntil` telemetry will fire on hits.
   - Vercel serves nothing at `/.well-known/`.
   - `onboarding_events` has RLS with `auth.uid() = user_id` inserts, so null-user inserts are rejected and pre-auth events must go through the Worker.
   - `delete_own_account` and `export_user_data` bodies were verified against production before each rewrite.
   - Hosted Supabase Auth providers weren't checked; that's for S3.

## Notes for the next handoffs

- **S2 (attribution, migration 090):**
  - Reuse `normaliseVia` / `normaliseSrc` from `src/lib/growth/inboundLink.ts`.
  - The pending link record already stores `via`, `src` and `seenAt`.
  - Page handlers are the place for `preview_fetched` / `preview_opened` via `waitUntil`, after `withAttribution`.
  - The Play referrer already carries `via=…&src=…`.
- **S3 (sign-in, migration 089):**
  - `auth.tsx` now signs in through a focus effect: replace to `/`, then push the pending route.
  - Provider sign-ups resume the link through `curating.tsx`.
  - Keep both paths.
- **S4 (sharing):**
  - `ShareButton` takes either title props (canonical URL and the old copy, plus `emitShare`) or a `url` string or async function (no event).
  - Share copy and `share_initiated` / `share_completed` go there.
  - The room share button currently logs nothing.
- **S5:** the device checks above, plus IN-GR-002 if the App Store has approved by then.
