# Phase G2: the household loop (shared watchlists, invites, reactions, nudges). Audit and plan

**Date:** 2026-09-17 · **Workstream:** Growth (G-phases) · **Scope source:** `docs/strategy/Videx_Growth_Loops_Strategy_v0.2.md` §4 Loop 3, §6 · **Follows:** G0/G1 (verified on device 17 Sept, code sweep merged) · **Status:** plan only, awaiting Joe's review. Nothing implemented or applied. §9 holds every schema and scope decision; none has been resolved here.

Everything in §2 was read from `main` on 17 Sept by four parallel read-only audits (watchlist model and screens; notifications for nudges; invite, join and list links; For You blending).

---

## 0. Summary

- **G0/G1 built most of the plumbing the household loop needs.** The URL grammar, the Android intent filter and the AASA already claim `/list/*`; `via=household` and `object_type='list'` are valid in the attribution contract with no migration; the page shell, store CTAs, preview telemetry, the sign-in stack (Apple, Google, email with confirmation, placeholder usernames), the pending-link resume and the signed-out-then-sign-in pattern all carry over. No store rebuild is needed for the links.
- **Nothing exists for the entity.** No household, membership, list, item, reaction or invite table; no invite or join code anywhere; the personal `watchlist` table has no DDL or RLS in the repo at all (it predates the migration series). The Watchlist tab is a status segmentation, not a list picker; the client shape has no list identity; the server scoping primitive forbids cross-user reads by construction.
- **Two things the strategy assumed are wrong in the code.** The daily push cap is global (a nudge and an arrival would starve each other), and the delivery ledger cannot key a nudge (its title columns are required). Both need small, additive changes.
- **Recommendation (for your decision): additive schema, personal watchlist untouched, one shared list per household in v1, invite as a revocable token on the list's stable URL, reads and writes through membership RLS, join and invite minting through SECURITY DEFINER RPCs, the public preview and telemetry through the Worker, nudges from a separate 15-minute Edge Function.** The "migrate the personal watchlist into a default list" idea is deferred: it touches the shared storage layer the web build compiles and buys nothing the loop needs.
- **Prerequisites:** IN-GR-034 (ask for notification permission after onboarding) before the nudge session; migration 093 onward (092 is the last applied).
- **Not in G2:** the "For both of you" row (G5; §2 item 4 records that the plumbing is cheaper than feared), the daily digest beyond a stub, multiple lists per household, comments, the guest-first "Tonight link" from roadmap H3 Bet 3 (a different shape; §9 D14).

## 1. What the loop must do (from the strategy, restated as behaviour)

1. A signed-in person creates a household ("Sofa") and gets an invite link to share.
2. The invitee opens the link: a preview page (no app) or the list screen (app installed), signs up or in, joins, and sees the shared list.
3. Members add titles to the shared list from the detail page; each item shows who added it; members react (thumbs up, thumbs down, "tonight?").
4. When a member adds titles, the other members get a push within the hour ("Joe added 3 titles to Sofa"), bundled, capped, and not competing with arrival alerts.
5. Everything is measured: households per 100 users, members per household, two-active-members at day 30, adds per week, nudge-to-open.

## 2. Audit

### Item 1. Watchlist data model and screens

