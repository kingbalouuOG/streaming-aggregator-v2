---
title: Event Taxonomy
type: entity
tags: [events, instrumentation, signals, analytics]
created: 2026-04-26
updated: 2026-09-18
sources:
  - raw/codebase-snapshots/event-taxonomy.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - docs/v2/phase-summaries/phase-5-summary.md
  - supabase/migrations/090_growth_events.sql (repo; Growth S2)
  - supabase/migrations/093_households.sql (Growth G2 H1: household_joined)
related:
  - wiki/concepts/forward-planning/growth-loops.md
  - wiki/concepts/decisions/adr-015-object-urls-and-inbound-links.md
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/migrations.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-009-not-interested-rename.md
---

# Event Taxonomy

Every event Videx emits, where it goes, and what payload it carries. Destinations: the immutable `user_interactions` log (recommendation signals), a separate analytics path (onboarding funnel), `card_impressions` (impressions), `notification_deliveries` (sent pushes) and, from Growth S2, `growth_events` (growth-loop attribution, Worker-written).

## Onboarding events

Source: `lib/analytics/events.ts`. Logged via `lib/analytics/logger.ts` to a Supabase analytics table (separate from `user_interactions`).

| Event | Metadata |
|---|---|
| `onboarding_started` | `{}` |
| `services_completed` | `{ service_count, services }` |
| `clusters_completed` | `{ cluster_count, clusters }` |
| `quiz_started` | `{}` |
| `quiz_completed` | `{ duration_seconds }` |
| `quiz_skipped` | `{ questions_answered }` |
| `onboarding_completed` | `{ total_duration_seconds }` |
| `first_home_view` | `{ has_taste_vector, section_count, via?, src? }` — `via` / `src` are the install's first-touch attribution (native, Growth S2; null when none) |

> ⚠ The `quiz_*` events refer to the legacy v1 quiz subsystem; they remain in the analytics taxonomy but are no longer emitted by v2 onboarding (Phase 3 deleted the quiz). New v2 onboarding events should be added once Step 3 (watched grid) and Step 5 (sliders) finish their analytics scope.

## Recommendation signal events

Source: `lib/storage/interactions.ts`. Written to `user_interactions`. Always include `user_id`, `event_type`, `content_id`, `metadata jsonb`, `session_id`, `source_surface`, `created_at`.

### Explicit (user-initiated)

| `event_type` | When fired | Notable metadata |
|---|---|---|
| `thumbs_up` | Watched-tab rating tap (positive). | `{ rating: 'up' }` |
| `thumbs_down` | Watched-tab rating tap (negative). | `{ rating: 'down' }` |
| `watchlist_add` | "Want to Watch" tap. | `{ from_surface }` |
| `watchlist_remove` | Removed from any list. | `{ from_list: 'want_to_watch' \| 'watched' }` |
| `watched` | Tap on "Mark as Watched". | `{}` |
| `not_interested` | Detail page button (renamed from `dismiss` in Phase 0). | `{}` |
| `report_availability` | "Report incorrect availability" submission. | `{ reported_service, reason }` |
| `share` | Share action on the detail page (native RN `Share`). H0 Stream B. Kept after Growth S4 for the ranking-side history; titles only, written when the sheet reports a share. | `{ shared_url, to_surface }` |

> ⚠ **`share` is a growth-analytics signal, NOT a ranking signal.** Added to the `user_interactions.event_type` CHECK in migration 058, and to `InteractionEventType` + `emitShare` in `lib/storage/interactions.ts`. It is deliberately absent from `INTERACTION_WEIGHTS` / `TASTE_RELEVANT_EVENTS` — a share moves no taste vector. `shared_url` is the Worker title-page smart link (`/t/:type/:tmdbId`); `to_surface` is the iOS share-target activity type when the OS reports it (null on Android).

> ⚠ **Phase 5 (migration 037) dropped `marked_watched` from the `user_interactions.event_type` CHECK constraint.** It was carried alongside `watched` for forward-compat in migration 013 but never emitted at runtime — `emitContentInteraction` only takes `'watched'`. The `marked_watched` token survives as a canonical `exit_reason` payload value inside `dwell_event` metadata (Detail Page Signal Capture Spec v0.3.2 line 237) — that stays.
>
> **Latent bug fix:** Phase 5 also renamed `INTERACTION_WEIGHTS['marked_watched']` → `INTERACTION_WEIGHTS['watched']` in `taste-v2/types.ts`. The map was keyed on the legacy name, but `emitContentInteraction` writes `'watched'` to the DB — so per-click incremental updates were silently no-op'ing on every "Mark as watched" click since Phase 3. Vectors rebase on the next 24h taste-recompute cycle (`recomputeFromInteractions` reads historical events).

### Silent (behaviour-derived)

