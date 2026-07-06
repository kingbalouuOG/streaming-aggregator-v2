/**
 * IN-466 user-scoping primitives for Edge Functions.
 *
 * The render-foryou-rows function (and any future user-scoped Edge Function)
 * uses service-role + manual JWT decode for `auth.uid()` extraction. The
 * auth-spike showed user-JWT-scoped reads cost ~80ms per query in RLS
 * overhead — too much for a 600ms p50 latency budget. Service-role bypasses
 * RLS, so we lose RLS as defence-in-depth: every user-scoped query MUST go
 * through `userScopedSelect()` so a missed `.eq('user_id', uid)` can't leak
 * cross-user data.
 *
 * Pattern:
 *
 *   const userId = await extractUserIdFromJwt(req);
 *   if (!userId) return jsonResponse(401, { error: 'unauthorized' });
 *
 *   const supabase = createServiceRoleClient();
 *   const scope = withUserScope(supabase, userId);
 *
 *   // user-owned data — RLS would have scoped this; we enforce manually:
 *   const { data } = await scope.select('user_interactions', 'id, content_id')
 *     .eq('event_type', 'thumbs_up');
 *
 *   // not user-owned (titles, mood_room_anchor_labels) — use raw client:
 *   const { data } = await supabase.from('titles').select('*');
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function createServiceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Extract auth.uid() from the Authorization Bearer token without a network
 * round trip to Supabase auth. JWT signature verification is intentionally
 * skipped — Supabase's gateway has already verified the token before the
 * function executes (default `verify_jwt: true`). We only need to read the
 * claims.
 *
 * IN-PX-30 defence-in-depth: that "gateway already verified it" contract
 * only holds when the function runs WITH gateway JWT verification. The
 * project reserves the `_no_auth_/` namespace for functions intentionally
 * deployed with `verify_jwt = false` (edge-fn-jwt-guard.yml permits the
 * flag only there). In such a context the `sub` claim is attacker-
 * forgeable, so this helper refuses rather than hand back an unverified
 * identity. If a `_no_auth_/` function genuinely needs the user id, verify
 * the signature first (e.g. `jose.jwtVerify` against `SUPABASE_JWKS`) —
 * deferred until the project rotates off the legacy HS256 secret, which a
 * JWKS-only verify would otherwise reject (see IN-XPS-004).
 */
export function extractUserIdFromJwt(req: Request): string | null {
  // Fail closed if we're running without gateway JWT verification.
  let pathname = '';
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    pathname = req.url ?? '';
  }
  if (pathname.includes('_no_auth_')) {
    throw new Error(
      'extractUserIdFromJwt called from a _no_auth_/ function: the JWT ' +
      'signature is unverified in this context, so `sub` is forgeable. ' +
      'Verify the signature before trusting the user id (IN-PX-30).'
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string {
  const pad = input.length % 4;
  const padded = pad ? input + '='.repeat(4 - pad) : input;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  // atob is global in Deno.
  const binary = atob(base64);
  // JWT payloads are UTF-8; decode bytes through TextDecoder.
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * The user-scope wrapper. Every user-owned table read must go through
 * `scope.select(table, columns)` rather than `client.from(table).select(...)`,
 * which automatically applies `.eq('user_id', userId)`. Refusing to expose
 * the raw `.from()` for user-owned tables is the safety net Cowork
 * prescribed when we picked service-role over JWT-scoped RLS.
 *
 * Tables WITHOUT a user_id column (titles, streaming_availability,
 * mood_room_anchor_labels) use the raw `client` directly.
 *
 * TODO(IN-466 follow-up): if a future Edge Function needs to write to
 * user-owned tables (server-side mark_watched, dismiss, preference
 * writes), add `update`, `insert`, `upsert`, `delete` verbs to this
 * wrapper rather than letting callers reach past it to `client.from()`.
 * Architecture review (2026-04-30) flagged this as the first place the
 * service-role-without-RLS contract will silently degrade.
 */
export interface UserScope {
  userId: string;
  /** Pre-scoped select: applies .eq('user_id', userId) automatically.
   *  Returns a PostgrestFilterBuilder so callers can chain `.in / .gte /
   *  .order / .limit / .maybeSingle` etc. The `any` generics keep the
   *  ergonomics of dynamic table names without Database<> generic. */
  select: (table: string, columns: string) => PostgrestFilterBuilder<any, any, any[]>;
  /** Pre-scoped count-head: applies .eq('user_id', userId) automatically. */
  countHead: (table: string) => PostgrestFilterBuilder<any, any, any[]>;
}

// Type-only import — keeps the Deno bundle slim while giving callers
// proper IntelliSense on the chained query builder methods.
import type { PostgrestFilterBuilder } from 'https://esm.sh/@supabase/postgrest-js@1';

export function withUserScope(client: SupabaseClient, userId: string): UserScope {
  return {
    userId,
    select(table, columns) {
      return (client.from(table) as any).select(columns).eq('user_id', userId);
    },
    countHead(table) {
      return (client.from(table) as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    },
  };
}
