---
title: "Client-side cache never written due to early return in map/filter chain"
category: logic-errors
date: 2026-03-21
tags: [supabase, caching, dead-code, streaming-links, detail-page, performance]
---

## Problem

`getStreamingLinks()` in `src/lib/api/supabaseContent.ts` was making a fresh Supabase network request on every detail page visit, even for previously viewed titles. The 24-hour client-side cache (`sa_` prefix via `cache.ts`) was configured but never actually written to.

## Root Cause

The `.map().filter()` chain returned directly via an implicit `return`, making the subsequent `setCachedData` call and `return result` unreachable dead code:

```typescript
// BUG: This returns immediately — lines after it never execute
return data
  .map((row) => ({ ... }))
  .filter((link) => !!link.serviceId);

// DEAD CODE — never reached
if (result.length > 0) await setCachedData(cacheKey, result);
return result;
```

The variable `result` was never declared — if this code were somehow reached, it would throw a `ReferenceError`.

## Solution

Assign the mapped/filtered array to a variable, then cache and return it:

```typescript
const result = data
  .map((row) => ({ ... }))
  .filter((link) => !!link.serviceId);

if (result.length > 0) await setCachedData(cacheKey, result);
return result;
```

## Prevention

- When adding caching to a function that already has a `return` statement, always verify the new cache write is reachable.
- A linter rule for unreachable code (`no-unreachable` in ESLint) would have caught this — the lines after `return` are dead by definition.
- Consider adding a simple integration test: call `getStreamingLinks()` twice for the same title and assert the second call doesn't hit Supabase (mock the client, verify no query on second call).
