# H0 Stream B — Notifications v1 + Share v1 & title pages

**Context:** Roadmap v1.0 H0 items 0.9 + 0.10 (see `docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md` §6). Joe's call (6 Jul): the retention loop (alerts) and growth loop (share) ship *inside* v1, before the quiet store release. This is H0's biggest build (L–XL + M–L). **Phase 1 must run in week 1** because its output feeds the solicitor briefing (Stream C).

**Deliverable:** likely two PRs (Phase 1+share can precede notification delivery). Branches e.g. `feat/notifications-v1`, `feat/share-title-pages`.

## Phase 1 — Notifications data model + consent spike (week 1, size S)

- Design + migrate the push-token table (e.g. `user_push_tokens`: user_id FK, expo_push_token, platform, device metadata kept minimal, created/updated; RLS: owner-only ALL — check against the house RLS pattern in `videx-wiki/wiki/concepts/techniques/rls-pattern.md`).
- Notification-preferences model (per-type opt-in: arrivals, leaving-soon; default prompt UX copy — privacy-forward tone, ask *after* first value moment, not at first launch).
- **Deliverable for Stream C:** a half-page data-model note (what's stored, why, retention, how consent is captured/withdrawn) → appended to `docs/legal/` working notes so the single solicitor pass covers push data. Post it in the PR description too.

## Phase 2 — Notification delivery (size L–XL)

- `expo-notifications` + EAS credentials: FCM v1 service account (Android) and APNs key (iOS) — **needs Joe's Google/Apple accounts**; EAS stores them (see `docs/v2/launch/` runbooks; EAS project `@kingbalouu/videx`).
- Token registration/refresh on sign-in + app start; clear on sign-out; handle Expo push receipts (prune dead tokens).
- **Alert triggers — an Edge Function on a daily cron (after the 06:00 UTC sync), reading:**
  - **Arrival alerts (free forever):** `streaming_history` `event_type='added'` × user watchlists × user services. Dedupe per (user, title) — never notify twice for the same arrival.
  - **Leaving-soon:** read `streaming_availability.expires_on` (~2K titles carry forward-looking dates) — do **NOT** infer from history (the sync writes SA 'expiring' changes as `event_type='updated'`, not a usable signal). Notify at e.g. 7 days out, once.
  - Known blind spot: manual bulk syncs (`scripts/sync-content.ts`) write **no** history events — the pipeline must tolerate gaps without mass-firing on the next incremental sync.
- Batch sends via Expo push API from the Edge Function; per-user caps (max ~1/day for v1 — retention feature, not spam).
- Notification tap → deep-link to the title's detail page (Expo Router linking).
- Settings: toggles per alert type under Profile; consent state respected server-side (the cron filters on it, not just the client).

## Share v1 + minimal title pages (size M–L)

- **Native:** share action on the detail page (React Native `Share`) — text + smart link. Nothing exists today (zero `Share` usage in `native/src`).
- **Worker title route** on `workers/api` (Hono — follow existing route patterns in `workers/api/src/index.ts`): e.g. `GET /t/:type/:tmdbId` serving a minimal server-rendered HTML page — OG tags (poster, title, year), where-to-watch snapshot from the Supabase cache, app-store links (Play live; App Store once live), and a deep-link attempt for users with the app. Cache on the CDN (24h, follow the existing per-path TTL pattern).
- This page is also the **SEO seed** ("where to watch X in the UK") — keep the markup crawlable (real title in `<title>`, JustWatch attribution NOT required here since availability comes from our SA-API-fed cache, but check `docs` if TMDb imagery is used → TMDb attribution).
- Log share events (`share` event in `user_interactions` metadata or impression pipeline — keep consistent with the event taxonomy in `videx-wiki/wiki/entities/codebase/event-taxonomy.md`).

## Constraints & notes

- Arrival alerts are FREE forever (strategy §5 — they're the retention loop and a taste-signal source). Leaving-soon ships free in v1; it becomes a Premium anchor later — build the type separation cleanly so gating later is config, not surgery.
- The **release valve** (roadmap 0.12): if FCM/APNs credentialing drags >~2 weeks, the quiet release proceeds without notifications and this ships as a fast-follow. Flag early if credentials block.
- Coordinate with Stream A: separate branches; A merges first (it touches `src/lib` analytics seams this stream also logs through).

## Done means

Arrival + leaving-soon alerts firing on real data to a physical Android device and an iOS device · share → title page → store-link round-trip works · consent toggles honoured server-side · data-model note delivered to Stream C · wiki ingest (event-taxonomy page + a new notifications concept page) rides the PR.
