---
title: Solution — Numeric 0 rendered as text under `&&` guard
type: concept
tags: [solution, post-mortem, react, jsx, conditional-rendering, ratings]
created: 2026-04-30
updated: 2026-04-30
sources:
  - docs/solutions/logic-errors/react-numeric-falsy-renders-zero.md
related:
  - wiki/entities/codebase/components.md
---

# Solution — Numeric 0 rendered as text under `&&` guard

Date: 2026-04-30. Category: logic-errors.

## Problem

Title cards (ContentCard, BrowseCard) showed a stray "0" above the title when `item.rating === 0` (titles with no IMDb rating yet). DetailPage rendered a "0.0 IMDb" badge for the same titles.

## Root cause

`{item.rating && (...)}` returns the left operand when falsy. Numeric `0` is falsy, so the expression evaluates to `0`, and React renders `0` as a text node. `false`/`null`/`undefined`/`true` are skipped, but `0` is not.

DetailPage variant: no guard at all — `detail.imdbRating.toFixed(1)` produced "0.0" unconditionally.

## Solution

Use an explicit positivity check so the expression evaluates to `false`:

```tsx
{item.rating != null && item.rating > 0 && (...)}
```

Fixed in three places:
- `src/components/ContentCard.tsx`
- `src/components/BrowseCard.tsx`
- `src/components/DetailPage.tsx` (added missing guard, matching existing `detail.rottenTomatoes > 0` pattern)

## Prevention

- For numerics, never use `{value && ...}`; use `{value > 0 && ...}` or `{value != null && ...}`.
- For arrays, `arr.length > 0 && ...` (not `arr.length && ...`).
- ESLint `react/jsx-no-leaked-render` catches this class of bug.