| `event_type` | When fired | Notable metadata |
|---|---|---|
| `detail_view` | Detail page mounted with content. | `{ source_surface, position, media_type }` |
| `dwell_event` | Detail page exit (any reason). | `{ dwell_seconds, exit_reason, session_negative_accumulator, deep_link_confidence? }` |
| `deep_link_click` | Streaming service pill tap on detail page. | `{ service_id, confidence: 'high' \| 'low' }` |
| `section_expanded` | Lazy genre section expanded. | `{ section_key }` |
| `cast_carousel_scroll` | Scroll past N positions in cast carousel. | `{ depth }` |
| `back_navigation_speed` | Computed at exit if dwell < threshold. | `{ ms_to_back }` |

`exit_reason` ∈ `back_to_previous`, `deep_link_click`, `watchlist_add`, `thumbs_up`, `thumbs_down`, `app_backgrounded`, `navigated_other`.

## Impression events (separate table)

Written to `card_impressions` (partitioned monthly by pg_partman), batched client-side and flushed in groups (10s timer / 100 events / app lifecycle / tab change / detail page entry / unmount).

| Field | Description |
|---|---|
| `user_id` | FK to `auth.users`. |
| `content_id` | TMDb ID. (post v1.6.1 rename from `tmdb_id`) |
| `surface` | One of `home`, `for_you`, `browse`, `watchlist`, `calendar`, `mood_room`. |
| `position` | Card index within row (0-based). |
| `session_id` | Same UUID as `user_interactions.session_id`. |
| `shown_at` | Timestamp. |

## Notification deliveries (separate table)

Sent pushes are logged to `notification_deliveries` (migration 057; nudge columns 095), NOT `user_interactions`. It is a dedup + cap ledger written only by the `send-notifications` and `send-nudges` Edge Functions (service_role), read-own by the user. See [notifications-v1](../../concepts/architecture/notifications-v1.md).

| Field | Description |
|---|---|
| `user_id`, `notification_type` | `arrival` \| `leaving_soon` \| `household_nudge` (095). |
| `tmdb_id`, `media_type` | The title alerted about (title alerts only; null on a nudge). |
| `list_id`, `nudge_window` | Nudges only (095): the shared list, and the UTC hour it was claimed in. |
| `push_id` | One uuid per push, shared by every row of a bundle (095, IN-GR-026). |
| `sent_at` | Drives the caps: one push per cap group (`titles`, `household`) per 20h, 3 per 24h across groups (`_shared/pushPolicy.ts`). |
| `expo_ticket_id`, `push_token_id`, `delivery_status` | Expo receipt polling → dead-token pruning. |

`UNIQUE (user_id, notification_type, tmdb_id, media_type)` = the "never notify twice for the same arrival" guarantee. `UNIQUE (user_id, notification_type, list_id, nudge_window)` (095) = one nudge per person, list and hour. Neither is partial (PostgREST upserts cannot target a partial index); NULLs are distinct, so each only matches its own type.

## Growth events (separate table)

`growth_events` (migration 090, Growth S2; plan D10) holds the growth loops' measures: shares per WAU, preview open rate, open-to-install, sign-up by source. **Written only by the videx-api Worker** with the service role (RLS on, no policies, anon/authenticated revoked); 12-month retention (pg_cron `growth_events_retention`, 03:30 UTC). Queries: `supabase/queries/growth-dashboard.sql`. Contract: `src/lib/growth/growthEvents.ts` (shared by the app emitter and the Worker validator).

| `event_name` | Written by | When | Notable fields |
|---|---|---|---|
| `preview_fetched` | Worker page handler (`/t/`, `/room/`, `/list/` since G2 H3) | a crawler (chat unfurl, search bot) GETs a page, 200 only, cache hits included | `ua_class = crawler`, `metadata.agent` (`whatsapp`, `imessage`, `slack`…), `platform` = UA bucket, object, via/src from the query |
| `preview_opened` | Worker page handler | a person GETs the page | `ua_class = human`, same fields. On `/list/` the object is `{type: 'list', id}` (`object_type = 'list'`, no migration); the invite token is never recorded. |
| `link_opened` | app → `POST /v1/growth/events` (`+native-intent.tsx`) | an object link (title/room/list) reaches the app, pre-auth included | object, via, src; `user_id` if signed in |
| `first_open` | app (`_layout.tsx` → `runFirstLaunchAttribution`) | once per install id | first-touch via/src/object; `metadata.touch` (`link` \| `install_referrer` \| null), `metadata.prior_install` |
| `signup_completed` | app (`curating.tsx`) | end of onboarding, beside `first_home_view` | first-touch via/src/object; `metadata.touch`; `user_id` |
| `share_initiated` | app (`ShareButton.tsx` `runShare`, Growth S4) | the share sheet opens (title, room screen, room card; a room card after its snapshot POST succeeds; a shared list, G2 H2, after an owner's `create_invite`) | object, `via=share` (`via=household` and object `list` for a shared list), `src` = session origin; `metadata.surface` (`detail` \| `room` \| `room_card` \| `list`), `metadata.moment` (`arrival` \| `leaving_soon`) when shared from "Tell someone" |
| `share_completed` | app (same) | the OS reports `sharedAction` | same as initiated plus `metadata.to_surface` (iOS activity type, else null) and `metadata.platform_reports_completion` (true on iOS only: Android reports a dismissed sheet as shared) |
| `notification_opened` | app (`providers/notifications.tsx`, warm and cold taps, once per notification id; pure half `src/lib/notifications/pushTap.ts`) | a push tap | `delivery_id` (single-title push or household nudge; null for bundles and pre-S4 pushes), object from the payload URL (title, `{type: 'list', id}` for a nudge, null for bundles), `via=push`, `src=push`, `metadata.type` (`arrival` \| `leaving_soon` \| `bundle` \| `household_nudge`), `metadata.push_id` (pushes sent after 095), `metadata.kind = 'household_nudge'` on a nudge (plan D13). **Since G2 H4 the Worker requires a verified JWT (401) and, with a `delivery_id`, that the delivery is the caller's (403) (IN-GR-041).** |
| `household_joined` | app: `native/src/app/list/[id].tsx` (G2 H2) | the list screen's `join_household(token)` for a `?invite=` link returns `already_member = false` (a replay by an existing member emits nothing) | object `list` (the shared `watchlists` uuid, required), `via=household` when the join came from an invite link, `metadata.household_id`. Added to the CHECK by migration 093 and to `GROWTH_EVENT_NAMES` / `CLIENT_EVENT_NAMES` / `OBJECT_REQUIRED_EVENTS` (D13: the one new name; the loop's other events reuse existing names with object type `list`) |

