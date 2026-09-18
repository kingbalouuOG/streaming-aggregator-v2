import { describe, expect, it } from 'vitest';
import { readJsonBody } from '../jsonBody';

const req = (text: string, contentLength?: string) => ({
  req: {
    header: (name: string) => (name === 'content-length' ? contentLength : undefined),
    text: async () => text,
  },
});

describe('readJsonBody (IN-GR-045)', () => {
  it('parses a body within the cap', async () => {
    expect(await readJsonBody(req('{"a":1}', '7'), { maxBytes: 16 })).toEqual({ ok: true, body: { a: 1 } });
  });

  it('411 when a length is required and absent', async () => {
    expect(await readJsonBody(req('{}'), { maxBytes: 16, requireLength: true })).toEqual({
      ok: false, status: 411, error: 'content-length required',
    });
  });

  it('reads a body with no declared length when none is required', async () => {
    expect(await readJsonBody(req('{}'), { maxBytes: 16 })).toEqual({ ok: true, body: {} });
  });

  it('413 when the declared length is over the cap, before reading', async () => {
    let read = false;
    const c = { req: { header: () => '17', text: async () => { read = true; return '{}'; } } };
    expect(await readJsonBody(c, { maxBytes: 16 })).toEqual({ ok: false, status: 413, error: 'body too large' });
    expect(read).toBe(false);
  });

  it('413 when the body is over the cap despite a small declared length', async () => {
    expect(await readJsonBody(req(`"${'x'.repeat(20)}"`, '2'), { maxBytes: 16 })).toEqual({
      ok: false, status: 413, error: 'body too large',
    });
  });

  it('400 on invalid JSON', async () => {
    expect(await readJsonBody(req('{nope', '5'), { maxBytes: 16, requireLength: true })).toEqual({
      ok: false, status: 400, error: 'invalid json',
    });
  });

  it('400 when the body cannot be read', async () => {
    const c = { req: { header: () => '2', text: async () => { throw new Error('stream'); } } };
    expect(await readJsonBody(c, { maxBytes: 16 })).toEqual({ ok: false, status: 400, error: 'invalid json' });
  });
});
