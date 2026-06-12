/**
 * User-scoping primitives for SERVER runtimes (PLAT-3).
 *
 * Ported from supabase/functions/_shared/userScope.ts (IN-466) as part
 * of dissolving the ADR-011 mirror: the videx-api Worker imports this
 * directly, and the scoped data-access variants in the engine tree
 * (`*Scoped` functions in recommendations-v2 / taste-v2) type against
 * it. Nothing under src/lib/server/ is imported by client code, so none
 * of it enters the Vite bundle.
 *
 * Differences from the Edge original:
 * - `createServiceRoleClient(url, key)` takes env explicitly — Workers
 *   read secrets from the Hono context's env binding, not Deno.env.
 * - JWT handling is NOT here. The Edge gateway verified tokens before
 *   the function ran, so the original only decoded claims. The Worker
 *   has no gateway in front of it — it must VERIFY the JWT itself
 *   (workers/api/src/auth.ts, W2) before constructing a scope.
 * - `scope.select()` returns a hand-rolled `ScopedQuery` interface
 *   instead of PostgrestFilterBuilder. The Edge original used `any`
 *   generics for dynamic table names; src/ lints `no-explicit-any` as
 *   an error, and postgrest-js v2's seven-generic builder fails
 *   inference on untyped dynamic tables (TS2589). ScopedQuery models
 *   exactly the chain surface the engine's scoped functions use.
 *
 * The contract is unchanged: service-role bypasses RLS (the auth-spike
 * measured ~80ms/query RLS overhead — too much for the latency budget),
 * so every user-scoped query MUST go through `scope.select(table,
 * cols)`, which applies `.eq('user_id', userId)` automatically. Tables
 * without a user_id column (titles, streaming_availability,
 * mood_room_anchor_labels) use the raw client directly.
 *
 * TODO(IN-466 follow-up, carried): if a server route ever needs to
 * WRITE to user-owned tables, add scoped `insert/update/delete` verbs
 * here rather than letting callers reach past the wrapper.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface ScopedResult {
  data: unknown;
  error: { message: string } | null;
  count: number | null;
}

/**
 * The chainable query surface a scoped select exposes. Structural
 * subset of PostgrestFilterBuilder — extend it here if a scoped
 * function needs another verb, rather than reaching for the raw client.
 */
export interface ScopedQuery extends PromiseLike<ScopedResult> {
  eq(column: string, value: unknown): ScopedQuery;
  neq(column: string, value: unknown): ScopedQuery;
  in(column: string, values: readonly unknown[]): ScopedQuery;
  gte(column: string, value: unknown): ScopedQuery;
  lte(column: string, value: unknown): ScopedQuery;
  not(column: string, operator: string, value: unknown): ScopedQuery;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): ScopedQuery;
  limit(count: number): ScopedQuery;
  maybeSingle(): PromiseLike<ScopedResult>;
  single(): PromiseLike<ScopedResult>;
}

export function createServiceRoleClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface UserScope {
  userId: string;
  /** Pre-scoped select: applies .eq('user_id', userId) automatically. */
  select: (table: string, columns: string) => ScopedQuery;
  /** Pre-scoped count-head: applies .eq('user_id', userId) automatically. */
  countHead: (table: string) => ScopedQuery;
}

export function withUserScope(client: SupabaseClient, userId: string): UserScope {
  return {
    userId,
    select(table, columns) {
      return client
        .from(table)
        .select(columns)
        .eq('user_id', userId) as unknown as ScopedQuery;
    },
    countHead(table) {
      return client
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId) as unknown as ScopedQuery;
    },
  };
}
