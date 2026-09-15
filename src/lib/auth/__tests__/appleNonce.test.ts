import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { APPLE_NONCE_BYTES, bytesToHex, createAppleNonce, type NonceDeps } from '../appleNonce';

const nodeDeps: NonceDeps = {
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
  sha256Hex: async (v) => createHash('sha256').update(v).digest('hex'),
};

describe('bytesToHex', () => {
  it('zero-pads each byte', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });
});

describe('createAppleNonce', () => {
  it('hashes the raw nonce with SHA-256 (the value Supabase recomputes)', async () => {
    const { raw, hashed } = await createAppleNonce(nodeDeps);
    expect(hashed).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('uses 32 random bytes as 64 hex characters', async () => {
    const { raw, hashed } = await createAppleNonce(nodeDeps);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(raw).not.toBe(hashed);
  });

  it('is fresh on every call', async () => {
    const a = await createAppleNonce(nodeDeps);
    const b = await createAppleNonce(nodeDeps);
    expect(a.raw).not.toBe(b.raw);
  });

  it('asks for exactly APPLE_NONCE_BYTES', async () => {
    const asked: number[] = [];
    await createAppleNonce({ ...nodeDeps, randomBytes: (n) => (asked.push(n), new Uint8Array(n)) });
    expect(asked).toEqual([APPLE_NONCE_BYTES]);
  });

  it('refuses a short random source', async () => {
    await expect(
      createAppleNonce({ ...nodeDeps, randomBytes: () => new Uint8Array(8) }),
    ).rejects.toThrow(/32 random bytes/);
  });

  it('lowercases an uppercase digest', async () => {
    const { raw, hashed } = await createAppleNonce({
      ...nodeDeps,
      sha256Hex: async (v) => createHash('sha256').update(v).digest('hex').toUpperCase(),
    });
    expect(hashed).toBe(createHash('sha256').update(raw).digest('hex'));
  });
});
