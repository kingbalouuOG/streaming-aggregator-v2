---
title: Tailwind v4 conventions
type: concept
tags: [tailwind, css, theme, frontend]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/frontend/tailwind-v4-conventions.md
related:
  - wiki/entities/codebase/module-map.md
  - wiki/entities/codebase/components.md
---

# Tailwind v4 conventions

Videx uses Tailwind CSS v4 (alpha line). Setup differs from v3.

## Setup

- Single `src/index.css` includes:
  - `@import "tailwindcss";`
  - `@theme { ... }` block defining custom tokens (colours, spacing, typography).
  - Custom utility layers below.
- No `tailwind.config.js`. v4 config lives in CSS via `@theme`.

## Custom tokens

Defined in `@theme`, consumed via the same utility class names:

```css
@theme {
  --color-brand-primary: #...;
  --color-bg-base: #...;
  --color-bg-surface: #...;
  --font-family-display: 'Inter Display', system-ui, sans-serif;
}
```

Use as `bg-brand-primary`, `font-display`. Same class semantics as v3.

## Theme switching

`ThemeContext` toggles `data-theme` on `<html>`. CSS uses `:where([data-theme="dark"]) &` selectors inside `@theme` overrides. No `dark:` Tailwind variant; semantic tokens swap values.

## Conventions

- **Spacing**: stick to default 4px scale. No magic values.
- **Colour**: semantic tokens (`bg-surface`, `text-muted`) over raw colour utilities.
- **Components**: prefer composition of utility classes over `@apply`. Use `@apply` only for third-party integration.
- **Responsive**: mobile-first. `sm:`, `md:` apply only above breakpoint.
- **Animation**: prefer Motion (`motion/react`) for non-trivial transitions. Tailwind transitions for simple hover/active states only.
- **No arbitrary values without reason**. `w-[372px]` is a smell unless tied to a fixed asset.

## Class ordering

ESLint Tailwind plugin enforces canonical order: layout → spacing → sizing → typography → backgrounds → borders → effects. `npm run lint` fixes.

## Avoid

- Inline styles unless setting a dynamic value (`style={{ width: pct + '%' }}`).
- `important` modifier (`!`) — usually points to a specificity bug.
- Mixing Tailwind classes with separate CSS files for the same component.

## Phase 3 rebuild

Phase 3 reinstalled `tailwindcss@4.2.2` + `@tailwindcss/vite`. Pre-compiled `index.css` replaced with source file. All Tailwind classes now generated on demand.