| Area | Exists | Missing | Constraints |
|---|---|---|---|
| `watchlist` table | Live, per-user rows keyed `(user_id, tmdb_id, media_type)` (upsert conflict target in `src/lib/supabaseStorage.ts:135`); columns from `database.types.ts:1861-1910`: id, user_id, tmdb_id, media_type, status, rating, title, poster_path, genre_ids, added_at, updated_at. | **No `CREATE TABLE`, no unique constraint name, no RLS policy anywhere in `supabase/migrations/`.** No `list_id`, `added_by`, `watched_at`. | The live DDL and policies must be captured in a migration before anything touches the table. |
| Client shape | `WatchlistItem` (`src/lib/storage/watchlist.ts:53-65`), statuses `want_to_watch` / `watched`, rating `-1|0|1`; one flat `items[]`; one react-query key `['native','watchlist']` (`native/src/hooks/useWatchlist.ts:21`). | Any list identity. | Shared with the web build (`src/hooks/useWatchlist.ts`, `src/components/WatchlistPage.tsx`); a required new field breaks web compile, an optional one does not. |
| Screens | Watchlist tab = two status segments (`native/src/app/(tabs)/watchlist.tsx:13,86-87`); `WatchlistActions` on detail with the IN-GR-028/035 signed-out and initialising guards; thumbs write `watchlist.rating` (`DetailEngagement.tsx:62,64`). | A list picker axis; per-member reactions (the single `rating` is owned by the row's owner). | |
| Sync | Dual backend with local fallback; `syncStatus` fields written but **no reconciliation worker exists**; signed-out writes blocked on native instead. | | Shared lists cannot rely on the local-first path. |
| Engine coupling | For You excludes `watchlistIds` (`hardFilters.ts:319-337`, `ranker.ts:361-362`); "From Your Watchlist" row reads the table (`foryouRender.ts:773-831`); taste updates come from `user_interactions`, never the table. | | Whether shared-list items count as "already shortlisted" is a product decision (§9 D8). |
| Server scoping | `withUserScope` auto-applies `.eq('user_id', …)` on every select and injects `user_id` on upsert (`src/lib/server/userScope.ts:26-38,76-90`). | A membership-aware scope. | Any server read of a shared list needs a new primitive, not a raw client escape hatch. |
| Names | Display name is `auth.user_metadata.username`; `profiles` is owner-readable only since 038; no display_name or avatar. | A way for members to see each other's names. | Needs a co-member SELECT policy or an RPC in the `username_available` mould. |
| Telemetry | `user_interactions` has `watchlist_add/remove` (CHECK-constrained); `card_impressions` already allows surface `'watchlist'` (unused). | | New interaction event types need a CHECK migration; a new impression surface value does not. |
| Delete/export | 092 rewrites both functions wholesale; `watchlist` lines at `:74` and `:128`. | | Every new user-scoped table re-emits both bodies (IN-PX-54). |

### Item 2. Notifications for nudges

- **Cap is global.** `DAILY_CAP_WINDOW_MS = 20h` and `hitDailyCap(userId)` count any delivery of any type (`send-notifications/index.ts:81, 240-249`), checked first in the per-user loop (`:406`). A nudge and an arrival would starve each other for 20 hours.
- **Dedup key cannot hold a nudge.** `notification_deliveries.tmdb_id` and `media_type` are NOT NULL and in the UNIQUE index (`057:29-30, 48-49`); both `notification_type` CHECKs allow only `arrival` and `leaving_soon` (`056:26`, `057:28`).
- **Type registry is the clean extension point.** `NOTIFICATION_TYPES` (`index.ts:60-63`) drives `getEnabledTypes` (`:133-147`); absent preference row means enabled (`056:11-18`).
- **Trigger mechanisms.** No trigger calls `net.http_post` anywhere; `enqueue_function_call` (068) has an allow-list without `send-notifications` and is service-role only; two pure-SQL `*/5` crons exist as precedent (068, 073). The Expo send and receipt code lives only inside `send-notifications/index.ts:259-362`, not in `_shared/`.
- **Native routing of a push.** `routeFromData` string-strips `videx://` and pushes the path (`notifications.tsx:92-95`), bypassing `parseInboundLink`; there is no list screen and no `+not-found`; an unknown push type collapses to `'bundle'` in `pushOriginType` (`:48-50`) and would pollute the bundle metrics.
- **Consent.** Permission is asked only at the first watchlist add (`WatchlistActions.tsx:59`); IN-GR-034 moves it to after onboarding and is not built. About 10 tokens existed on 10 Sept.
- **Legal.** The privacy policy promises push text is "the title name and a short availability line, nothing more" (`privacy-policy.md:121-123`, mirrored in `policyContent.ts:65`) and enumerates two alert types; a nudge names another member. New wording plus a store-form re-submit trigger.
- **Metrics.** `growth-dashboard.sql` §6c hardcodes the two types in three places (`:415-418, 426-434, 452`).

### Item 3. Invite, join and list links

- **Worker.** `GET /list/:id` is a nine-line branded 404 (`index.ts:555-564`): no id validation, no cache, no `recordPreview`, and `withAttribution` is called without the object, so the Play referrer never carries a list. The room page (`index.ts:498-538`, `roomPage.ts`, `roomStore.ts`) is the template, but it renders a frozen public snapshot with a 24h cache; a live list needs a short-TTL public preview and a member view that never enters the edge cache (`cacheControlFor` also sets browser `max-age=60`, `rules.ts:61`).
- **Inbound chain.** `parseInboundLink` maps `/list/{id}` to route `/` with a list object (`inboundLink.ts:150-156`). **The comment there and the sweep summary say list links are never pended; the code disagrees**: `writePendingLink` only skips links with no object (`pendingLink.ts:38-39`), so a list link is stored with route `/` for 24h and replayed as a push to Home. Harmless today; for G2 it is the hook we want, but it must be made deliberate and tested.
- **Resume.** `PendingLink` carries route and object only, no intent (`pendingLink.ts:27-35`). A join is a network mutation with failure modes (expired, full, already a member); neither consumer (`auth.tsx:39-46` focus effect; `curating.tsx:85-115`, one-shot with a 6 s backstop) has an error surface. The list screen must own the join, and `clearPendingLinkFor` must not fire until the join has resolved.
- **Play referrer** carries only `t=` and `r=` (`installReferrer.ts:36-37`); an Android invitee who installs from the page lands on For You with no household unless an `l=` key is added.
- **Share.** `runShare`'s URL arm hard-gates on a room object (`ShareButton.tsx:113`) and hardcodes `via=share` in `withShareAttribution` (`shareCopy.ts:103-106`); an invite needs a third target arm, its own copy and a `via` parameter.
- **Tokens.** No invite or code generation exists. `generateUuid` is explicitly not cryptographic (`uuid.ts:8-10`); `shared_rooms.id` (`gen_random_uuid()`, 088) and `claim_push_token` (060, possession-of-token as proof of right, SECURITY DEFINER) are the patterns to copy.
- **Events.** `object_type='list'` and `via='household'` need no migration; `household_joined` (the loop's conversion event) is a new name and needs a CHECK change.

### Item 4. "For both of you" (G5 readiness, not G2 scope)

Cheaper than feared: `match_titles_by_vector` takes any vector with no identity binding (076); every per-user reader takes an explicit `UserScope`, so a second scope for the partner is one line; no new RPC. What must be new: an authorisation check in the Worker (the service role bypasses RLS, so reading a partner's vector is unguarded today), a partner-side services read (services are never read server-side), a household cache entry keyed on both members' `taste_vector_updated_at`, and a decision on union versus intersection of exclusion sets. The blending strategy itself stays parked until G2 telemetry exists.

## 3. Recommended architecture (each point is a §9 decision)

- **Additive schema; personal `watchlist` untouched.** New tables only; the personal list stays as it is and the "default personal list" migration is deferred (§9 D1). This keeps `src/lib/storage/watchlist.ts` and the web build untouched, and the For You exclusion semantics unchanged.
- **One household, one shared list in v1.** `watchlists` exists as a table with a `household_id` so multiple lists are additive later, but v1 creates exactly one per household and the UI shows "Sofa" beside "Mine" (§9 D2, D3).
- **Invite = revocable token on the list's stable URL.** `https://videxstreaming.com/list/{listId}?invite={token}&via=household`. The path is already claimed by the AASA and intent filter (no rebuild); the list URL stays the list's identity; the token grants the join and can expire or be revoked (§9 D4, D5).
- **Access model: RLS for members, RPCs for the edges, Worker for the public face.** Items and reactions are read and written by the app directly under membership policies (the first `EXISTS (SELECT … FROM household_members …)` policies in the codebase); creating a household, minting an invite, joining and leaving are SECURITY DEFINER RPCs (server-side `gen_random_uuid()` tokens, rate limited in the `username_available` mould); the Worker renders the public preview from a service-role read and records `preview_fetched` / `preview_opened` (§9 D6).
- **Nudges from a separate `send-nudges` Edge Function on a 15-minute cron**, with the daily cap made per type group so nudges and arrivals are independent, a partial unique index keyed on (recipient, list, hour bucket), the Expo send code extracted to `_shared/expoPush.ts`, and a global floor across groups (§9 D9, D10).
- **Names.** A co-member RPC returning `(user_id, username)` for the household, reading `profiles.username` (kept in sync with the metadata name since IN-GR-013) (§9 D7).

## 4. Tasks by session

| Session | Scope | Migration | Depends on |
|---|---|---|---|
| **H1 Schema and RPCs** | Migration 093: capture the live `watchlist` DDL and RLS as a no-op record; `households`, `household_members`, `watchlists`, `watchlist_items`, `watchlist_reactions`, `household_invites`; membership RLS; RPCs `create_household`, `create_invite`, `join_household(token)`, `leave_household`, `household_members_view`; `delete_own_account` / `export_user_data` re-emitted; `growth_events` CHECK gains `household_joined`; typegen. **Folded in (18 Sept): IN-GR-043**, a length and charset CHECK on `profiles.username`, because G2 is the first time other people see usernames. Pure-SQL tests via `supabase/queries/verify-093-*.sql` in the 089 style. | 093 | Joe's §9 decisions |
| **H2 App: list, items, reactions, invite share** | A `withListScope` read path in `src/lib` (new module, shared lib untouched otherwise); `native/src/app/list/[id].tsx` (members' view: items, who added, reactions, "tonight?"; signed-out preview state with Join → sign-in → resume); Watchlist tab gains a list picker axis ("Mine" / "Sofa"); "Add to Sofa" on the detail page beside the personal add; household creation and member management under Profile; invite share via a third `ShareTarget` arm with `via=household`; per-list react-query keys; events `share_initiated/completed` (list), `household_joined`. | none | H1 applied |
| **H3 Links: preview page, join resume, referrer** | Worker: `/list/:id` real route (id validation, `loadListPreview`, short-TTL `listPageCacheKey`, `recordPreview`, object passed to `withAttribution`), `GET /v1/list/:id/preview` (public, cached) and `GET /v1/list/:id` (JWT, `private, no-store`), `POST /v1/household/invite` or the RPC route; `parseInboundLink` captures `invite`; `PendingLink` gains `intent` (version bump) and the list branch is made deliberate with tests; the list screen owns the join and clears the pending link only after it resolves; Play referrer `l=` key; `PAGE_CACHE_VERSION` bump. **Folded in (18 Sept): IN-GR-040 and IN-GR-044**, the resume-path pass (pending-link clearing keyed on focus, `replace(route, { withAnchor: true })`, the name-gate and double `/auth` cases), since H3 rewrites that path. | none | H1 applied; runs in parallel with H2 (disjoint files) |
| **H4 Nudges** | Migration 095 (was 094 until D16 moved removal into H2): notification type CHECKs widened, nullable title columns plus partial unique indexes, per-type cap; `_shared/expoPush.ts` extraction; `send-nudges` function (`*/15`), cron migration; digest pass in the 08:00 run (stub); app: `PushOriginType` and routing through `parseInboundLink`, preference row, list-shaped "Tell someone" moment; privacy policy and in-app mirror wording (Joe approves); store forms; dashboard §6c/§6d literals. **Folded in (18 Sept): IN-GR-041**, `notification_opened` requires a JWT and the Worker checks `delivery_id` ownership, since nudge CTR starts driving decisions. | 095 | H2 + H3 merged; **IN-GR-034 merged first** |
| **H5 Verification and docs** | Device matrix on both platforms (two accounts, two phones; invite cold and warm, join after sign-up, referrer install on Android, reactions, nudge within 15 min, cap independence, leave and delete semantics); phase summary; wiki (schema, RLS pattern page gains the membership policy, event taxonomy, notifications-v1, growth-loops, registers); IN-GR-009 revisit for shared devices. | none | H4 merged; one rebuild only if a native module changes (none expected) |

Suggested order: H1 → H2 ‖ H3 → H4 → H5, with the IN-GR-034 session before H4. The pre-G2 hygiene session (`2026-09-18-001`) runs before H3 and H4 so neither inherits the Worker and push-function duplication it removes. Handoff prompts are written per session after the preceding summary, as in G0/G1, with file ownership when two run in parallel.

## 5. Migrations

Next free number is **093** (092 applied 17 Sept).

| # | Purpose |
|---|---|
| 093 | Household entity (§4 H1). Shape to confirm in §9: `households(id uuid pk, name text, owner_id → profiles, created_at)`; `household_members(household_id, user_id, role check ('owner','member'), joined_at, pk (household_id, user_id))`; `watchlists(id uuid pk, household_id → households, name, created_by → profiles on delete set null, created_at)`; `watchlist_items(id uuid pk, watchlist_id, tmdb_id, media_type check, title, poster_path, added_by → profiles on delete set null, added_at, unique (watchlist_id, tmdb_id, media_type))`; `watchlist_reactions(item_id → watchlist_items on delete cascade, user_id → profiles on delete cascade, reaction check ('up','down','tonight'), created_at, pk (item_id, user_id))`; `household_invites(token uuid pk default gen_random_uuid(), household_id, created_by, expires_at, max_uses int, uses int default 0, revoked_at)`. RLS: members read the household, its lists, items and reactions; members insert items and their own reactions; owners update the household and revoke invites; nobody reads `household_invites` directly (RPC only). RPCs with pinned `search_path`. `delete_own_account` / `export_user_data` re-emitted (items and reactions the user made are exported; on deletion, reactions cascade, `added_by` is nulled so items survive, a sole-owner household is deleted, otherwise ownership passes to the oldest member). `growth_events` CHECK gains `household_joined`. |
| 094 | Member removal (§4 H2, D16 (a), 18 Sept): `remove_member(p_household_id, p_user_id)` and `revoke_invite(p_household_id)`, owner-only SECURITY DEFINER RPCs reusing `household_leave_internal`; verify script in the 093 style. |
| 095 | Nudges (§4 H4): widen `notification_preferences` and `notification_deliveries` type CHECKs to add `household_nudge`; make `tmdb_id` / `media_type` nullable; replace the unique index with two partial ones (title types unchanged; `(user_id, notification_type, list_id, nudge_window) WHERE notification_type = 'household_nudge'`); add `list_id`, `nudge_window`, and a per-send `push_id` (closes IN-GR-026); cron `send-nudges` every 15 minutes registered here. |

Both additive. Apply is Joe's action; typegen after each.

## 6. Test approach

- **SQL:** verification scripts per migration (`supabase/queries/verify-093-*.sql`) exercising the RLS as `authenticated` for a member and a non-member (`set role`, `request.jwt.claims`), the invite lifecycle (create, join, expiry, max uses, revoke, double join), deletion semantics (sole owner, non-owner, reactions cascade, `added_by` nulling).
- **Unit (root vitest):** list scope helpers, `parseInboundLink` with `invite`, `PendingLink` v2 read/write/consume with intent, referrer `l=` round trip, invite share copy, Worker `listPage` and `listPreview` renderers, `growthEvents` new name, `send-nudges` compose and cap-group logic as pure modules (the 08:00 function's `compose.test.ts` pattern).
- **Gates:** root lint, tests, build; native tsc, lint, export; Worker dry-run; `deno check`.
- **Device (H5):** two phones, two accounts; the invite matrix (cold and warm, installed and not, signed in and out, Android store install with `l=`); reactions visible to the other member; nudge arrives within 15 minutes and does not suppress the next arrival alert; leave and delete; the Watchlist tab with both lists.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Undocumented `watchlist` DDL and RLS | High | 093 records the live definition first (read-only capture verified with `pg_get_constraintdef` and `pg_policies`), and G2 never alters that table. |
| First membership RLS in the codebase gets a case wrong (silent empty reads) | High | SQL verification script as `authenticated` for member, non-member and anon before any app code; the RLS pattern page's three-role rule. |
| Member data leaks into the public page cache | High | Preview is a separate derived read with no member fields; member view never touches `withEdgeCache`; a test asserts the preview renderer has no member names. |
| Invite token misuse | Medium | Server-minted uuid, expiry, max uses, owner revocation, per-user rate limit and daily cap on invite creation, generic errors. |
| Nudge and arrival cannibalise each other | Medium | Per-type cap groups plus a global floor; verified on device in H5. |
| Push tokens are rare | Medium | IN-GR-034 lands before H4; the nudge is useless without it. |
| Shared-device deletion semantics (IN-GR-009) | Medium | 093 defines what a departing member's items and reactions do; H5 tests it; policy wording updated. |
| Policy promises broken by nudge copy | Medium | Wording change with the copy, in-app mirror re-synced, store forms re-filed. |
| Scope creep into G5 | Medium | The "For both of you" row stays out; §2 item 4 records the plumbing for later. |
| Stale worktree copies pollute searches | Low | Handoffs scope greps to the live trees; the two merged worktrees still on disk cannot be removed on Windows (path length). |

## 8. Open facts to verify in H1

1. The live `watchlist` unique constraint name and its RLS policies (`pg_policies`), and whether any other policy grants cross-user reads.
2. Whether Supabase Realtime is enabled on the project (a later nicety for live list updates; not required for v1).
3. The current count of push tokens and of two-account devices in `growth_events` (baseline for the nudge and deletion decisions).

## 9. Decisions needed from Joe

> **Resolved 2026-09-18.** Joe accepted every recommendation as written (D1 to D14 the (a) or "as stated" option; D15 approved in principle, wording still to be approved when H4 drafts it). The table below is kept as the record; the H1 handoff is `2026-09-18-002-handoff-growth-h1-schema.md`.

| # | Decision | Options | Recommendation from the audit |
|---|---|---|---|
| D1 | **Personal watchlist** | (a) untouched; shared lists are new tables beside it; (b) migrate it into a default personal list now | (a). (b) touches the shared storage layer the web compiles and changes For You exclusion semantics for no loop benefit. |
| D2 | **Household model** (strategy open question 3) | (a) owner and members, up to N; (b) flat membership | (a), with N = 6 in v1. An owner is needed for invite revocation and deletion semantics. |
| D3 | **Lists per household** | (a) exactly one shared list in v1 (table supports more later); (b) per-list membership from the start | (a). Membership on the household; the strategy's "couple's list and flat's list" is two households. |
| D4 | **Invite mechanism** | (a) link with a revocable token on the list URL (`/list/{id}?invite=…`), no rebuild; (b) a typeable code as well; (c) `/join/{token}` path (new route, AASA, intent filter, rebuild) | (a) in v1; (b) later if research asks for it. |
| D5 | **Invite expiry and uses** | expiry 7 days; multi-use up to the member cap; owner can revoke; a new invite replaces the old | As stated. The 24h pending-link TTL must be shorter than the invite TTL. |
| D6 | **Access model** | (a) RLS for reads and writes, RPCs for create/invite/join/leave, Worker for the public preview; (b) everything through Worker endpoints with service-role checks | (a). Less code, enforced in the database, Realtime-ready. |
| D7 | **Member names** | (a) an RPC returning co-members' usernames; (b) a co-member SELECT policy on `profiles`; (c) no names, only "a member" | (a). Usernames only; no display name or avatar exists. |
| D8 | **For You and the shared list** | (a) shared-list items are not excluded from recommendations; (b) excluded like personal watchlist items | (a) in v1: the shared list is a queue to decide from, not a "seen" signal. Revisit with G5. |
| D9 | **Nudge policy** | cadence 15 minutes via a separate function; per-type cap groups; global floor of 3 pushes per 24h; quiet hours 22:00 to 08:00 UK | As stated. |
| D10 | **Daily digest in v1** | (a) stub only (nudges carry the load); (b) full digest pass in the 08:00 run | (a). |
| D11 | **Reactions** | up, down, "tonight?"; one per member per item; "tonight?" is a reaction, not a status; no comments | As stated. "Watched" on a shared item stays personal (the member's own watchlist). |
| D12 | **Leaving and deletion** | items stay with `added_by` nulled; reactions cascade; sole-owner deletion deletes the household; otherwise ownership passes to the oldest member | As stated. |
| D13 | **Events** | (a) one new name `household_joined`; reuse the rest with object type list; nudges via `notification_opened` with `metadata.kind` | (a). |
| D14 | **Tonight links (roadmap H3 Bet 3)** | Confirm that the guest-first, no-account group vote is a separate later shape and that G2 builds the accounts-based household as the strategy states | Confirm. The roadmap's "K≤3 centroids already model household members" note is a G5 input. |
| D15 | **Policy wording and store forms** | Approve the "household activity" paragraph and the nudge-copy disclosure when H4 drafts them | Needed before H4 merges. |

## 10. Done in this session

- Four audits; this plan. No wiki register changes; the growth-loops page and log note the plan. The G2 session handoffs are written after Joe's §9 answers, H1 first.

## 11. Session outcomes

### 11a. 2026-09-18: decisions taken, H1 handoff written

- All fifteen §9 decisions accepted as recommended (Joe, 18 Sept). D15's wording is still approved per text when H4 drafts it.
- H1 handoff: `2026-09-18-002-handoff-growth-h1-schema.md`. It fixes the RPC signatures and error codes H2 and H3 build against, so those two handoffs are written after H1's summary, not before.
- Prerequisites in flight: IN-GR-034 (notification prompt) and the pre-G2 hygiene session (IN-GR-022/025/045) started 18 Sept from their own handoffs; v2.5.0 build 14 / versionCode 17 submitted 18 Sept.

### 11b. 2026-09-18: H1 merged (PR #211), migration 093 applied and verified live

- **Live (verified from the strategy thread with read-only queries):** six tables, `is_household_member` plus the five RPCs, 11 policies, `growth_events` CHECK carries `household_joined`, `profiles.username` CHECK added VALID (0 of 18 rows violated; IN-GR-043 closed). Types regenerated. Verify script `supabase/queries/verify-093-households.sql` (rolls back).
- **Prerequisites landed the same day:** IN-GR-034 (PR #208, iPhone-verified, PR #212) and the hygiene session (PR #210, follow-ups #213). `send-notifications` redeployed 18 Sept with the new copy.
- **Contract H2 and H3 build against.** Every failure is `RAISE EXCEPTION` with the message equal to one code (SQLSTATE P0001); RLS refusals are 42501; every RPC also raises `not_authenticated`. `create_household(p_name)` → `invalid_name`, `household_limit` (3 owned). `create_invite(p_household_id)` → `not_owner`, `rate_limited` (10 per owner per 24h); a new invite revokes the previous one. `join_household(p_token)` → `invite_invalid`, `invite_expired`, `invite_exhausted`, `household_full`, checked in that order, **but a caller who is already a member returns `already_member = true` before any token check**, so replays and retries never error for a member. `leave_household` and `household_members_view` → `not_member`. Table-returning RPCs come back as arrays (`data[0]`). Items: INSERT only on `(watchlist_id, tmdb_id, media_type, title, poster_path, added_by)` with `added_by = auth.uid()`; no UPDATE grant, so use `ON CONFLICT DO NOTHING`; title 1–300, poster_path ≤ 200. Reactions: plain upsert on `(item_id, user_id)`; `updated_at` by trigger. Delete: the adder or the household owner; after a member leaves their items have `added_by` null and only the owner can delete them. When an owner leaves, every open invite is revoked and the new owner mints a fresh one. A BEFORE DELETE trigger on `profiles` runs the leave logic, so D12 holds however an account goes.
- **§8 answers:** no cross-user read policy anywhere before 093 (the personal watchlist's constraint is `watchlist_user_id_tmdb_id_media_type_key`, two owner-only policies); Realtime publication exists with no tables and 0 subscriptions; 24 push tokens across 8 users; 11 installs in `growth_events`, 1 with two accounts.
- **What H1 changed in the plan:** the JWT member route `GET /v1/list/:id` in H3 is unnecessary, the app reads the list under RLS; only the public preview stays on the Worker. H3's join must not clear the pending link on focus for list routes: the list screen (H2) clears it after `join_household` resolves.
- **Two decisions H1 surfaced, one for Joe (D16 below), one taken here:** the per-row membership check and the two rate-limit edge cases are filed as IN-GR-046 and IN-GR-047 (parked; not v1 problems).
- Next: H2 (app) and H3 (links) in parallel, handoffs `2026-09-18-003` and `2026-09-18-004`, file ownership in each. H4 waits for both.

**D16: removing a member. Decided 2026-09-18: (a).** H2 writes migration 094 (`remove_member`, `revoke_invite`); H4's migration is 095. 093 has no way for an owner to remove a member and no revoke RPC (revocation is "mint a new invite"). A forwarded link admits up to six people for seven days, so a wrong join can only be undone by the wrong person leaving. Options: (a) **recommended**: H2 writes a small migration 094 adding `remove_member(p_household_id, p_user_id)` (owner only, reuses `household_leave_internal`, `not_owner` / `not_member` / `cannot_remove_self`) and `revoke_invite(p_household_id)` (owner only), with a "Remove" action on the members screen; H4's migration becomes 095. (b) Ship v1 without removal and add it in the first patch. (c) Shorten the invite to single-use so a forwarded link cannot admit strangers, and defer removal. The H2 handoff step 7 is now unconditional.
