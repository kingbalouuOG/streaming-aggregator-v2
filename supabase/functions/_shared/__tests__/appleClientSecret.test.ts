// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  APPLE_AUDIENCE,
  CLIENT_SECRET_TTL_SECONDS,
  base64UrlEncode,
  clientSecretClaims,
  decodeJwtPayload,
  pickRevocableToken,
  readAppleConfig,
  revokeBody,
  signClientSecret,
  tokenExchangeBody,
  type AppleKeyConfig,
} from '../appleClientSecret';

async function testKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = Buffer.from(pkcs8).toString('base64').match(/.{1,64}/g)!.join('\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`, publicKey: pair.publicKey };
}

const base: Omit<AppleKeyConfig, 'privateKeyPem'> = {
  teamId: 'CT8F3578W8',
  keyId: 'ABC123DEFG',
  clientId: 'app.videx.streaming',
};

const fromB64Url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

describe('readAppleConfig', () => {
  const env = (vars: Record<string, string>) => (k: string) => vars[k];

  it('returns null when any secret is missing', () => {
    expect(readAppleConfig(env({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_CLIENT_ID: 'C' }))).toBeNull();
    expect(readAppleConfig(env({}))).toBeNull();
  });

  it('turns escaped newlines in the key back into real ones', () => {
    const cfg = readAppleConfig(
      env({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_CLIENT_ID: 'C', APPLE_PRIVATE_KEY: 'a\\nb' }),
    );
    expect(cfg?.privateKeyPem).toBe('a\nb');
  });
});

describe('base64UrlEncode', () => {
  it('uses the URL-safe alphabet without padding', () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(base64UrlEncode('{"a":1}')).toBe('eyJhIjoxfQ');
  });
});

describe('clientSecretClaims', () => {
  it('matches what Apple requires', () => {
    const { header, payload } = clientSecretClaims({ ...base, privateKeyPem: '' }, 1_000);
    expect(header).toEqual({ alg: 'ES256', kid: 'ABC123DEFG', typ: 'JWT' });
    expect(payload).toEqual({
      iss: 'CT8F3578W8',
      iat: 1_000,
      exp: 1_000 + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: 'app.videx.streaming',
    });
  });
});

describe('signClientSecret', () => {
  it('produces a JWT whose ES256 signature verifies with the matching public key', async () => {
    const { pem, publicKey } = await testKey();
    const jwt = await signClientSecret({ ...base, privateKeyPem: pem }, 1_700_000_000);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(fromB64Url(h).toString())).toEqual({ alg: 'ES256', kid: 'ABC123DEFG', typ: 'JWT' });
    expect(JSON.parse(fromB64Url(p).toString()).sub).toBe('app.videx.streaming');
    const sig = fromB64Url(s);
    expect(sig.length).toBe(64); // raw r||s, not DER
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sig,
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it('rejects an empty key', async () => {
    await expect(signClientSecret({ ...base, privateKeyPem: '' }, 1)).rejects.toThrow();
  });
});

describe('request bodies', () => {
  it('token exchange is an authorization_code grant with no redirect_uri', () => {
    const body = tokenExchangeBody('app.videx.streaming', 'secret', 'code123');
    expect(Object.fromEntries(body)).toEqual({
      client_id: 'app.videx.streaming',
      client_secret: 'secret',
      code: 'code123',
      grant_type: 'authorization_code',
    });
  });

  it('revoke carries the token and its type hint', () => {
    expect(Object.fromEntries(revokeBody('c', 's', 'tok', 'refresh_token'))).toEqual({
      client_id: 'c',
      client_secret: 's',
      token: 'tok',
      token_type_hint: 'refresh_token',
    });
  });
});

describe('pickRevocableToken', () => {
  it('prefers the refresh token', () => {
    expect(pickRevocableToken({ refresh_token: 'r', access_token: 'a' })).toEqual({ token: 'r', hint: 'refresh_token' });
  });
  it('falls back to the access token', () => {
    expect(pickRevocableToken({ access_token: 'a' })).toEqual({ token: 'a', hint: 'access_token' });
  });
  it('returns null with neither', () => {
    expect(pickRevocableToken({})).toBeNull();
  });
});

describe('decodeJwtPayload', () => {
  it('reads the claims of a JWT', () => {
    const jwt = `${base64UrlEncode('{"alg":"RS256"}')}.${base64UrlEncode('{"sub":"001234.abcd"}')}.sig`;
    expect(decodeJwtPayload(jwt)).toEqual({ sub: '001234.abcd' });
  });
  it('returns null for junk', () => {
    expect(decodeJwtPayload('nope')).toBeNull();
    expect(decodeJwtPayload('a.%%%.c')).toBeNull();
  });
});
