/**
 * Sign in with Apple server helpers (Growth S3 follow-up, IN-GR-010).
 *
 * App Store guideline 5.1.1(v): an app offering Sign in with Apple must
 * revoke the user's Apple tokens when they delete their account. The
 * revoke-apple-token Edge Function exchanges a fresh authorization code
 * for a refresh token and revokes it; both Apple endpoints authenticate the
 * app with a "client secret" that is an ES256 JWT signed by a Sign in with
 * Apple private key (.p8).
 *
 * Pure: Web Crypto only (Deno and Node both provide `crypto.subtle`), no
 * Deno or Supabase imports, so the root vitest rig tests it.
 */

export const APPLE_AUDIENCE = 'https://appleid.apple.com';
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
/** Apple allows up to six months; a secret is minted per request, so keep it short. */
export const CLIENT_SECRET_TTL_SECONDS = 300;

export interface AppleKeyConfig {
  teamId: string;
  keyId: string;
  /** For the native flow this is the bundle id, app.videx.streaming. */
  clientId: string;
  /** The .p8 file contents (PKCS#8 PEM). */
  privateKeyPem: string;
}

/** Read the config from secrets; null when any is missing. Accepts a PEM
 *  pasted with literal "\n" sequences (a common way to set one-line secrets). */
export function readAppleConfig(get: (name: string) => string | undefined): AppleKeyConfig | null {
  const teamId = get('APPLE_TEAM_ID')?.trim();
  const keyId = get('APPLE_KEY_ID')?.trim();
  const clientId = get('APPLE_CLIENT_ID')?.trim();
  const privateKeyPem = get('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n').trim();
  if (!teamId || !keyId || !clientId || !privateKeyPem) return null;
  return { teamId, keyId, clientId, privateKeyPem };
}

export function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pemToPkcs8(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  if (!b64) throw new Error('Apple private key is empty');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function clientSecretClaims(config: AppleKeyConfig, nowSeconds: number) {
  return {
    header: { alg: 'ES256', kid: config.keyId, typ: 'JWT' },
    payload: {
      iss: config.teamId,
      iat: nowSeconds,
      exp: nowSeconds + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: config.clientId,
    },
  };
}

/** The ES256 client-secret JWT. Web Crypto's ECDSA signature is already the
 *  raw r||s (IEEE P1363) form that JWS requires. */
export async function signClientSecret(config: AppleKeyConfig, nowSeconds: number): Promise<string> {
  const { header, payload } = clientSecretClaims(config, nowSeconds);
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    // The exact-length buffer: Deno's lib types want an ArrayBuffer, not ArrayBufferLike.
    pemToPkcs8(config.privateKeyPem).buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Form body for exchanging the app's authorization code (native flow: no redirect_uri). */
export function tokenExchangeBody(clientId: string, clientSecret: string, code: string): URLSearchParams {
  return new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  });
}

export function revokeBody(
  clientId: string,
  clientSecret: string,
  token: string,
  tokenTypeHint: 'refresh_token' | 'access_token',
): URLSearchParams {
  return new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: tokenTypeHint,
  });
}

/** Claims of a JWT without verifying it. Used only on an id_token received
 *  directly from Apple over TLS, to match its subject to the user's identity. */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    const value = JSON.parse(json);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Which token to revoke from Apple's token response: the refresh token when
 *  present (revoking it invalidates the user's grant), else the access token. */
export function pickRevocableToken(
  response: { refresh_token?: unknown; access_token?: unknown },
): { token: string; hint: 'refresh_token' | 'access_token' } | null {
  if (typeof response.refresh_token === 'string' && response.refresh_token) {
    return { token: response.refresh_token, hint: 'refresh_token' };
  }
  if (typeof response.access_token === 'string' && response.access_token) {
    return { token: response.access_token, hint: 'access_token' };
  }
  return null;
}
