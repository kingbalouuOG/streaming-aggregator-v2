/**
 * Unit tests for the auth email bridge page (password reset and, since the
 * Growth S3 follow-up, sign-up confirmation). Pure module (no Workers/Hono
 * imports), runs under the root vitest rig.
 */

import { describe, it, expect } from 'vitest';
import { bridgeAppUrl, bridgeKind, renderResetBridgePage, TOKEN_HASH_RE } from '../resetBridge';

describe('TOKEN_HASH_RE', () => {
  it('accepts url-safe token hashes', () => {
    expect(TOKEN_HASH_RE.test('pkce_0a1b2C3d4E5f-_')).toBe(true);
    expect(TOKEN_HASH_RE.test('a'.repeat(256))).toBe(true);
  });

  it('rejects injection attempts and junk', () => {
    expect(TOKEN_HASH_RE.test('')).toBe(false);
    expect(TOKEN_HASH_RE.test('a'.repeat(257))).toBe(false);
    expect(TOKEN_HASH_RE.test('abc"><script>')).toBe(false);
    expect(TOKEN_HASH_RE.test("abc' onload='x")).toBe(false);
    expect(TOKEN_HASH_RE.test('abc&type=evil')).toBe(false);
  });
});

describe('bridgeAppUrl', () => {
  it('sends a recovery token to the reset screen', () => {
    expect(bridgeAppUrl('abc123', 'recovery')).toBe('videx://reset-password?token_hash=abc123&type=recovery');
  });

  it('sends a sign-up confirmation to the confirm screen as type=email', () => {
    expect(bridgeAppUrl('abc123', 'email')).toBe('videx://confirm-email?token_hash=abc123&type=email');
    expect(bridgeAppUrl('abc123', 'signup')).toBe('videx://confirm-email?token_hash=abc123&type=email');
  });

  it('refuses other types and bad tokens', () => {
    expect(bridgeAppUrl('abc123', '')).toBeNull();
    expect(bridgeAppUrl('abc123', 'magiclink')).toBeNull();
    expect(bridgeAppUrl('abc123', 'email_change')).toBeNull();
    expect(bridgeAppUrl('abc"><script>', 'email')).toBeNull();
    expect(bridgeAppUrl('', 'recovery')).toBeNull();
  });
});

describe('bridgeKind', () => {
  it('is recovery only for recovery', () => {
    expect(bridgeKind('recovery')).toBe('recovery');
    expect(bridgeKind('email')).toBe('confirm');
    expect(bridgeKind('')).toBe('confirm');
  });
});

describe('renderResetBridgePage', () => {
  it('renders the app link as both button href and auto-redirect', () => {
    const url = 'videx://reset-password?token_hash=abc123&type=recovery';
    const html = renderResetBridgePage(url);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(JSON.stringify(url));
    expect(html).toContain('Open Videx');
    expect(html).toContain('<h1>Reset your password</h1>');
  });

  it('renders the invalid-link state without any app URL or script', () => {
    const html = renderResetBridgePage(null);
    expect(html).not.toContain('videx://');
    expect(html).not.toContain('<script>');
    expect(html).toContain('request a new password-reset email');
  });

  it('uses confirmation copy for the confirm kind', () => {
    const url = 'videx://confirm-email?token_hash=abc123&type=email';
    const html = renderResetBridgePage(url, 'confirm');
    expect(html).toContain('<h1>Confirm your email</h1>');
    expect(html).toContain('<title>Confirm your Videx email</title>');
    expect(html).toContain(`href="${url}"`);
    expect(renderResetBridgePage(null, 'confirm')).toContain('This confirmation link is incomplete or invalid.');
  });

  it('is marked noindex', () => {
    expect(renderResetBridgePage(null)).toContain('name="robots" content="noindex"');
  });
});
