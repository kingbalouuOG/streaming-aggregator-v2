---
title: "Numeric 0 rendered as text when guarded with `&&` instead of explicit comparison"
category: logic-errors
date: 2026-04-30
tags: [react, jsx, conditional-rendering, ratings, content-card, browse-card, detail-page]
---

## Problem

Title cards displayed a stray "0" above the title for content with no IMDb rating (e.g. brand-new releases where TMDb/OMDb hasn't returned a rating yet). The detail page also showed a "0.0 IMDb" badge for the same titles.

## Root Cause

Guards of the form `{item.rating && (...)}` short-circuit when the left operand is falsy — but `&&` returns the operand itself, not `false`. When `item.rating === 0`, the expression evaluates to `0`, and React renders `0` as the text node "0". `false`, `null`, `undefined`, and `true` are not rendered, but numeric `0` is.

```tsx
// BUG: renders the digit "0" when item.rating === 0
{item.rating && (
  <div>
    <span>★</span>
    <span>{item.rating.toFixed(1)}</span>
  </div>
)}
```

The detail page had a different shape of the same bug — no guard at all, so `detail.imdbRating.toFixed(1)` produced "0.0" and rendered the badge unconditionally.

## Solution

Use an explicit positivity check so the expression evaluates to `false` (which React skips) rather than `0`:

```tsx
{item.rating != null && item.rating > 0 && (
  <div>...</div>
)}
```

Fixed in three places:
- `src/components/ContentCard.tsx`
- `src/components/BrowseCard.tsx`
- `src/components/DetailPage.tsx` (added the missing guard around the IMDb badge, matching the existing `detail.rottenTomatoes > 0` pattern)

## Prevention

- For numeric values, never gate JSX with `{value && ...}`. Use `{value > 0 && ...}` or `{value != null && ...}`.
- For booleans, `&&` is fine.
- For arrays, `arr.length > 0 && ...` (not `arr.length && ...`) for the same reason.
- ESLint rule `react/jsx-no-leaked-render` catches this class of bug; consider enabling.
