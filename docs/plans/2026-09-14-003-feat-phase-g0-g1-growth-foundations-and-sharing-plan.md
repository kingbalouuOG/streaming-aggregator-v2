# Phase G0 + G1: growth foundations and sharing. Audit and plan

**Date:** 2026-09-14 · **Workstream:** Growth (G-phases) · **Scope source:** `docs/strategy/Videx_Growth_Loops_Strategy_v0.1.md` §4 (Loop 1, Loop 5), §5, §6 · **Branch:** `docs/growth-loops-strategy` · **Status:** plan approved by Joe 14 Sept 2026 with every §9 decision taken (§9). Execution is five sessions (§13); the S1 handoff is `2026-09-14-004-handoff-growth-s1-links.md`. Nothing implemented or applied yet.

Everything in §2 was read from the working tree on 14 Sept (five parallel read-only audits, spot-checked by hand).

---

## 0. Summary

- **More exists than the strategy doc assumes.** Its §3 audit says "share, invite, referral: none", "no routing", "one static OG tag set". In fact H0 Stream B shipped a native share button, a Worker-rendered OG title page at `/t/{movie|tv}/{tmdbId}` with the UK availability line, and a `share` interaction event (July 2026). G0 item 2 is an extension, not a build.
- **The web build is not a distribution surface.** The Vite app has no public host, no CI deploy, and its Capacitor shell was retired on 14 Sept (PR #162). The apex `videxstreaming.com` is a separate Next.js marketing repo on Vercel; the Worker owns five dashboard-registered path prefixes. Object URLs are a Worker plus Expo Router question. D5 stands (§3).
- **Three of the eight items are net-new:** universal and app links (nothing configured), Apple and Google sign-in (email and password only), attribution (no install id, no first-open, no referrer capture, no push-open event).
- **Rooms are shared as snapshots.** `mood_rooms.id` regenerates monthly and anchored rooms have no row, so a shared room is frozen at share time into `shared_rooms` (D2). Lists wait for the G2 entity (D3).
- **Migrations:** three, pre-assigned 085 `shared_rooms` (S1), 086 `handle_new_user` (S3), 087 `growth_events` (S2). Next free number verified as 085.
- **Go-to-market:** all loops go live together (Joe, 14 Sept), so G0 to G2 build in sequence with no release between them; per-loop measures will be confounded at launch and that is accepted.

## 1. Answers to the three questions (task B)

| Question | Answer from the codebase |
|---|---|
| Is the Expo app configured for iOS as well as Android? | **Yes.** `native/app.json` has an `ios` block (`bundleIdentifier app.videx.streaming`, `buildNumber 11`), builds run on EAS via `ios-release.yml`, App Store id `6785395342` is in `native/eas.json`. iOS has been on TestFlight since 28 June and was submitted to the App Store as publicly available on 10 Sept. `workers/api/src/titlePage.ts` still has `APP_STORE_URL = ''` and `IOS_APP_STORE_LIVE = false`, so the share page shows "Coming soon to the App Store" to iPhone visitors. |
| Is there a public domain and marketing page? | **Yes, both.** `videxstreaming.com` is live on Cloudflare. Since the July cutover the apex serves the marketing site (separate repo `Videx-marketing`, Next.js on Vercel, brief at `docs/strategy/briefs/marketing-page-brief.md`). The Worker holds dashboard-managed zone routes `/v1/*`, `/t/*`, `/reset*`, `/privacy*`, `/terms*` plus `videx-api.kingbalouu.workers.dev`. Standing rule (`workers/api/README.md:47-53`): any new public Worker path needs a dashboard route or it falls through to Vercel; routes must not go in `wrangler.toml`. `/delete-account` is served but unregistered. |
| What does the Worker currently serve? | `workers/api/src/index.ts` (Hono): `GET /v1/health`; `/privacy`, `/terms`, `/delete-account`; `/reset`; `/v1/title/:type/:id` (TMDb plus OMDB JSON, 24h edge cache); **`/t/:type/:tmdbId`** (OG title page); `/v1/foryou` and `/v1/home` (Supabase JWT, KV, 30/min rate limit); `/v1/tmdb/*` allow-listed proxy; a 04:00 UTC recompute cron. No root, no 404 handler, no `robots.txt`, no sitemap, no static assets, no `.well-known`. Deploys on merge via `deploy-worker.yml`; tests are the pure modules only, run by the root vitest. |

## 2. Audit against items 1 to 8 (task A)

### Item 1. Object URLs and routing

| Surface | Exists | Missing | Constraints |
|---|---|---|---|
| Worker (public URLs) | `/t/{movie\|tv}/{tmdbId}` live, canonical to `https://videxstreaming.com`. | `/room/*`, `/list/*`; any slug. | New paths need a Cloudflare dashboard route (Joe action). |
| Native (Expo Router) | File routes under `native/src/app/`: `(tabs)/{index,foryou,browse,watchlist,profile}`, `detail/[id]`, `profile/[section]`, `auth`, `onboarding`, `curating`, `forgot-password`, `reset-password`. `+native-intent.tsx` already intercepts every system link (query guard only). Scheme `videx`. | `/room/[id]` screen (rooms are a row inside For You), `/list/[id]`, any mapping from `https://videxstreaming.com/t/…` to `/detail/…`. | Notification taps bypass `+native-intent` (they use `router.push`). |
| Web (Vite SPA) | State-based: Zustand `activeTab`, `selectedItem` / `selectedAnchorRoom` / `showCalendar` in `src/App.tsx`, `React.lazy` per page (PLAT-1 D5). One URL convention: `useFilterUrlSync.ts` writes `#search?…` via `replaceState`. | Any router, `pushState`, `popstate`. | **No public host and no deploy.** Capacitor shell retired 14 Sept; the `CapApp.backButton` stack in `App.tsx:706-721` is dead machinery. |
| Title identity | `(tmdb_id, media_type)` UNIQUE on `titles`; client id `movie-603`. | No slug column, generator, or collision policy. Closest algorithm is `buildChannel4Slug` in `src/lib/deepLinks.ts`. | Resolved by D1: id resolves, slug is cosmetic. |
| Mood room identity | `mood_rooms.id` UUID. | A stable id. `029_mood_rooms_table.sql:8-12`: one row per cluster **per generation**; the monthly recluster mints new UUIDs. Anchored rooms are computed per user at runtime and have no row. | Resolved by D2: snapshot on share. |
| Watchlist identity | `watchlist` rows keyed `(user_id, tmdb_id, media_type)`. | Any list entity. | Resolved by D3: `/list/{id}` targets the G2 `watchlists` entity. |

### Item 2. Server-rendered Open Graph previews

Exists (`workers/api/src/titlePage.ts`, route at `index.ts:265-350`): `<title>` "Where to watch X (year) in the UK | Videx", description with the subscription list, canonical, `og:*` and `twitter:*` tags, TMDb `w500` poster, "Stream now" and "Rent or buy" lists from `titles` + `streaming_availability` (service-role reads, addon rows skipped per migration 084), `videx://detail/{type}-{id}` button, UA-bucketed store CTA. Cache API 24h keyed `…/t/{type}/{id}?p={bucket}` (query already excluded). Security headers. Branded 404 with `noindex`. Pure-module tests.

Missing: room and list pages; `apple-itunes-app` smart-banner meta; a live App Store URL; JSON-LD (G4); any record of the page being fetched or opened; `?via=` handling; a shared page shell.

Constraints: the Worker runs on every request (Cache API is inside the handler), so a `preview_opened` write via `waitUntil` works on cache hits **unless** a zone Cache Rule caches HTML (§10). Crawler fetches and human opens hit the same route and must be classified by UA.

### Item 3. Android app links and iOS universal links

Nothing exists: no `ios.associatedDomains`, no `android.intentFilters`, no AASA, no `assetlinks.json`, no `.well-known` route. The prebuilt manifest carries only the `videx` scheme. Apple Team `CT8F3578W8` appears only in docs. Play package and iOS bundle id are both `app.videx.streaming`; dev variant `com.videx.app.dev`.

Constraints: the apex is Vercel, so `/.well-known/*` needs a Worker route (D5). Both platforms need a rebuild (iOS via `ios-release.yml`, Android via `android-release.yml`; neither builds locally on Windows). Android verification needs the SHA-256 of the certificate that signs the installed APK (Play App Signing key if enabled, D6). The AASA must be live before the build is installed.

### Item 4. Apple and Google sign-in, deferred deep linking

Exists: email and password only. Native: `signInWithPassword`, `signUp` (with `options.data.username`), password reset via the `videx://reset-password` bridge, session in MMKV. `supabase/config.toml` has `[auth.external.apple] enabled = false` and no Google block (local config; hosted dashboard unverified).

Missing: `signInWithOAuth` / `signInWithIdToken`, all social sign-in deps, any `returnTo` or pending-URL store. A signed-out link tap is redirected to `/auth` by `(tabs)/_layout.tsx:39` and the target is lost; `curating.tsx:104` always replaces to `/(tabs)/foryou`.

Constraints: `profiles.username` is `UNIQUE NOT NULL` and `handle_new_user` inserts `raw_user_meta_data->>'username'` (`011_profiles_baseline.sql:92-100`); a provider sign-up carries no username, so the trigger would fail (migration 086, D8). App Store guideline 4.8: Google sign-in obliges Sign in with Apple. Install-time deferred linking has no first-party mechanism on iOS; Android has the Play Install Referrer API with no Expo built-in.

### Item 5. Attribution

Exists: `user_interactions.source_surface` and `metadata`; `onboarding_events` (`event_name`, `metadata` JSONB, nullable `user_id`, **no migration in repo, RLS unknown**); `card_impressions`; typed unions `OnboardingEventName` and `InteractionEventType`; `user_feature_flags` + `getFlag`; `app_feedback.context` JSONB as the "surface + platform" precedent.

Missing: `?via=`; install id (`user_push_tokens.device_id` is never written); `first_open` / `session_start`; `notification_opened`; referrer capture; any pre-auth write path (all client writes are RLS `auth.uid() = user_id`).

Constraints: `user_interactions` is the ranking-signal table and the DB CHECK and TS union already drift. A third destination is cleaner (D10). No third-party SDK is needed.

### Item 6. Share affordance (G1)

Exists: `native/src/components/ShareButton.tsx`, absolutely positioned top-right over the detail hero, mirroring `BackButton` top-left (`detail/[id].tsx:114-119`), lucide `Share2` (the universal share glyph), RN `Share.share` (iOS gets a separate `url` field), copy "Title (year) — where to watch in the UK\n{url}", `emitShare` on `sharedAction`. `expo-sharing` not installed and not needed.

Missing: the UK availability line in the copy; a room share; `via`. Caveat: on Android RN's `Share.share` resolves `sharedAction` even on dismiss.

### Item 7. Notification deep link and "tell someone" (G1)

Exists (Notifications v1, migrations **055 to 060**): `send-notifications` composes `data: { url: 'videx://detail/{type}-{id}' | 'videx://watchlist', type }`; native `routeFromData` strips the scheme and `router.push`es; cold start via `getLastNotificationResponseAsync`. Dedup is a UNIQUE index per user, title and type; cap is one bundled push per 20h.

Missing: `delivery_id` in the payload; any `notification_opened` event (push CTR unmeasurable); a notification-originated session flag; a "tell someone" affordance.

### Item 8. Events (G1)

Exists: `share` in `user_interactions` (fires after the sheet resolves). Nothing for `share_initiated`, `preview_opened`, attributed install or sign-up, or a source split.

## 3. Routing position (decided, to be recorded as ADR-015 in S1)

- **Web.** Every object URL is a Worker page. `/t/` already is; `/room/` and `/list/` follow the same pattern. The Vite build never serves them.
- **Native.** Universal and app links deliver `https://videxstreaming.com/t/movie/603-the-matrix?via=share` to the app as a path; `+native-intent.tsx` rewrites it to `/detail/movie-603` and captures `via` and `src`. New screens `room/[id]` (S1) and `list/[id]` (G2) are ordinary files. No library added.
- **Capacitor.** Out of scope; the wrapper was retired on 14 Sept.
- **D5.** Stands. Its trigger clause ("until web distribution matters") is resolved: the surface that distributes is server-rendered HTML in the Worker.
- **Title URL.** Canonical `/t/{type}/{tmdbId}-{slug}` (D1). The Worker resolves by type and id only; the slug is derived from title and year at render time; a bare or stale slug 301s to canonical. No column.
- **Room URL.** `/room/{shared_room_id}` resolves a `shared_rooms` snapshot (D2), never a live `mood_rooms.id`.

## 4. G0 tasks

Sizes S/M/L as in the roadmap. "Joe action" marks console or dashboard steps.

| ID | Task | Size | Files touched | Notes |
|---|---|---|---|---|
| G0-1 | **ADR-015: object URLs are Worker-owned; native routes via Expo Router; SPA unchanged (D5 stands).** Records the URL grammar, ownership per surface, the inbound-link mapping contract and the snapshot rule for rooms. | S | new `videx-wiki/wiki/concepts/decisions/adr-015-object-urls-and-inbound-links.md`; `videx-wiki/wiki/registers/open-questions.md`; `index.md`, `log.md` | S1 |
| G0-2 | **Inbound link mapping and pending link.** Pure `parseInboundLink(path)` → `{ route, object, via, src }` for `/t/`, `/room/`, `/list/`, `videx://detail/…`, unknown → home; `+native-intent.tsx` runs the query guard then the mapper and writes a `pendingLink` (MMKV, 24h TTL, pattern of `onboardingDraft.ts`) when the app cannot navigate yet; consumed by `auth.tsx` after sign-in, `curating.tsx` at the end of onboarding, `(tabs)/_layout.tsx`. New `room/[id].tsx` renders a snapshot (frozen titles, availability chips for the viewer's services, share button top-right); `list/[id].tsx` is not created. | M | new `src/lib/growth/inboundLink.ts` + tests; new `native/src/pendingLink.ts`; `native/src/app/+native-intent.tsx`, `auth.tsx`, `curating.tsx`, `(tabs)/_layout.tsx`; new `native/src/app/room/[id].tsx` | S1 |
| G0-3 | **Universal links and app links.** `ios.associatedDomains: ["applinks:videxstreaming.com"]`; `android.intentFilters` with `autoVerify: true` for paths `/t/`, `/room/`, `/list/`; Worker serves `/.well-known/apple-app-site-association` (appID `CT8F3578W8.app.videx.streaming`, the three prefixes) and `/.well-known/assetlinks.json` (package `app.videx.streaming`, upload and app-signing fingerprints). Joe action: dashboard route `videxstreaming.com/.well-known/*` (plus `/room/*`, `/list/*`, `/delete-account*` while there); rebuild both platforms. | M | `native/app.json`; new `workers/api/src/wellKnown.ts` + test; `workers/api/src/index.ts`, `README.md`; `docs/v2/launch/release-runbook.md` | S1 |
| G0-4 | **Worker pages and install prompt.** Title page: slug canonical + 301, `apple-itunes-app` meta (`app-id=6785395342, app-argument=<canonical>`), App Store CTA when live (D12), `via` passthrough into the deep link and the Play `referrer`, query kept out of the cache key (assert). Extract `pageShell.ts`. New `roomPage.ts` for snapshots (label, poster grid, "Get Videx" CTA, deep link `videx://room/{id}`). Room snapshot creation: `POST /v1/share/room` (Supabase JWT) inserts `shared_rooms` and returns the URL; the app calls it before opening the sheet. | M | `workers/api/src/titlePage.ts`, `index.ts`; new `pageShell.ts`, `roomPage.ts`, `sharedRooms.ts` + tests; `supabase/migrations/085_shared_rooms.sql` | S1 |
| G0-5 | **Apple and Google sign-in.** `expo-apple-authentication` (config plugin, `ios.usesAppleSignIn`) and `@react-native-google-signin/google-signin`. `auth.tsx` gains `signInWithApple()` / `signInWithGoogle()` → `signInWithIdToken`. iOS shows Apple and Google, Android shows Google only (§9b Q4). Buttons on `AuthScreen.tsx` and `StepAccount.tsx`; a provider sign-up skips the account step and continues from step 2. Migration 086 gives `handle_new_user` a placeholder username; a "Choose your name" prompt claims one on first landing (placeholder never displayed). Identity auto-linking on matching verified email allowed. | L | `native/package.json`, `app.json`; `native/src/providers/auth.tsx`; `native/src/components/auth/AuthScreen.tsx`; `native/src/components/onboarding/StepAccount.tsx`, `OnboardingFlow.tsx`; new `native/src/app/choose-username.tsx`; `supabase/migrations/086_*.sql`; `docs/legal/privacy-policy.md` | S3. Console work in §9c. |
| G0-6 | **Attribution and growth telemetry.** Self-minted install id in MMKV. `attribution.ts` parses `via` / `src`, persists first touch. Worker `POST /v1/growth/events` (schema-validated, IP rate-limited, service-role insert) and `preview_fetched` / `preview_opened` from the page handlers via `waitUntil` with a UA class. Client emitters: `first_open`, `link_opened`, `signup_completed` with first-touch attribution (also copied into `onboarding_completed.metadata.via`). Android Play Install Referrer (D18). Migration 087 `growth_events` with `delete_own_account` / `export_user_data` updates and 12-month retention. `growth-dashboard.sql`. | L | new `src/lib/growth/attribution.ts`, `growthEvents.ts` + tests; new `native/src/installId.ts`; `native/src/app/_layout.tsx`; new `workers/api/src/growthEvents.ts`; `workers/api/src/index.ts`, `wrangler.toml`; `supabase/migrations/087_*.sql`; new `supabase/queries/growth-dashboard.sql` | S2 |

## 5. G1 tasks

| ID | Task | Size | Files touched | Notes |
|---|---|---|---|---|
| G1-1 | **Share copy and placement.** Pure `buildShareCopy(...)`: "Severance (2022). On Apple TV+ in the UK.\n{url}?via=share"; rent or buy only → "Rent or buy on Apple TV and Prime in the UK"; nothing in the UK → "See where to watch in the UK on Videx" (still shareable). Addon excluded, tone guide applies. `ShareButton` takes `availability`; the detail page passes stream options. Placement: the existing top-right hero position (mirrors Back top-left, 36pt visual, 44pt hit area, safe-area aware) on the detail page and the same position on `room/[id].tsx`. Room copy: "{label}: {n} titles picked for the mood. {url}?via=share". | M | new `src/lib/growth/shareCopy.ts` + tests; `native/src/components/ShareButton.tsx`; `native/src/app/detail/[id].tsx`, `room/[id].tsx` | S4 |
| G1-2 | **Share events.** `share_initiated` on tap, `share_completed` on `sharedAction` (iOS-trustworthy only), both to `growth_events` with `object`, `via`, `src`, `to_surface`. `user_interactions.share` unchanged. | S | `native/src/components/ShareButton.tsx`; `src/lib/growth/growthEvents.ts` | S4 |
| G1-3 | **Notification deep link and "tell someone".** Edge Function adds `delivery_id` and `via: 'push'` to `data`; `routeFromData` records `notification_opened` (with `delivery_id`) as a `growth_events` row and sets the session origin to `push` (`sessionOrigin.ts`, reset on session rollover). The detail page shows the "Tell someone" variant when origin is `push` and the title matches: arrival copy "Severance has just landed on Apple TV+" (Joe: the stronger nudge), leaving-soon copy "Severance leaves Netflix on Friday". Bundle pushes show nothing. Shares from that state carry `src=push`. | M | `supabase/functions/send-notifications/index.ts`; `native/src/providers/notifications.tsx`; new `src/lib/instrumentation/sessionOrigin.ts` + test; `native/src/app/detail/[id].tsx` | S4. Edge Function deploy is manual. |
| G1-4 | **Measures.** `growth-dashboard.sql`: shares per WAU; `preview_fetched` vs `preview_opened`; `link_opened` → `first_open` → `signup_completed` by `via`; share rate push-originated vs organic; D7/D30 by acquisition source. Growth block in `metrics-dashboard.sql`. | S | `supabase/queries/growth-dashboard.sql`, `metrics-dashboard.sql` | S4 |
| G1-5 | **Verification, docs, wiki.** Device matrix (§7); phase summary; wiki: `concepts/techniques/inbound-deep-linking.md`, `event-taxonomy.md`, `notifications-v1.md`, `migrations.md` (backfill 048 to 082), `growth-loops.md`, registers (`IN-GR` family). | M | `docs/strategy/briefs/h0-device-test-checklist.md`; `docs/v2/phase-summaries/phase-g0-g1-summary.md`; `videx-wiki/…` | S5 |

## 6. Migrations

Next free number is **085**. All additive; apply is a Joe action (Studio, never `db push`); regenerate `database.types.ts` after each.

| # | Purpose | Session |
|---|---|---|
| 085 | `shared_rooms` (`id uuid pk`, `created_by uuid → profiles cascade`, `kind text check ('global','anchor')`, `source_ref text` (mood_rooms id or `anchor:{type}-{id}`), `label text` (personal framing stripped, "More like X"), `description text null`, `tmdb_ids jsonb` (ordered `[{tmdb_id, media_type}]`, max 60), `created_at`); RLS on, insert-own via the Worker (service role) and public read through the Worker only (no anon policy); index `(created_by, created_at desc)`; `delete_own_account` and `export_user_data` extended. No expiry, no unshare (Joe, 14 Sept). | S1 |
| 086 | `handle_new_user()` tolerates a missing username: placeholder `user_` + first 8 hex of the uuid, `UNIQUE NOT NULL` kept; `profiles.username_chosen boolean not null default true`, false for placeholders. | S3 |
| 087 | `growth_events` (`id bigint identity`, `occurred_at`, `event_name` check in {`preview_fetched`, `preview_opened`, `link_opened`, `first_open`, `signup_completed`, `share_initiated`, `share_completed`, `notification_opened`}, `install_id uuid`, `user_id uuid null → profiles cascade`, `via text`, `src text`, `object_type text`, `object_id text`, `platform text`, `ua_class text`, `delivery_id uuid null`, `metadata jsonb`); RLS on, no client policies; indexes `(user_id, occurred_at)`, `(install_id)`, `(event_name, occurred_at)`; 12-month pg_cron retention registered here; `delete_own_account` and `export_user_data` extended. | S2 |

S2 and S3 run in parallel; applying 087 before 086 is fine, they are independent.

## 7. Test approach

**Unit (root vitest, hermetic, CI on every push):** `inboundLink` (every URL form × `via` × malformed query, guard first); `shareCopy` (subscription, rent or buy, none, addon excluded, iOS `url` split, room copy); `attribution` (first touch persists, TTL, stable install id); `wellKnown` (exact AASA and assetlinks JSON, content types, both fingerprints); `titlePage` additions (slug canonical and 301, smart banner, `via` passthrough, App Store CTA, cache key ignores query); `roomPage`; `sharedRooms` validation (max 60 titles, label stripping); `growthEvents` validation; `sessionOrigin`; Edge Function `composeMessage` with `delivery_id` plus `deno check`. Native `npm run lint` and `tsc --noEmit`.

**Device matrix (S5, extends `h0-device-test-checklist.md`; ad-hoc iOS via `ios-release.yml -f profile=preview`, Android via `android-release.yml`):** link × source app (WhatsApp, Messages, Slack, browser) × installed or not × signed in or out × cold or warm; preview rendering in all three chats; `adb shell pm verify-app-links --re-verify app.videx.streaming` then `pm get-app-links` shows verified; Apple CDN `https://app-site-association.cdn-apple.com/a/v1/videxstreaming.com` returns the file; Apple sign-in on a physical iPhone (new, returning, hidden email), Google on both; deferred link: signed out → tap → Google sign-up → onboarding → land on the shared title; room: share a global and an anchored room, open both as a non-user (Worker page with CTA) and as a second user (same titles); notifications: run the function, tap, `notification_opened` row with `delivery_id`, "Tell someone" shown, share carries `src=push`; telemetry: one `growth_events` row per step with correct `via` / `src` / `ua_class`.

**Rollout:** no feature flag (D14). Universal links and sign-in ship with the build.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `.well-known` reaches Vercel, link verification silently fails | High | Dashboard route before any build; curl both files externally; assert content type. |
| Wrong Android fingerprint (upload vs Play App Signing key) | High | List both SHA-256s; verify with `pm get-app-links`. |
| Apple review 4.8 or a confusing account step | Medium | Apple and Google ship together; reviewer account exists. |
| `handle_new_user` blocks every provider sign-up until 086 is applied | High | 086 applied and verified before the S3 build ships. |
| iOS install attribution not deterministic | Medium | Android open-to-install is the measured number; iOS reports link-opened post-install only. |
| Crawler fetches counted as opens | Medium | UA classification with a fixture of WhatsApp, Facebook, Slack, Twitter, Apple bots; report both. |
| Zone-level HTML caching bypasses the Worker on hits | Medium | Verify Cache Rules (§10); exclude `/t/*`, `/room/*` if present. |
| Snapshot rooms drift from the live room | Low | By design; the page says "picked on {date}". |
| Android `Share.share` cannot detect dismissal | Low | `share_completed` labelled iOS-only; `share_initiated` for the cross-platform rate. |
| `onboarding_events` RLS unknown | Medium | Pre-auth events go through the Worker regardless; verify before adding `via` to onboarding metadata. |
| New personal data without policy and label updates | Medium | Privacy policy, App Store and Play forms updated in S2; install id in export and deletion. |
| Two native rebuilds plus console work compete with H1 tracks | Medium | S1 alone first; S2 and S3 in parallel worktrees; each PR green on its own. |
| All-at-once launch confounds per-loop measures | Low | Accepted (Joe, 14 Sept); `via` and `src` still split the funnel after launch. |

## 9. Decisions (taken by Joe, 14 September 2026)

### 9a. The nineteen

| # | Decision | Resolution |
|---|---|---|
| D1 | Title URL shape | **(c)** `/t/{type}/{tmdbId}-{slug}` canonical; id resolves, slug cosmetic, 301 from bare or stale slug. No column. |
| D2 | Shareable mood room | **Snapshot on share** (new option): `shared_rooms` row frozen at share time, works for global and anchored rooms, survives the recluster, recipient sees the same titles. `stable_key` not needed. |
| D3 | `/list/{id}` | **(a)** reserve grammar and mapping in G0; build against the G2 `watchlists` entity. No snapshot list. |
| D4 | D5 and the SPA | **(a)** D5 stands; ADR-015. |
| D5 | `.well-known` host | **(a)** Worker, one dashboard route. |
| D6 | Android signing facts | Joe to supply the Play App Signing status and certificate SHA-256 before S1's build (§9c). |
| D7 | Providers | **(a)** Apple and Google, native SDKs, `signInWithIdToken`. Apple button on iOS only. |
| D8 | Username for provider sign-ups | **(a)** placeholder in the trigger, "Choose your name" prompt, placeholder never displayed. |
| D9 | Deferred link depth | **(a)** in-app pending link plus Android Install Referrer; no probabilistic iOS matching. |
| D10 | Growth events storage | **(a)** `growth_events`, Worker-written. |
| D11 | Notification opens | **(a)** `growth_events` rows with `delivery_id`; no `opened_at` column. |
| D12 | App Store status | Joe to confirm approval; S1 flips the constants if approved, else the banner still links to the listing when live. |
| D13 | `via` and the push split | **(a)** `via` = URL channel (`share`, `push`, `seo`, `card`, `household`); `src` = originating session on shares (`push`, `organic`). |
| D14 | Flag gating | **(b)** none. |
| D15 | Strategy doc | Bump to v0.2 with §3 corrected and §8 Q1/Q2 answered; re-snapshot to `raw/`. Joe's doc; can ride S5. |
| D16 | Register family | **`IN-GR`**, opened in S1. |
| D17 | Data protection | Install id and first-touch attribution accepted; policy and store labels updated in S2. |
| D18 | Play Install Referrer | Community package if it passes the new-architecture check, else a small local Expo module. |
| D19 | Web share | Leave the web tree alone. |

### 9b. Product answers (Joe, 14 Sept)

| Q | Answer |
|---|---|
| Share copy without a subscription service | "Rent or buy on … in the UK"; nothing in the UK still shares with "See where to watch in the UK on Videx". |
| "Tell someone" scope | Arrival and leaving-soon single-title taps. Arrival is the stronger nudge ("the show you've been excited about has landed"); leaving-soon second. Bundles show nothing. |
| Shared room privacy | Anonymous, personal framing stripped, no expiry, no unshare. Non-users get the Worker room page: preview, poster grid, "Get Videx" CTA, deep link if installed (the same journey as `/t/`). Bespoke management can come later if it works. |
| Providers per platform, linking, placeholder | iOS: Apple and Google. Android: Google only. Auto-link on matching verified email. Placeholder hidden behind "Choose your name". |
| Recipient actions | Shared title opens the normal detail page; shared room opens the snapshot screen with no extras. No "add all". |
| Share icon | Universal share glyph (lucide `Share2`, already in use), same top-right position on the detail page and the room screen, safe-area aware, 44pt hit target. |
| Go-to-market | All loops go live together. |

### 9c. Joe's console and account checklist (needed by session)

| Before | Where | What |
|---|---|---|
| S1 | Play Console → App integrity | Play App Signing on or off; app-signing certificate SHA-256 (and confirm the upload key `99:CE:FF:7E` is listed too). |
| S1 | App Store Connect | Whether the 10 Sept submission is approved; the public listing URL. |
| S1 | Cloudflare dashboard → Workers routes | Add `videxstreaming.com/.well-known/*`, `/room/*`, `/list/*`, `/delete-account*` to `videx-api`. |
| S1 | Supabase Studio | Apply 085; verify `to_regclass('public.shared_rooms')`. |
| S1 | GitHub Actions | Run `ios-release.yml` (preview) and `android-release.yml` after the PR merges; confirm the Associated Domains capability appears in the EAS build log. |
| S2 | Supabase Studio | Apply 087. |
| S2 | Privacy | Approve the policy paragraph; update App Store and Play data forms (install id, attribution). |
| S3 | Google Cloud Console (Firebase project `videx-3063b`) | OAuth clients: Web, iOS (bundle id), Android (package + both SHA-1s). |
| S3 | Supabase dashboard → Auth → Providers | Apple: enabled, `app.videx.streaming` in Client IDs. Google: enabled, web client id as Client ID, iOS client id in authorised clients. |
| S3 | Apple Developer portal | Sign in with Apple capability on the App ID (EAS usually syncs it; check the build log). |
| S3 | Supabase Studio | Apply 086. |
| S4 | Supabase CLI | Deploy `send-notifications` (keep `verify_jwt = true`). |
| S5 | Devices | iPhone and an Android phone; WhatsApp, Messages, Slack installed. |

## 10. Open facts to verify in S1

1. Any Cloudflare Cache Rule caching HTML on `videxstreaming.com/t/*`.
2. `onboarding_events` RLS and whether `user_id null` inserts are permitted.
3. Hosted Supabase Auth providers enabled today.
4. Whether the marketing repo's Vercel config serves anything at `/.well-known/`.
5. `get_mood_room_detail` and the anchored-room builder: which fields the snapshot needs to render the room screen without a live room.

## 11. Done on 14 September

- Strategy doc present and identical at `docs/strategy/Videx_Growth_Loops_Strategy_v0.1.md` and `videx-wiki/raw/forward-planning/Videx_Growth_Loops_Strategy_v0.1_2026-09.md` (commit `d6c3736`).
- Wiki ingest: `wiki/sources/growth-loops-strategy-v0-1.md`, `wiki/concepts/forward-planning/growth-loops.md`, `index.md`, `log.md`.
- Decisions taken (§9); S1 handoff written.

## 12. Out of scope for G0/G1

Loops 2, 3 and 4 (taste cards, households and `watchlists`, SEO page types 2 to 4), JSON-LD and sitemaps, a `/` page on the Worker, retiring the web tree's `@capacitor/*` runtime packages, `expo-updates` in-app checks, room unshare or expiry, "add all to watchlist", linking a provider to an existing email account from Profile.

## 13. Execution

Slices are task groups, not decisions. Each is one fresh session from a self-contained handoff prompt, on a worktree branch off `main` with relative paths, one PR green at every commit, wiki updated from the same worktree, and a written summary Joe pastes back into the strategy thread. That thread reconciles this plan and writes the next handoff.

| Session | Scope | Migration | Depends on | Handoff |
|---|---|---|---|---|
| S1 Links | G0-1, G0-2, G0-3, G0-4 | 085 | Joe's S1 checklist (§9c) | `2026-09-14-004-handoff-growth-s1-links.md` |
| S2 Attribution | G0-6 | 087 | S1 merged | written after S1's summary |
| S3 Sign-in | G0-5 | 086 | S1 merged; runs in parallel with S2 (different files) | written after S1's summary |
| S4 Sharing | G1-1 to G1-4 | none | S2 and S3 merged | written after S2/S3 summaries |
| S5 Verification | G1-5 | none | S4 merged; devices | written after S4's summary |

After S5 the strategy thread plans G2 (households) the same way; S5's device pass repeats as a combined check before the all-loops release.
