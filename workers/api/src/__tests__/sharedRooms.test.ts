import { describe, expect, it } from 'vitest';

import { neutraliseRoomLabel, parseStoredTitleRefs, validateShareRoomBody } from '../sharedRooms';

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ tmdb_id: i + 1, media_type: i % 2 ? 'tv' : 'movie' }));

const valid = {
  kind: 'anchor',
  source_ref: 'anchor:movie-949',
  label: 'Slow-burn crime sagas',
  description: 'Long nights, longer cons.',
  titles: refs(3),
};

describe('neutraliseRoomLabel', () => {
  it.each([
    ['Because you liked Heat', 'More like Heat'],
    ['If you love Heat', 'More like Heat'],
    ['because you watched  The Wire', 'More like The Wire'],
    ['If you loved Paddington 2', 'More like Paddington 2'],
  ])('%s -> %s', (input, out) => {
    expect(neutraliseRoomLabel(input)).toBe(out);
  });

  it('leaves thematic labels alone', () => {
    expect(neutraliseRoomLabel('  Quiet  British  mysteries ')).toBe('Quiet British mysteries');
    expect(neutraliseRoomLabel('Love, actually')).toBe('Love, actually');
  });
});

describe('validateShareRoomBody', () => {
  it('accepts a valid anchor room', () => {
    const r = validateShareRoomBody(valid);
    expect(r).toEqual({ ok: true, value: { ...valid, titles: refs(3) } });
  });

  it('accepts a global room keyed by uuid, description optional', () => {
    const r = validateShareRoomBody({
      kind: 'global',
      source_ref: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
      label: 'Comfort rewatches',
      titles: refs(1),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.description).toBeNull();
  });

  it('strips personal framing from the label', () => {
    const r = validateShareRoomBody({ ...valid, label: 'If you love Heat' });
    expect(r.ok && r.value.label).toBe('More like Heat');
  });

  it('accepts 60 titles and rejects 61', () => {
    expect(validateShareRoomBody({ ...valid, titles: refs(60) }).ok).toBe(true);
    expect(validateShareRoomBody({ ...valid, titles: refs(61) })).toEqual({
      ok: false,
      error: 'titles exceeds 60',
    });
  });

  it('dedupes titles keeping first order', () => {
    const r = validateShareRoomBody({
      ...valid,
      titles: [
        { tmdb_id: 2, media_type: 'tv' },
        { tmdb_id: 1, media_type: 'movie' },
        { tmdb_id: 2, media_type: 'tv' },
        { tmdb_id: 2, media_type: 'movie' },
      ],
    });
    expect(r.ok && r.value.titles).toEqual([
      { tmdb_id: 2, media_type: 'tv' },
      { tmdb_id: 1, media_type: 'movie' },
      { tmdb_id: 2, media_type: 'movie' },
    ]);
  });

  it('drops extra fields on titles', () => {
    const r = validateShareRoomBody({ ...valid, titles: [{ tmdb_id: 5, media_type: 'movie', title: 'x' }] });
    expect(r.ok && r.value.titles).toEqual([{ tmdb_id: 5, media_type: 'movie' }]);
  });

  it.each([
    [null, 'body must be an object'],
    [[], 'body must be an object'],
    [{ ...valid, kind: 'personal' }, "kind must be 'global' or 'anchor'"],
    [{ ...valid, source_ref: 'anchor:person-1' }, 'source_ref does not match kind'],
    [{ ...valid, kind: 'global' }, 'source_ref does not match kind'],
    [{ ...valid, label: '   ' }, 'label must be 1..120 characters'],
    [{ ...valid, label: 'x'.repeat(121) }, 'label must be 1..120 characters'],
    [{ ...valid, description: 42 }, 'description must be a string'],
    [{ ...valid, description: 'x'.repeat(501) }, 'description must be at most 500 characters'],
    [{ ...valid, titles: [] }, 'titles must be a non-empty array'],
    [{ ...valid, titles: [{ tmdb_id: 1.5, media_type: 'movie' }] }, 'tmdb_id must be a positive integer'],
    [{ ...valid, titles: [{ tmdb_id: '1', media_type: 'movie' }] }, 'tmdb_id must be a positive integer'],
    [{ ...valid, titles: [{ tmdb_id: 1, media_type: 'person' }] }, "media_type must be 'movie' or 'tv'"],
  ])('rejects %j', (body, error) => {
    expect(validateShareRoomBody(body)).toEqual({ ok: false, error });
  });

  it('treats a blank description as none', () => {
    const r = validateShareRoomBody({ ...valid, description: '  ' });
    expect(r.ok && r.value.description).toBeNull();
  });
});

describe('parseStoredTitleRefs', () => {
  it('reads back the stored jsonb, skipping malformed entries', () => {
    expect(
      parseStoredTitleRefs([
        { tmdb_id: 1, media_type: 'movie' },
        { tmdb_id: 'x', media_type: 'movie' },
        null,
        { tmdb_id: 2, media_type: 'tv' },
      ]),
    ).toEqual([
      { tmdb_id: 1, media_type: 'movie' },
      { tmdb_id: 2, media_type: 'tv' },
    ]);
    expect(parseStoredTitleRefs('nope')).toEqual([]);
  });
});
