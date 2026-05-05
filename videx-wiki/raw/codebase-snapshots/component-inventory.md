---
title: Component Inventory
generated: 2026-04-26
source: src/components/
---

# Component Inventory

Every React component in `src/components/`. Grouped by role.

## Screens

| Component | Route / context | Notes |
|---|---|---|
| `OnboardingFlow` | First-run, post-signup. | 5 steps: account, services, watched grid (3 rounds × 6 titles), clusters (16 archetypes), sliders. State machine. |
| `ForYouPage` | Bottom nav `for-you`. | Personalised surface; slider tray entry point. |
| `BrowsePage` | Bottom nav `browse`. | Search + filter + 2-column poster grid. |
| `DetailPage` | Pushed from any card tap. | Primary signal-capture surface. Hero, ratings, availability, deep-link pills, cast, More Like This, Not Interested. |
| `WatchlistPage` | Bottom nav `watchlist`. | Want to Watch / Watched tabs with thumbs rating. |
| `ProfilePage` | Bottom nav `profile`. | Settings, services, account deletion, sign out. |
| `CalendarPage` | Pushed from Profile or Coming Soon row. | Date pills + service filter. |
| `SpendDashboard` | Pushed from Profile. | Monthly spend tracker; tier selection per service. |
| `MoodRoomPage` | Pushed from `MoodRoomCard`. | Single-room detail. |

## Auth screens (`components/auth/`)

| Component | Purpose |
|---|---|
| `AuthScreen` | View router with slide transitions. |
| `SignInScreen` | Email/password sign-in. |
| `SignUpScreen` | Registration with username uniqueness check. |
| `ForgotPasswordScreen` | Send reset email. |
| `ResetPasswordScreen` | Set new password from recovery link. |
| `SignUpSuccess` | Auto-advancing interstitial. |
| `NoConnectionScreen` | Offline state for authed users. |

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

| Component | Trigger |
|---|---|
| `SliderTray` | For You bottom sheet for ranking tuning. |
| `FilterSheet` | Browse filter button. |
| `ReportSheet` | Detail page "Report" action. |

## Infrastructure

| Component | Role |
|---|---|
| `App` | Root shell, route state, providers. |
| `BottomNav` | Tab bar. |
| `AuthContext` | Supabase auth provider; exports `useAuth`. |
| `ThemeContext` | Light/dark/system theme provider. |
| `ErrorBoundary` | Top-level error boundary; surfaces errors to debug log. |
| `platformLogos.ts` | Platform metadata + logo asset map. |
| `icons.tsx` | Custom SVG icons (`TickIcon`, `EyeIcon`). |

## Patterns

- Screens are mounted by `App.tsx` route state; no router library.
- Bottom sheets use Motion (`motion/react`) with snap-on-drag.
- Lazy loading uses `useIntersectionObserver` with a 200px rootMargin.
- All cards accept a `source_surface` prop forwarded into instrumentation calls.
- Skeletons are aspect-ratio matched to prevent layout shift.