Columns: `id`, `occurred_at`, `event_name`, `install_id` (app-minted UUID, null on page events), `user_id` (from the verified JWT only; never from the body), `via`, `src`, `object_type`, `object_id`, `platform`, `ua_class`, `delivery_id`, `metadata` (≤ 2 KB on ingest).

- **`via`** = URL channel (`share` · `push` · `seo` · `card` · `household`); **`src`** = session a share started in (`push` · `organic`). ADR-015 contract; out-of-contract values are dropped to null, never stored.
- **`ua_class`** = `crawler` | `human` from `workers/api/src/uaClass.ts` (named preview fetchers, headless browsers, generic bots/tools, empty UA → crawler). The raw UA and IP are never stored.
- **Install id** — `native/src/installId.ts`, MMKV `videx` key `install_id`; not cleared on sign-out. **First touch** — `native/src/attribution.ts` (`first_touch`), written once: an inbound link, else on Android the Play Install Referrer (`t=` / `r=` in the referrer also becomes the pending link). An install that already held a Supabase session when the id was minted is an update (`prior_install`), excluded from the funnel.
- **Deletion/export** — `delete_own_account` / `export_user_data` (v1.3) cover the account's rows and every row of any install it used.
- **Session origin** (S4, `src/lib/instrumentation/sessionOrigin.ts`): a push tap marks the in-memory session as push-originated until `sessionId`'s reset (5 minutes backgrounded). Every share in that session carries `src=push` on both events and in the URL (`&src=push`).
- **Device-verified 2026-09-16..17 (Growth S5):** every `event_name` above was produced on a real phone with the documented fields: crawler agents `whatsapp`, `imessage`, `slack` on `preview_fetched`; `first_open` once per install (`touch` `link` on iOS, `install_referrer` on a Play install); `signup_completed` and `first_home_view` carrying `via=share` from the referrer; `share_completed` `platform_reports_completion` true with an activity type on iOS, false with null `to_surface` on Android; `notification_opened` with `delivery_id` for single-title pushes and null for bundles. Evidence: `docs/v2/phase-summaries/evidence/growth-s5-growth-events.md`. Note that account deletion removes the rows of every install the account used (IN-GR-009), which deleted the iPhone test trail in S5.
- Shares per WAU (`growth-dashboard.sql` §1) read `share_initiated` since S4; the `user_interactions.share` source is kept commented for the transition. §6 has iOS completion, push vs organic share rate, notification CTR on `push_id` or `delivery_id` (G2 H4: bundles and nudges joined, a two-device tap counts once), and "Tell someone" take-up. §7 (G2 H4) is the household loop: households per 100 sign-ups, members per household, households with two or more members active in 30 days, adds per household per week, nudge-to-open (`metadata.kind = 'household_nudge'`).

## Source surfaces

Canonical values for `source_surface`:

`home`, `for_you`, `browse`, `search`, `watchlist`, `calendar`, `mood_room`, `more_like_this`, `featured_hero`.

## Session ID semantics

- Generated client-side (UUID v4) on app launch.
- Persists across navigations within an app session.
- Resets after 5 minutes of background time. The `dwell_event` is tagged with the session ID captured at `startDwell()` time, **not** at emit time, so a 5+ minute background mid-dwell still emits with the original session ID.

## Confidence tagging

`deep_link_click` and `dwell_event.deep_link_confidence` carry `'high'` or `'low'`:

- `high` — `AppLauncher.openUrl()` resolved the primary intent (the streaming app opened).
- `low` — fell back to a browser URL (the app was not installed or the deep link failed).

This lets ranking down-weight clicks that did not actually reach the destination app.
