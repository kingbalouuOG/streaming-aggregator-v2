# Growth G0/G1 code sweep: summary

**Date:** 17 September 2026 · **Handoff:** [2026-09-17-003](../../plans/2026-09-17-003-handoff-growth-code-sweep.md) · **Scope:** the growth change set (`git diff 95186f9...main`, 111 files, ~9.5k lines) as one surface, before the 2.5.0 store release and before G2 builds on it · **Branch:** `chore/growth-code-sweep`

**Outcome.** Nine independent reviews (security, data integrity, TypeScript, races, and five finder angles: line-by-line, removed behaviour, cross-file, reuse and simplification, efficiency and altitude, conventions) produced 62 candidates. After dedup and verification against the code: **7 bugs fixed, 12 risks fixed, 10 risks filed, 15 cleanups (6 fixed, 9 filed), 18 refuted or already filed.** No exploitable hole in the Worker or the Edge Functions; one privacy bug in the database functions (migration 092). Conventions: both lint gates at zero errors, no rule violations. Cross-file: no call site broken.

## Fixed in this PR

| # | Severity | Where | What was wrong | Fix | Sources |
|---|---|---|---|---|---|
| 1 | **Bug (privacy)** | `delete_own_account`, `export_user_data` (090) | The install-id join swept every growth row of any install the caller used, including rows another signed-in account wrote on the same phone: an export disclosed that account's user id and activity; a delete erased them (seen live on one shared test install). | **Migration 092**: the join reaches only rows with no `user_id`; six cascade-only tables gain explicit deletes. Joe applies. | data-integrity, security, finder B, finder A |
| 2 | **Bug** | `parseInboundLink`, `+native-intent`, `pendingLink` | A `/list/{id}` link routed to a screen that does not exist (Expo's "Unmatched Route"), was persisted as a pending link and replayed after sign-in or onboarding. | List links keep their object for attribution but route home and are never pended. | TypeScript, finder B |
| 3 | **Bug** | `checkUsernameAvailable` | An RPC error returned `false`, which the three debounced checks read as "taken"; on the non-dismissable name screen the only way out was retyping. | Throws on error; callers' existing catch leaves the check idle. | TypeScript |
| 4 | **Bug** | `username_available` (053) | No self-exclusion: a rename whose `profiles` write succeeded but whose `auth.updateUser` failed could never be retried, the just-claimed name read as taken. | **092**: the caller's own row is ignored (`id IS DISTINCT FROM auth.uid()`). | finder B |
| 5 | **Bug** | `OnboardingFlow.onProviderSignedIn` | An already-onboarded provider sign-in from inside onboarding used `dismissAll`, which pops `/auth` too on a cold-link stack, so the pending shared link was never resumed. | Replaces to the tabs and resumes the link itself. | finder A |
| 6 | **Bug** | `confirm-email.tsx` | The 12 s timeout marked the attempt dead; a `verifyOtp` that succeeded at 13 s signed the person in behind an error screen. | The timeout shows the retry copy but a late success still leaves. | finder A |
| 7 | **Bug** | `WatchlistActions` | A tap during session restore (cold link open with a stale token) bounced a signed-in person to sign-in (IN-GR-035). | Taps are ignored while `initializing`. | races, strategy-thread review |
| 8 | Risk | `providers/auth.tsx` | `signOut()` after a successful `delete_own_account` (or on request) kept the local session when the logout request failed on a network error; the app then walked a deleted account into onboarding. | `signOutEverywhere`: local-scope sign-out, then removal of the persisted token key. | races |
| 9 | Risk | `ProfilePrivacy` | Android Back dismissed the dialog mid-delete; two presses in one frame could start two deletes. | `onRequestClose` ignores `busy`; `busyRef` guard. | races |
| 10 | Risk | `attribution.ts` | A Play referrer read that timed out (>5 s on a cold first launch) set the read flag and discarded the only deterministic install-to-object path for ever. | Timeout sentinel; the flag is set only after a real answer, so the next launch retries (Play keeps the referrer 90 days). | TypeScript, finder A |
| 11 | Risk | `installId.ts` | Hermes has no global `crypto`, so every install id came from the `Math.random` fallback. | `expo-crypto`'s `randomUUID` injected. | TypeScript |
| 12 | Risk | Worker page handlers | Every 200 on `/t/*` and `/room/*`, cache hits and crawlers included, queued an unauthenticated, unlimited `growth_events` insert. | `recordPreview` goes through the growth bucket keyed per client IP inside `waitUntil`; the response is untouched. | security |
| 13 | Risk | `POST /v1/growth/events` | The IP fallback applied only when the body had no valid install id, so a client rotating ids was never limited; at 2.4 KB per row and 12-month retention that is disk and write load, not noise. | A second, always-applied per-IP bucket (`GROWTH_IP_RATELIMIT`, 600/min) beside the install bucket. IN-GR-008 closed. | security |
| 14 | Risk | same route | The body was buffered before the length check; a chunked body had no declared length. | `content-length` required (411), checked before the read. | security |
| 15 | Risk | `growthEvents.ts` (Worker) | `metadata` accepted nested values and unlimited keys; dashboards read `metadata->>'key'`. | Flat primitives only, at most 16 keys, enforced by the shared `isFlatMetadata`. | security |
| 16 | Risk | `growthStore.ts` | A still-valid token for an account deleted within the hour hit the `profiles` FK and lost the event with a 500. | On `23503` the row is kept without attribution. | finder A, security |
| 17 | Risk | `POST /v1/share/room` | No lifetime cap: 30/min per user of permanent public pages with no unshare. | 200 snapshots per user per day. | security |
| 18 | Risk | `MoodRooms` | Open the sheet, cancel, tap again: a second identical permanent snapshot. | The resolved URL is reused per room for the session. | efficiency |
| 19 | Risk | `notifications.tsx` | `notification_opened` and the push session origin were recorded before `router.push`, which can throw. | Route first, record on success; `delivery_id` as a dedupe fallback when the identifier is empty. | races |
| 20 | Risk | `resetBridge.ts` | A recovery link with a truncated or missing `type` got the confirmation copy ("sign in"), which that user cannot do. | Only `email` / `signup` get the confirmation copy; anything else is treated as recovery. | finder B |
| 21 | Cleanup | `inboundLink`, `growthEvents`, `installReferrer`, `sharedRooms` | Four content-id rules that disagreed on leading zeros and length; four uuid regexes; a copied query parser; `CANONICAL_ORIGIN` defined twice; `GROWTH_EVENTS_PATH` exported but the Worker used the literal. | One `CONTENT_ID_RE` and `isContentId`; one `isUuid`; `readQuery` exported and reused; constants imported. | reuse, TypeScript, cross-file |
| 22 | Cleanup | `serviceLabels.ts` | A verbatim copy of `SERVICE_DISPLAY_NAMES`; a rename would desync the picker from the share sheet. | Derived from `SERVICE_DISPLAY_NAMES`. | reuse, TypeScript |
| 23 | Cleanup | `+native-intent` via `parseInboundLink` | Every `videx://` path outside the public grammar collapsed to home, so existing screens (profile/settings) were unreachable by scheme link. | Unknown app-scheme paths pass through unchanged; malformed public-grammar paths and empty paths still go home. | finder A |
| 24 | Cleanup | `slug.ts`, `username.ts`, `ShareButton`, `OnboardingFlow` | Invisible combining-character ranges in regexes; a rest-spread cast; an uncaught sign-out promise on "Leave setup". | Escapes; `runShare(props)`; `.catch`. | TypeScript |

Tests: 13 added (list route, scheme pass-through, ten-digit cap, host with port, `neutraliseRoomLabel` framings, metadata shape, bridge kinds). Root suite 798 → 811.

## Filed, not fixed (parking lot IN-GR-036 to 045)

| ID | Subject | Why not now |
|---|---|---|
| IN-GR-036 | **Account deletion is hard-blocked when the Apple revoke fails** (undeployed function, expired client secret, Apple ID signed out): "your account has not been deleted" with no in-app path. | A compliance trade-off (5.1.1(v) versus the right to erasure): Joe decides whether a failed revoke should log and proceed. |
| IN-GR-037 | **`username_chosen` adds a second serial `profiles` read to every cold start** (waterfall after the onboarding-status query; four reads of the same row after a provider sign-up). | Merge into one profile-gate query; touches the tabs guard, `auth.tsx`, `OnboardingFlow`; wants a device check. |
| IN-GR-038 | **Worker page path does avoidable work per request**: `withAttribution` buffers and rewrites the whole cached body (HTMLRewriter would stream); the room page and its JSON twin each cold-fill with the full 60-row extended select and no `media_type` filter; a service-role client is constructed per page view. | Performance, not correctness; measure first. |
| IN-GR-039 | **Growth events are one `getSession` + POST + verify + insert each**; a cold link open fires two or three within a second. | Batch on the client and accept arrays on the Worker; contract change. |
| IN-GR-040 | **Pending-link clearing keys on `session`, not focus**, which forced the replace-not-push workaround and the route-equality guard; `replace('/') + setTimeout(push)` could be `replace(route, { withAnchor: true })`; `RESET_GRACE_MS` and `lastLinkOpened` are time windows where identity would do. | Design-depth changes across the resume path; do them together with a device pass. |
| IN-GR-041 | **`notification_opened` needs no token and `delivery_id` is unverified**, so push CTR is inflatable anonymously. | Require a JWT and check the delivery row belongs to the caller, or accept as noise. |
| IN-GR-042 | **`token_hash` travels in the `/reset` query string**, which Workers Logs may record with `[observability] enabled`. Tokens are single-use and short-lived. | Joe checks whether invocation logs store `request.url`; if so, disable invocation logs or accept. |
| IN-GR-043 | **`profiles.username` has no length or charset CHECK**; the trigger stores sign-up metadata verbatim. | Needs a live scan of existing usernames before a constraint. |
| IN-GR-044 | **Resume-path UX gaps**: an onboarded account that never chose a name resumes a link before the name gate fires; a warm link opened while `/auth` is already on the stack leaves two `/auth` entries. | Both cosmetic; fold into IN-GR-040. |
| IN-GR-045 | **Cleanup batch**: four hand-built 404s in `index.ts`; page TTL and cache-key construction duplicated per page type; JSON body-reading boilerplate copied between the two POST routes; `installReferrer` validates by formatting and re-parsing a URL; month tables and pluralisation in three places; `titlePage.ts` re-exports `pageShell`; username availability and save duplicated across two screens; the push function's own label map (IN-GR-025). | No behaviour change; do as one refactor PR with the tests as the net. |

Refuted or already filed (not repeated): IN-GR-006/007/023/024 as filed; the `send-notifications` claim logic (unchanged, verified); `.well-known` variance (only CORS headers, ignored by both verifiers); AASA and assetlinks content; `/reset` token validation; `revoke-apple-token` subject check; RLS, grants and cron on 088 to 090; the pending-link one-shot consumption, cold and warm notification dedupe, session-origin grace and first-touch ordering (all traced safe with framework line references in the race review).

## What Joe must do

1. **Apply migration 092** in Studio and verify: `select pg_get_functiondef('public.username_available'::regproc)` contains `IS DISTINCT FROM auth.uid()`; `select pg_get_functiondef('public.export_user_data'::regproc)` contains `t.user_id IS NULL AND t.install_id IN`.
2. **Merge**: CI deploys the Worker; the new `GROWTH_IP_RATELIMIT` binding is created from `wrangler.toml` on deploy (no dashboard step). No Edge Function changed.
3. **App changes are JS-only** (expo-crypto was already a dependency): one OTA from `main` to the preview channel for the iPhone; they ride the 2.5.0 production binaries otherwise.
4. Decide IN-GR-036 and check IN-GR-042.

## Gates

Root `npm run lint` 0 errors (73 pre-existing warnings); `npm test` 811 passed; `npm run build` clean. Native `npx tsc --noEmit` 0 errors; `npm run lint` 0 problems; `npx expo export --platform android` clean. Worker `npm run check` clean with the new binding. `deno check` not re-run (no function changed; IN-GR-022 stands).

## Does anything change the G2 readiness view?

No. Two things sharpen it: the household loop will put two accounts on one phone as the norm, so migration 092's rule (an account owns its identified rows; unattributed rows belong to the install) is the one G2 must keep; and IN-GR-036 must be decided before Apple-linked members can leave a household by deleting their account.
