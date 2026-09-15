/**
 * UUID v4 for ids the client mints itself: the session id
 * (src/lib/instrumentation/sessionId.ts) and the install id (Growth S2,
 * src/lib/growth/attribution.ts).
 *
 * crypto.randomUUID exists in modern WebViews, Node 19+ and Workers but NOT
 * in Hermes (React Native), where a bare `crypto` reference is a
 * ReferenceError. Neither id needs cryptographic strength, only uniqueness,
 * so fall back to a Math.random v4 when crypto is unavailable. Accessed via
 * globalThis so the absence is `undefined`, not a throw.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function generateUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
