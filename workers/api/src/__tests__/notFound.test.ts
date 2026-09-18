/**
 * The Worker's branded 404s (IN-GR-045). Snapshotted from the four inline
 * responses in index.ts BEFORE they became one helper, so the refactor is
 * proven byte-for-byte: status, every header and the body per platform.
 */

import { describe, expect, it } from 'vitest';
import { notFound, type NotFoundKind } from '../notFound';

const ctx = (ua: string) => ({ req: { header: (name: string) => (name === 'user-agent' ? ua : undefined) } });
const build = (kind: NotFoundKind, ua: string) => notFound(ctx(ua), kind);

const UAS = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
  other: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
};

async function shape(resp: Response) {
  return {
    status: resp.status,
    headers: Object.fromEntries([...resp.headers.entries()].sort()),
    body: await resp.text(),
  };
}

describe('branded 404s', () => {
  for (const kind of ['title', 'room', 'list'] as const) {
    for (const [platform, ua] of Object.entries(UAS)) {
      it(`${kind} / ${platform}`, async () => {
        expect(await shape(build(kind, ua))).toMatchSnapshot();
      });
    }
  }
});
