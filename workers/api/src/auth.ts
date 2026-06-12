/**
 * Supabase JWT verification for the videx-api Worker (PLAT-3 W2).
 *
 * The Edge Function this replaces only DECODED the token because
 * Supabase's gateway had already verified it (verify_jwt: true). The
 * Worker has no gateway in front of it, so it verifies properly:
 * ES256 signature against the project's public JWKS (confirmed live:
 * tokens carry alg ES256 + the JWKS kid), plus exp and audience.
 *
 * jose's createRemoteJWKSet handles kid selection, key caching and
 * cooldown-limited refetching internally — the module-scope instance
 * persists per Worker isolate, so warm requests verify without a
 * network round trip.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksOrigin = '';

/** Returns the verified user id (sub claim), or null for any invalid,
 *  expired or wrongly-signed token. Never throws. */
export async function verifySupabaseJwt(
  token: string,
  supabaseUrl: string,
): Promise<string | null> {
  if (!token) return null;

  if (!jwks || jwksOrigin !== supabaseUrl) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksOrigin = supabaseUrl;
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: 'authenticated',
    });
    return typeof payload.sub === 'string' && payload.sub.length > 0
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}
