---
title: Phase 1 — pgvector wire format spike (IN-203)
type: concept
tags: [evaluation, phase-1, pgvector, wire-format, supabase-js]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/evaluations/phase-1-wire-format-spike.md
related:
  - wiki/concepts/operations/phase-1.md
  - wiki/concepts/techniques/embeddings.md
  - wiki/entities/codebase/database-schema.md
---

# Phase 1 — pgvector wire format spike (IN-203)

Date: 2026-04-12. Supabase JS client `^2.97.0`. Column: `titles.embedding vector(1536)`.

## Observed format

PostgREST returns pgvector `vector(N)` columns as **bracket-delimited comma-separated strings**, not parsed `number[]`.

| Property | Value |
|---|---|
| `typeof` | `"string"` |
| `Array.isArray` | `false` |
| String length | ~19,200 chars (1536 floats) |
| Format | `"[-0.0126953125,0.0625,-0.025253296,...]"` |
| `JSON.parse` result | `number[]` length 1536, all `number` type |

All 10 test rows returned the same format. Consistent across movie and TV titles.

## Locked pattern (for Phase 3)

```typescript
const { data } = await supabase
  .from('titles')
  .select('tmdb_id, title, embedding')
  .eq('tmdb_id', 27205) // Inception
  .single();

if (data?.embedding) {
  const vec: number[] = JSON.parse(data.embedding as string);
  // vec.length === 1536
}
```

## Alternatives considered and rejected

| Approach | Why rejected |
|---|---|
| Supabase RPC with `::float4[]` cast | Adds server-side complexity for trivial parse. |
| Database view with `embedding::float4[]` | PostgREST serialises `float4[]` the same way; still string. |
| Custom PostgREST content type | Not configurable on Supabase hosted. |

## Notes for Phase 3

- TypeScript interfaces should type `embedding` as `string`, not `number[]`.
- Parse at point of use.
- Parsing 19KB JSON string takes <1ms on modern engines.
- `JSON.parse` is forward-compatible: a future Supabase JS client that auto-parses will return an array, and `JSON.parse(JSON.stringify(arr))` is a no-op.
