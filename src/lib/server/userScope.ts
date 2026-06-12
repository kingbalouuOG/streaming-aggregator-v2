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
 * Write verbs (PLAT-3 W5, closing the IN-466 follow-up): the nightly
 * stale-recompute cron writes taste_profiles + user_interest_centroids.
 * `update`/`upsert`/`deleteWhere` enforce the user_id scoping the same
 * way `select` does — upsert INJECTS user_id into every row, update and
 * deleteWhere pre-apply the filter. Callers still never reach past the
 * wrapper to `client.from()` for user-owned tables.
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
  /** Scoped upsert: user_id is INJECTED into every row (a row that
   *  tried to carry someone else's user_id gets overwritten). */
  upsert: (
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string },
  ) => PromiseLike<ScopedResult>;
  /** Scoped update: applies .eq('user_id', userId); chain further
   *  filters on the returned query. */
  update: (table: string, values: Record<string, unknown>) => ScopedQuery;
  /** Scoped delete: applies .eq('user_id', userId); chain further
   *  filters (e.g. .gte('slot', k)) on the returned query. */
  deleteWhere: (table: string) => ScopedQuery;
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
    upsert(table, rows, opts) {
      // Invariant (security review LOW-3): a conflict target that omits
      // user_id could match ANOTHER tenant's row under service-role
      // (no RLS) and overwrite it with the injected user_id. Refuse at
      // the wrapper so a future caller can't break the contract.
      if (opts?.onConflict && !opts.onConflict.split(',').map((c) => c.trim()).includes('user_id')) {
        throw new Error(
          `UserScope.upsert(${table}): onConflict must include user_id (got "${opts.onConflict}")`,
        );
      }
      const withUser = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
        ...r,
        user_id: userId,
      }));
      return client
        .from(table)
        .upsert(withUser, opts) as unknown as PromiseLike<ScopedResult>;
    },
    update(table, values) {
      return client
        .from(table)
        .update(values)
        .eq('user_id', userId) as unknown as ScopedQuery;
    },
    deleteWhere(table) {
      return client
        .from(table)
        .delete()
        .eq('user_id', userId) as unknown as ScopedQuery;
    },
  };
}
