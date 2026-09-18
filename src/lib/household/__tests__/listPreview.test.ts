import { describe, expect, it, vi } from 'vitest';

import { sharedListRoute, sharedListUrl } from '../links';
import { fetchListPreview, listPreviewPath, parseListPreview, type ListPreview } from '../listPreview';

const GOOD: ListPreview = {
  id: 'b3c1d5e0-0000-4000-8000-000000000001',
  name: 'Shared',
  household_name: 'The Flat',
  count: 12,
  posters: ['/a.jpg', '/b.jpg'],
  members: 3,
};

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('parseListPreview', () => {
  it('accepts the contract shape', () => {
    expect(parseListPreview(GOOD)).toEqual(GOOD);
  });

  it('keeps only the contract keys (no member names, no token)', () => {
    const out = parseListPreview({ ...GOOD, member_names: ['joe'], invite: 'secret' });
    expect(Object.keys(out ?? {}).sort()).toEqual(['count', 'household_name', 'id', 'members', 'name', 'posters']);
  });

  it('caps posters at 6 and drops anything that is not a path', () => {
    const posters = ['/1', '/2', 3, 'http://x/y', '/4', '/5', '/6', '/7', '/8'];
    expect(parseListPreview({ ...GOOD, posters })?.posters).toEqual(['/1', '/2', '/4', '/5', '/6', '/7']);
  });

  it.each([
    null,
    'x',
    { ...GOOD, id: '' },
    { ...GOOD, name: 1 },
    { ...GOOD, count: -1 },
    { ...GOOD, members: 1.5 },
    { ...GOOD, posters: 'x' },
  ])('rejects %j', (body) => {
    expect(parseListPreview(body)).toBeNull();
  });
});

describe('fetchListPreview', () => {
  it('calls the public route and parses the body', async () => {
    const fetchImpl = vi.fn(async () => response(200, GOOD));
    const out = await fetchListPreview(GOOD.id, { baseUrl: 'https://api.test/', fetchImpl });
    expect(out).toEqual(GOOD);
    expect(fetchImpl).toHaveBeenCalledWith(`https://api.test/v1/list/${GOOD.id}/preview`, expect.anything());
  });

  it('returns null for a 404 (route not live yet) and without a base URL', async () => {
    const fetchImpl = vi.fn(async () => response(404, { error: 'not found' }));
    expect(await fetchListPreview('x', { baseUrl: 'https://api.test', fetchImpl })).toBeNull();
    expect(await fetchListPreview('x', { baseUrl: null, fetchImpl })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns null for a body that is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200 }));
    expect(await fetchListPreview('x', { baseUrl: 'https://api.test', fetchImpl })).toBeNull();
  });

  it('throws on a 5xx so the screen can retry', async () => {
    const fetchImpl = vi.fn(async () => response(503, {}));
    await expect(fetchListPreview('x', { baseUrl: 'https://api.test', fetchImpl })).rejects.toThrow();
  });

  it('encodes the id', () => {
    expect(listPreviewPath('a/b')).toBe('/v1/list/a%2Fb/preview');
  });
});

describe('sharedListUrl', () => {
  it('builds the plain and the invite URL', () => {
    expect(sharedListUrl('L1')).toBe('https://videxstreaming.com/list/L1');
    expect(sharedListUrl('L1', 'tok')).toBe('https://videxstreaming.com/list/L1?invite=tok');
    expect(sharedListRoute('L1')).toBe('/list/L1');
  });
});
