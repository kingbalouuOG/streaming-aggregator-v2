---
title: Accessibility Checklist
generated: 2026-04-26
---

# Accessibility Checklist

Mobile-first accessibility for Videx. Run before promoting any new screen.

## Per-screen checklist

- [ ] Every interactive element has a discernible name (text, `aria-label`, or `aria-labelledby`).
- [ ] Touch targets ≥ 44x44 pt.
- [ ] Colour contrast meets WCAG AA: ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI components.
- [ ] Focus order is logical (test with TalkBack swipe).
- [ ] Focus indicator visible on all focusable elements.
- [ ] No information conveyed by colour alone.
- [ ] Headings nested correctly (`h1` → `h2` → `h3`); skip-level jumps avoided.
- [ ] Form fields have visible labels (placeholders are not labels).
- [ ] Error messages are programmatically associated with their fields.
- [ ] Loading states announced (`aria-live` for non-modal, `aria-busy` on the container).
- [ ] Modals and bottom sheets trap focus; close button reachable; ESC dismisses (web fallback).
- [ ] Animations respect `prefers-reduced-motion`.

## Screen-reader announcements

| Trigger | Announcement |
|---|---|
| Watchlist add | "Added to watchlist." |
| Watchlist remove | "Removed from watchlist." |
| Thumbs up tap | "Rated thumbs up." |
| Mood Room thumbnail load | Skip; redundant with surrounding context. |
| Toast | Use Sonner's `aria-live="polite"`. Avoid `assertive` unless critical. |

## Service badges

`ServiceBadge` shows a logo. Provide text alternative via `aria-label="Available on Netflix"`. Decorative-only logos (e.g. background watermark) get `aria-hidden="true"`.

## Card press feedback

- Visual: `whileTap` scale.
- Haptic: Capacitor `Haptics.impact({ style: 'light' })` on press for primary CTAs only. Respects user system haptic setting.

## Onboarding

- Each step exposes its progress: `aria-label="Step 3 of 5: Pick titles you've watched"`.
- Carousel-style steps support back/forward via swipe AND screen reader gestures.

## Detail page

- Hero image: `alt={title}`.
- Streaming service pills: each has `aria-label="Watch on {service}"`.
- Cast carousel: each cast member's `alt={name}, {role}`.

## Tooling

- ESLint rule `jsx-a11y/*` runs on every commit.
- Manual TalkBack pass before each Phase release.
- `npx playwright test --grep accessibility` for the smoke set (pending — see test harness backlog).

## Known gaps

- Spend Dashboard slider for tier selection: needs accessible alternative input.
- Slider Tray: drag-only sliders without keyboard fallback. Web context not currently primary; revisit pre-web-launch.
