/**
 * The Worker's branded HTML 404s (IN-GR-045): an unknown title, a malformed
 * or unknown room id, and the /list/:id grammar reserved for G2. One helper,
 * so every 404 carries the same status, content type, security headers and
 * short cache. Attribution is applied by the caller, as for any page.
 *
 * Pure module — NO Hono/Workers imports — tested from the root vitest rig.
 */

import { htmlPage, NOT_FOUND_CACHE_CONTROL, platformBucket } from './pageShell';
import { renderTitleNotFoundPage } from './titlePage';
import { renderListNotFoundPage, renderRoomNotFoundPage } from './roomPage';

export type NotFoundKind = 'title' | 'room' | 'list';

const RENDER = {
  title: renderTitleNotFoundPage,
  room: renderRoomNotFoundPage,
  list: renderListNotFoundPage,
} as const;

/** The branded 404 for `kind`, with the CTA for the visitor's platform. */
export function notFound(
  c: { req: { header: (name: string) => string | undefined } },
  kind: NotFoundKind,
): Response {
  const bucket = platformBucket(c.req.header('user-agent'));
  return htmlPage(RENDER[kind](bucket), 404, { 'Cache-Control': NOT_FOUND_CACHE_CONTROL });
}
