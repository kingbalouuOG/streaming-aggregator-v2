---
title: Event Taxonomy
generated: 2026-04-26
sources: [src/lib/analytics/events.ts, src/lib/storage/interactions.ts, src/lib/instrumentation/, docs/v2/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md]
---

# Event Taxonomy

Every event Videx emits, where it goes, and what payload it carries. Two destinations: the immutable `user_interactions` log (recommendation signals) and a separate analytics path (onboarding funnel).

## Onboarding events

Source: `lib/analytics/events.ts`. Logged via `lib/analytics/logger.ts` to a Supabase analytics table (separate from `user_interactions`).

| Event name | Metadata |
|---|---|
| `onboarding_started` | `{}` |
| `services_completed` | `{ service_count: number, services: string[] }` |
| `clusters_completed` | `{ cluster_count: number, clusters: string[] }` |
| `quiz_started` | `{}` |
| `quiz_completed` | `{ duration_seconds: number }` |
| `quiz_skipped` | `{ questions_answered: number }` |
| `onboarding_completed` | `{ total_duration_seconds: number }` |
| `first_home_view` | `{ has_taste_vector: boolean, section_count: number }` |

## Recommendation signal events

Source: `lib/storage/interactions.ts`. Written to `user_interactions` table. Always include `user_id`, `event_type`, `content_id`, `metadata jsonb`, `session_id`, `source_surface`, `created_at`.

### Explicit (user-initiated)

| `event_type` | When fired | Notable metadata |
|---|---|---|
| `thumbs_up` | Watched-tab rating tap (positive). | `{ rating: 'up' }` |
| `thumbs_down` | Watched-tab rating tap (negative). | `{ rating: 'down' }` |
| `watchlist_add` | "Want to Watch" tap. | `{ from_surface }` |
| `watchlist_remove` | Removed from any list. | `{ from_list: 'want_to_watch' \| 'watched' }` |
| `marked_watched` | Tap on "Mark as Watched". | `{}` |
| `not_interested` | Detail page "Not Interested" button (renamed from `dismiss` in Phase 0). | `{}` |
| `report_availability` | "Report incorrect availability" submission. | `{ reported_service, reason }` |

### Silent (behaviour-derived)

| `event_type` | When fired | Notable metadata |
|---|---|---|
| `detail_view` | Detail page mounted with content. | `{ source_surface, position, media_type }` |
| `dwell_event` | Detail page exit (any reason). | `{ dwell_seconds, exit_reason: 'back_to_previous' \| 'deep_link_click' \| 'watchlist_add' \| 'thumbs_up' \| 'thumbs_down' \| 'app_backgrounded' \| 'navigated_other', session_negative_accumulator, deep_link_confidence?: 'high' \| 'low' }` |
| `deep_link_click` | Streaming service pill tap on detail page. | `{ service_id, confidence: 'high' \| 'low' }` |
| `section_expanded` | Lazy genre section expanded. | `{ section_key }` |
| `cast_carousel_scroll` | Scroll past N positions in cast carousel. | `{ depth }` |
| `back_navigation_speed` | Computed at exit if dwell < threshold. | `{ ms_to_back }` |

### Impression events (separate table)

Written to `card_impressions` (partitioned monthly by pg_partman), not `user_interactions`. Batched client-side and flushed in groups.

| Field | Description |
|---|---|
| `user_id` | FK to `auth.users`. |
| `content_id` | TMDb ID. |
| `surface` | One of `home` \| `for_you` \| `browse` \| `watchlist` \| `calendar` \| `mood_room`. |
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
