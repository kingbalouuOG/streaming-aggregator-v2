/**
 * Sign in with Apple nonce (Growth S3).
 *
 * Apple copies the nonce it is given into the identity token. Supabase's
 * signInWithIdToken takes the RAW nonce, hashes it with SHA-256 and
 * compares the hex digest with the token's claim. So the hashed form goes
 * to AppleAuthentication.signInAsync and the raw form to Supabase. A fresh
 * nonce per attempt stops a captured token being replayed.
 *
 * Pure: randomness and hashing are injected (expo-crypto on device, node
 * crypto in tests), so this module stays importable outside React Native.
 */

export const APPLE_NONCE_BYTES = 32;

export interface AppleNonce {
  /** Sent to Supabase. */
  raw: string;
  /** Lowercase hex SHA-256 of `raw`; sent to Apple. */
  hashed: string;
}

export interface NonceDeps {
  randomBytes: (byteCount: number) => Uint8Array;
  sha256Hex: (value: string) => Promise<string>;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export async function createAppleNonce(deps: NonceDeps): Promise<AppleNonce> {
  const bytes = deps.randomBytes(APPLE_NONCE_BYTES);
  if (bytes.length < APPLE_NONCE_BYTES) {
    throw new Error(`Apple nonce needs ${APPLE_NONCE_BYTES} random bytes, got ${bytes.length}`);
  }
  const raw = bytesToHex(bytes);
  const hashed = (await deps.sha256Hex(raw)).toLowerCase();
  return { raw, hashed };
}
