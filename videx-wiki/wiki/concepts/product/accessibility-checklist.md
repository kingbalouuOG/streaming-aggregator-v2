---
title: Accessibility checklist
type: concept
tags: [accessibility, a11y, wcag, frontend]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/frontend/accessibility-checklist.md
related:
  - wiki/entities/codebase/components.md
  - wiki/concepts/product/tailwind-v4-conventions.md
---

# Accessibility checklist

Mobile-first accessibility for Videx. Run before promoting any new screen.

## Per-screen

- Every interactive element has a discernible name (text, `aria-label`, or `aria-labelledby`).
- Touch targets ≥ 44x44 pt.
- Colour contrast meets WCAG AA: ≥ 4.5:1 body text, ≥ 3:1 large text and UI components.
- Focus order logical (test with TalkBack swipe).
- Focus indicator visible on all focusable elements.
- No information conveyed by colour alone.
- Headings nested correctly (`h1` → `h2` → `h3`).
- Form fields have visible labels (placeholders are not labels).
- Error messages programmatically associated with their fields.
- Loading states announced (`aria-live` for non-modal, `aria-busy` on container).
- Modals and bottom sheets trap focus; close button reachable; ESC dismisses (web fallback).
- Animations respect `prefers-reduced-motion`.

## Screen-reader announcements

| Trigger | Announcement |
|---|---|
| Watchlist add | "Added to watchlist." |
| Watchlist remove | "Removed from watchlist." |
| Thumbs up tap | "Rated thumbs up." |
| Mood Room thumbnail load | Skip; redundant with surrounding context. |
| Toast | Sonner's `aria-live="polite"`. Avoid `assertive` unless critical. |

## Service badges

`ServiceBadge` shows a logo. Text alternative via `aria-label="Available on Netflix"`. Decorative-only logos get `aria-hidden="true"`.

## Onboarding

- Each step exposes progress: `aria-label="Step 3 of 5: Pick titles you've watched"`.
- Carousel-style steps support back/forward via swipe AND screen reader gestures.

## Detail page

- Hero image: `alt={title}`.
- Streaming pills: `aria-label="Watch on {service}"`.
- Cast carousel: `alt={name}, {role}`.

## Tooling

- ESLint `jsx-a11y/*` runs on every commit.
- Manual TalkBack pass before each Phase release.
- `npx playwright test --grep accessibility` for smoke set (pending — see test harness backlog).

## Known gaps

- Spend Dashboard slider for tier selection: needs accessible alternative input.
- SliderTray: drag-only sliders without keyboard fallback. Web context not currently primary; revisit pre-web-launch.
