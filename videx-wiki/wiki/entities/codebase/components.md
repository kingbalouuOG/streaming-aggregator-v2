---
title: Component Inventory
type: entity
tags: [components, react, frontend]
created: 2026-04-26
updated: 2026-09-18
sources:
  - raw/codebase-snapshots/component-inventory.md
related:
  - wiki/entities/codebase/module-map.md
  - wiki/entities/codebase/hooks.md
  - wiki/concepts/architecture/two-surface-architecture.md
---

# Component Inventory

Every React component in `src/components/`, grouped by role.

## Screens

| Component | Route / context | Notes |
|---|---|---|
| `OnboardingFlow` | First-run, post-signup | 5 steps: account, services, watched grid (3 rounds × 6 titles), clusters (16 archetypes), sliders. State machine. |
| `ForYouPage` | Bottom nav `for-you` | Personalised surface; slider tray entry point. |
| `BrowsePage` | Bottom nav `browse` | Search + filter + 2-column poster grid. |
| `DetailPage` | Pushed from any card tap | Primary signal-capture surface. Hero, ratings, availability, deep-link pills, cast, More Like This, Not Interested. |
| `WatchlistPage` | Bottom nav `watchlist` | Want to Watch / Watched tabs with thumbs rating. |
| `ProfilePage` | Bottom nav `profile` | Settings, services, account deletion, sign out. |
| `CalendarPage` | Pushed from Profile or Coming Soon row | Date pills + service filter. |
| `SpendDashboard` | Pushed from Profile | Monthly spend tracker; tier selection per service. |
| `MoodRoomPage` | Pushed from `MoodRoomCard` | Single-room detail. |

## Auth screens (`components/auth/`)

`AuthScreen` (view router with slide transitions), `SignInScreen`, `SignUpScreen` (username uniqueness check), `ForgotPasswordScreen`, `ResetPasswordScreen`, `SignUpSuccess` (auto-advancing interstitial), `NoConnectionScreen`.

## Surface composition pieces

| Component | Used by |
|---|---|
| `FeaturedHero` | Top of Home; auto-rotating, swipeable carousel of 3-5 cards. |
| `LazyGenreSection` | Genre rows below the fold; lazy-loaded via IntersectionObserver. |
| `MoodRoomsRow` | For You row hosting horizontal mood room cards. |
| `MoodRoomCard` | Individual mood room cell. |
| `ContentRow` | Generic horizontal scroll row with cards. |
| `CategoryFilter` | Pill bar (All / Movies / TV Shows). |
| `ComingSoonCard` | Date-badged upcoming release card. |

## Card primitives

| Component | Variant |
|---|---|
| `ContentCard` | Default poster card. Used in rows and grids. Defines `ContentItem` interface. |
| `BrowseCard` | Grid variant for `BrowsePage`. |
| `ServiceBadge` | Platform pill / logo badge. |
| `ImageSkeleton` | Loading placeholder. |

## Sheets and modals

`SliderTray` (For You bottom sheet for ranking tuning), `FilterSheet` (Browse filter button), `ReportSheet` (Detail page "Report" action).

## Infrastructure

| Component | Role |
|---|---|
| `App` | Root shell, route state, providers. |
| `BottomNav` | Tab bar. |
| `AuthContext` | Supabase auth provider; exports `useAuth`. |
| `ThemeContext` | Light/dark/system theme provider. |
| `ErrorBoundary` | Top-level error boundary. |
| `platformLogos.ts` | Platform metadata + logo asset map. |
| `icons.tsx` | Custom SVG icons (`TickIcon`, `EyeIcon`). |

## Household (Growth G2, native)

The household loop's surfaces in the RN app (H2, 2026-09-18). Data flows through the [household hooks](hooks.md#household-hooks-growth-g2-h2) and `src/lib/household/`; the RPC contract is in the [RPC catalogue](rpcs.md#households-growth-g2-migration-093).

| Piece | Where | What |
|---|---|---|
| List screen | `native/src/app/list/[id].tsx` | `/list/{listId}?invite={token}`. Member: header (list name, household, members and titles, tap to Profile → Household), `SharedListView`, Invite (owner) or Share (member) top right. With `?invite=` and a session: `join_household` at once; success clears the pending link and, on a first join, emits `household_joined` and toasts "You're in."; an error shows its copy with Back and keeps the pending link. Signed out: the public preview (H3's `GET /v1/list/:id/preview`, fetched by `src/lib/household/listPreview.ts`) with Join → `/auth`. Not a member, no invite: the preview and "Ask someone in it for an invite link". |
| `SharedListView` | `native/src/components/household/` | A "Tonight?" poster strip (anything with a tonight reaction), then every item newest first. Empty: "Nothing here yet. Add a title from any detail page." Long-press removes (adder or owner, confirm). |
| `SharedListItemRow` | same | Poster, title, "Added by {username}" (you / a former member when `added_by` is null), three reaction toggles with counts, own one highlighted. |
| `AddToHousehold` | same; rendered by `WatchlistActions` | "Add to {household}" under the personal pair (one household), "Add to a shared list" with a picker (several). "On {household}" once added; tapping then opens the list. Same initialising and signed-out guards as the personal add. |
| Watchlist tab picker | `native/src/app/(tabs)/watchlist.tsx` | "Mine" plus one chip per household above the status segments; a household chip renders `SharedListView` inline (sort, view and status controls hide). No household: one quiet row, "Watch together. Create a household and share one list." → Profile → Household. The personal list is unchanged. |
| Profile → Household | `native/src/components/profile/ProfileHousehold.tsx` (`profile/[section]` = `household`; a row on the Profile landing) | Create (name 1 to 40); per household: members (username, role, joined date; Remove for the owner), Invite by link and Revoke invite link (owner), Share the list (member), Leave (confirm; the copy says what happens to your items and reactions, ownership hand-over, or deletion when alone). |
| Share, list arm | `native/src/components/ShareButton.tsx` | `ShareTarget` gains `{ listId, listName, householdName, count, householdId, isOwner }`. Owner: `create_invite` then `https://videxstreaming.com/list/{id}?invite={token}&via=household`; member: the plain list URL with `via=household`. Copy from `buildListShareCopy`: "{household}: {n} titles to pick from together." `share_initiated` / `share_completed` with object `list`, `via=household`, `metadata.surface = list`. |

## Patterns

- Screens mounted by `App.tsx` route state; no router library.
- Bottom sheets use Motion (`motion/react`) with snap-on-drag.
- Lazy loading uses `useIntersectionObserver` with a 200px rootMargin.
- All cards accept a `source_surface` prop forwarded into instrumentation calls.
- Skeletons aspect-ratio matched to prevent layout shift.
