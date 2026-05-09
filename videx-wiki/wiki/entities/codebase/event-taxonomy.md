---
title: Event Taxonomy
type: entity
tags: [events, instrumentation, signals, analytics]
created: 2026-04-26
updated: 2026-05-07
sources:
  - raw/codebase-snapshots/event-taxonomy.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - docs/v2/phase-summaries/phase-5-summary.md
related:
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/migrations.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-009-not-interested-rename.md
---

# Event Taxonomy

Every event Videx emits, where it goes, and what payload it carries. Two destinations: the immutable `user_interactions` log (recommendation signals) and a separate analytics path (onboarding funnel). Impressions go to `card_impressions`.

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
| `first_home_view` | `{ has_taste_vector, section_count }` |

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
