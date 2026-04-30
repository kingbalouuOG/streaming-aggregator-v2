---
title: Motion Animation Patterns
generated: 2026-04-26
---

# Motion Animation Patterns

`motion/react` (formerly Framer Motion) handles all non-trivial animation. Conventions used in Videx.

## When to use Motion vs Tailwind transitions

- Tailwind transitions: hover, focus, simple opacity/transform on state change.
- Motion: anything with multiple coordinated properties, list animations, gestures, springs, page transitions.

## Component patterns

### Bottom sheets

`SliderTray`, `FilterSheet`, `ReportSheet` use `motion.div` with `drag="y"` constrained to a snap range. Spring config:

```ts
{ type: "spring", damping: 30, stiffness: 300 }
```

Snap points: closed (full off-screen), peek (visible thumb), full. Handle drag end by computing nearest snap.

### Hero carousel

`FeaturedHero` uses `AnimatePresence` with `mode="wait"` to swap cards. Auto-advance every 6 seconds; user gesture pauses for 12 seconds.

### Page transitions

Auth screens (`SignIn`, `SignUp`, `ForgotPassword`, `ResetPassword`) slide in from the right via `AuthScreen` view router. Spring with low damping for a soft feel.

### Card press

Cards scale to `0.97` on press (`whileTap`) with a quick spring. Restores on release. No bounce.

### Skeleton-to-content

`ImageSkeleton` fades out as image loads. Use `AnimatePresence` to keep skeleton mounted until the image's `onLoad` fires.

## Easing and durations

- Default duration: 200-300ms for UI affordances.
- Spring is preferred for any drag-based motion.
- Linear for opacity-only fades.
- `ease-out` for entering, `ease-in` for exiting.

## Performance budget

- Animate `transform` and `opacity` only. Never animate `width`, `height`, `top`, `left` for interactive transitions.
- Avoid layout-thrashing `layoutId` on lists longer than 20 items.
- Reduced motion: respect `prefers-reduced-motion`. Use Motion's `useReducedMotion` hook to swap animations for instant transitions.

## Reusable conventions

```ts
// Stable spring used across the app
const springSnappy = { type: "spring", damping: 30, stiffness: 300 } as const;

// Page slide
const slideRightToLeft = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: '-100%', opacity: 0 },
  transition: springSnappy,
};
```

Define these in a shared module (proposed: `src/lib/motion/presets.ts`) once they recur.
