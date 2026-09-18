/**
 * Bounded JSON body reading for the Worker's POST routes (IN-GR-045):
 * POST /v1/share/room and POST /v1/growth/events shared a hand-copied block.
 *
 * The declared Content-Length gates the read, so an oversized body is
 * refused before it is buffered; the read length is checked again in case
 * the header understated it. Returns a result rather than a Response, so a
 * route can decide when an error is answered (the growth route rate-limits
 * a malformed body before it answers 400).
 *
 * Pure module — NO Hono/Workers imports — tested from the root vitest rig.
 */

export type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 411 | 413; error: string };

export interface JsonBodyOptions {
  maxBytes: number;
  /** 411 when the request declares no Content-Length. */
  requireLength?: boolean;
}

export async function readJsonBody(
  c: { req: { header: (name: string) => string | undefined; text: () => Promise<string> } },
  { maxBytes, requireLength = false }: JsonBodyOptions,
): Promise<JsonBodyResult> {
  const declared = c.req.header('content-length');
  if (declared === undefined && requireLength) {
    return { ok: false, status: 411, error: 'content-length required' };
  }
  if (Number(declared ?? '0') > maxBytes) return { ok: false, status: 413, error: 'body too large' };
  try {
    const text = await c.req.text();
    if (text.length > maxBytes) return { ok: false, status: 413, error: 'body too large' };
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'invalid json' };
  }
}
