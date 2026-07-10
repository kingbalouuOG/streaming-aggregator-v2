/**
 * Unit tests for the password-reset bridge page. Pure module (no
 * Workers/Hono imports), runs under the root vitest rig.
 */

import { describe, it, expect } from 'vitest';
import { renderResetBridgePage, TOKEN_HASH_RE } from '../resetBridge';

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

describe('renderResetBridgePage', () => {
  it('renders the app link as both button href and auto-redirect', () => {
    const url = 'videx://reset-password?token_hash=abc123&type=recovery';
    const html = renderResetBridgePage(url);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(JSON.stringify(url));
    expect(html).toContain('Open Videx');
  });

  it('renders the invalid-link state without any app URL or script', () => {
    const html = renderResetBridgePage(null);
    expect(html).not.toContain('videx://');
    expect(html).not.toContain('<script>');
    expect(html).toContain('request a new password-reset email');
  });

  it('is marked noindex', () => {
    expect(renderResetBridgePage(null)).toContain('name="robots" content="noindex"');
  });
});
