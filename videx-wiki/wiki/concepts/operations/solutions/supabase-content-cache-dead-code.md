---
title: Solution — Client-side cache never written (dead code)
type: concept
tags: [solution, post-mortem, caching, supabase, dead-code]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/solutions/supabase-content-cache-dead-code.md
related:
  - wiki/entities/codebase/module-map.md
---

# Solution — Client-side cache never written (dead code)

Date: 2026-03-21. Category: logic-errors.

## Problem

`getStreamingLinks()` in `src/lib/api/supabaseContent.ts` was making a fresh Supabase request on every detail page visit, even for previously viewed titles. The 24-hour client-side cache (`sa_` prefix via `cache.ts`) was configured but never actually written to.

## Root cause

`.map().filter()` chain returned directly via implicit `return`, making the subsequent `setCachedData` call and `return result` unreachable dead code:

```typescript
// BUG: returns immediately
return data
  .map((row) => ({ ... }))
  .filter((link) => !!link.serviceId);

// DEAD CODE — never reached
if (result.length > 0) await setCachedData(cacheKey, result);
return result;
```

Variable `result` was never declared. If reached, would throw `ReferenceError`.

## Solution

Assign the mapped/filtered array to a variable:

```typescript
const result = data
  .map((row) => ({ ... }))
  .filter((link) => !!link.serviceId);

if (result.length > 0) await setCachedData(cacheKey, result);
return result;
```

## Prevention

- When adding caching to a function with an existing `return`, verify the new cache write is reachable.
- ESLint `no-unreachable` rule catches this; lines after `return` are dead by definition.
- Integration test: call `getStreamingLinks()` twice for the same title and assert second call doesn't hit Supabase (mock client, verify no query on second call).
