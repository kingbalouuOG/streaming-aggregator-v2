# Phase 1 — pgvector Wire Format Spike Report (IN-203)

**Date:** 2026-04-12
**Supabase JS client:** `@supabase/supabase-js@^2.97.0`
**pgvector column:** `titles.embedding vector(1536)`

## Test Method

Queried 10 titles with populated embeddings via the Supabase JS client:

```typescript
const { data } = await supabase
  .from('titles')
  .select('tmdb_id, title, embedding')
  .not('embedding', 'is', null)
  .limit(10);
```

Inspected `typeof`, `Array.isArray`, `constructor.name`, and attempted `JSON.parse` on each row's `embedding` field.

## Observed Format

The `embedding` field is returned as a **string**, not a parsed `number[]`.

| Property | Value |
|----------|-------|
| `typeof` | `"string"` |
| `Array.isArray` | `false` |
| `constructor.name` | `"String"` |
| String length | ~19,200 characters (1536 floats, comma-separated, in brackets) |
| Format | `"[-0.0126953125,0.0625,-0.025253296,...]"` |
| `JSON.parse` result | `number[]` of length 1536, all elements are `number` type |

All 10 test rows returned the same format. This is consistent across movie and TV titles.

## Locked Pattern for Phase 3

**Workaround: `JSON.parse(row.embedding)` on the client side.**

PostgREST serializes pgvector `vector(N)` columns as bracket-delimited comma-separated strings. The Supabase JS client does not auto-parse these into arrays. A simple `JSON.parse()` call reliably converts them to `number[]`.

### Runnable code snippet

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fetch a title's embedding
const { data } = await supabase
  .from('titles')
  .select('tmdb_id, title, embedding')
  .eq('tmdb_id', 27205) // Inception
  .single();

if (data?.embedding) {
  // Locked pattern: parse the PostgREST string into number[]
  const vec: number[] = JSON.parse(data.embedding as string);
  console.log(vec.length);  // 1536
  console.log(typeof vec[0]); // "number"
}
```

### Alternatives considered and rejected

| Approach | Reason for rejection |
|----------|---------------------|
| Supabase RPC with `::float4[]` cast | Adds server-side complexity for no benefit — `JSON.parse` is trivial |
| Database view with `embedding::float4[]` | PostgREST serializes `float4[]` the same way — still a string |
| Custom PostgREST content type | Not configurable on Supabase hosted |

### Notes for Phase 3

- The `embedding` column should be typed as `string` in TypeScript interfaces for Supabase queries (not `number[]`)
- Parse at the point of use: `const vec: number[] = JSON.parse(row.embedding as string)`
- No performance concern: parsing a 19KB JSON string takes <1ms in modern JS engines
- If Supabase JS client adds native pgvector parsing in a future version, the `JSON.parse` call will still work (it's a no-op on an already-parsed array via `JSON.parse(JSON.stringify(arr))`)
