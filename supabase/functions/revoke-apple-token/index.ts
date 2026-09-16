/**
 * revoke-apple-token — Growth S3 follow-up (IN-GR-010).
 *
 * App Store guideline 5.1.1(v): when a user who signed in with Apple deletes
 * their account, the app must revoke their Apple tokens. Supabase does not.
 * Videx stores no Apple tokens, so the app re-authorises with Apple just
 * before deletion and sends the fresh authorization code here. This function:
 *   1. checks the caller (gateway-verified JWT) has an `apple` identity;
 *   2. exchanges the code at Apple's token endpoint (client secret = ES256 JWT
 *      signed with the Sign in with Apple key);
 *   3. checks the id_token's subject is that same Apple identity (so a code
 *      from a different Apple ID revokes nothing on someone else's behalf);
 *   4. revokes the refresh token (or access token) at Apple's revoke endpoint.
 * Only a 200 from this function lets the app continue to delete_own_account.
 *
 * Secrets (Joe: `supabase secrets set`, never committed):
 *   APPLE_TEAM_ID     CT8F3578W8
 *   APPLE_CLIENT_ID   app.videx.streaming
 *   APPLE_KEY_ID      the Sign in with Apple key's id
 *   APPLE_PRIVATE_KEY the .p8 file contents
 *
 * Deploy:
 *   npx supabase functions deploy revoke-apple-token --project-ref fmusugdcnnwiuzkbjquo
 *
 * Request:  POST /  { "authorizationCode": "c1a2…" }
 * Response: 200 { "revoked": true }
 *           400 { "error": "invalid_request" | "not_apple_account" | "apple_account_mismatch" }
 *           401 { "error": "unauthorized" }
 *           500 { "error": "not_configured" }
 *           502 { "error": "apple_token_exchange_failed" | "apple_revoke_failed" }
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createServiceRoleClient, extractUserIdFromJwt } from '../_shared/userScope.ts';
import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  decodeJwtPayload,
  pickRevocableToken,
  readAppleConfig,
  revokeBody,
  signClientSecret,
  tokenExchangeBody,
} from '../_shared/appleClientSecret.ts';

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

// deno-lint-ignore no-explicit-any
Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get('origin'));
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const userId = extractUserIdFromJwt(req);
  if (!userId) return json(401, { error: 'unauthorized' });

  let code = '';
  try {
    const body = await req.json();
    code = typeof body?.authorizationCode === 'string' ? body.authorizationCode.trim() : '';
  } catch {
    // fall through to the check below
  }
  if (!code || code.length > 1024) return json(400, { error: 'invalid_request' });

  const config = readAppleConfig((name) => Deno.env.get(name));
  if (!config) {
    console.error('[revoke-apple-token] Apple secrets are not configured');
    return json(500, { error: 'not_configured' });
  }

  const admin = createServiceRoleClient();
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });
  const apple = (userData.user.identities ?? []).find((i) => i.provider === 'apple');
  if (!apple) return json(400, { error: 'not_apple_account' });
  const appleSub = (apple.identity_data?.sub as string | undefined) ?? apple.id;

  const clientSecret = await signClientSecret(config, Math.floor(Date.now() / 1000));

  const tokenRes = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: FORM,
    body: tokenExchangeBody(config.clientId, clientSecret, code),
  });
  // deno-lint-ignore no-explicit-any
  const tokens: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    // Apple's error body is { error: 'invalid_grant' | 'invalid_client' | … }: no user data.
    console.error('[revoke-apple-token] token exchange failed', tokenRes.status, tokens?.error);
    return json(502, { error: 'apple_token_exchange_failed' });
  }

  const idSub = typeof tokens.id_token === 'string' ? decodeJwtPayload(tokens.id_token)?.sub : undefined;
  if (idSub !== appleSub) return json(400, { error: 'apple_account_mismatch' });

  const revocable = pickRevocableToken(tokens);
  if (!revocable) return json(502, { error: 'apple_token_exchange_failed' });

  const revokeRes = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: FORM,
    body: revokeBody(config.clientId, clientSecret, revocable.token, revocable.hint),
  });
  if (!revokeRes.ok) {
    console.error('[revoke-apple-token] revoke failed', revokeRes.status);
    return json(502, { error: 'apple_revoke_failed' });
  }

  return json(200, { revoked: true });
});
