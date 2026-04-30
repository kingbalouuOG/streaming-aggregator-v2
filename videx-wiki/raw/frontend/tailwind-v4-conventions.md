---
title: Tailwind v4 Conventions
generated: 2026-04-26
sources: [src/index.css, eslint.config.mjs]
---

# Tailwind v4 Conventions

Videx uses Tailwind CSS v4 (alpha line). Setup differs from v3; this page captures the conventions in use.

## Setup

- Single `src/index.css` includes:
  - `@import "tailwindcss";`
  - `@theme { ... }` block defining custom tokens (colours, spacing, typography).
  - Custom utility layers below.
- No `tailwind.config.js`. v4 config lives in CSS via the `@theme` block.

## Custom tokens

Defined in `@theme` and consumed via the same utility class names:

```css
@theme {
  --color-brand-primary: #...;
  --color-bg-base: #...;
  --color-bg-surface: #...;
  --font-family-display: 'Inter Display', system-ui, sans-serif;
}
```

Use as `bg-brand-primary`, `font-display`, etc. Same class semantics as v3.

## Theme switching (light/dark)

`ThemeContext` toggles a `data-theme` attribute on `<html>`. CSS uses `:where([data-theme="dark"]) &` selectors inside `@theme` overrides. No `dark:` Tailwind variant; semantic tokens swap values.

## Conventions

- **Spacing:** stick to the default 4px scale. No magic values.
- **Colour:** use semantic tokens (`bg-surface`, `text-muted`) over raw colour utilities. Reserve raw colour for ad-hoc one-offs.
- **Components:** prefer composition of utility classes over `@apply`. Use `@apply` only when a single class is needed for a third-party integration.
- **Responsive:** mobile-first. `sm:`, `md:` apply only above the breakpoint. Most components stay single-breakpoint because Videx is mobile-first.
- **Animation:** prefer Motion (`motion/react`) for any non-trivial transition. Use Tailwind transitions for simple hover/active states only.
- **No arbitrary values without reason.** `w-[372px]` is a smell unless tied to a fixed asset.

## Class ordering

ESLint Tailwind plugin enforces canonical order: layout → spacing → sizing → typography → backgrounds → borders → effects. Run `npm run lint` to fix.

## Avoid

- Inline styles unless setting a dynamic value (e.g. `style={{ width: pct + '%' }}`).
- `important` modifier (`!`) — usually points to a specificity bug.
- Mixing Tailwind classes with separate CSS files for the same component.
