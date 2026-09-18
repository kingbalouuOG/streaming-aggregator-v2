import { describe, expect, it } from 'vitest';

import {
  arrangeSharedList,
  buildItemInsert,
  canRemoveItem,
  clipChars,
  nextReaction,
  POSTER_PATH_MAX,
  summariseReactions,
  TITLE_MAX,
  tmdbPathFromImageUrl,
  toSharedItem,
  type SharedItem,
  type SharedItemRow,
} from '../items';

const base = {
  watchlistId: 'w1',
  tmdbId: 603,
  mediaType: 'movie' as const,
  title: 'The Matrix',
  posterPath: '/p.jpg',
  addedBy: 'u1',
};

describe('buildItemInsert', () => {
  it('builds exactly the granted insert columns', () => {
    expect(buildItemInsert(base)).toEqual({
      watchlist_id: 'w1',
      tmdb_id: 603,
      media_type: 'movie',
      title: 'The Matrix',
      poster_path: '/p.jpg',
      added_by: 'u1',
    });
  });

  it('clips the title to 300 characters', () => {
    const row = buildItemInsert({ ...base, title: 'x'.repeat(400) });
    expect(Array.from(row.title)).toHaveLength(TITLE_MAX);
  });

  it('clips by code point, never splitting an emoji', () => {
    const row = buildItemInsert({ ...base, title: '\u{1F3AC}'.repeat(301) });
    expect(row.title).toBe('\u{1F3AC}'.repeat(300));
  });

  it('trims the title and never sends an empty one', () => {
    expect(buildItemInsert({ ...base, title: '  Heat  ' }).title).toBe('Heat');
    expect(buildItemInsert({ ...base, title: '   ' }).title).toBe('Untitled');
  });

  it('keeps a poster path at the limit and drops one over it', () => {
    const ok = `/${'a'.repeat(POSTER_PATH_MAX - 1)}`;
    expect(buildItemInsert({ ...base, posterPath: ok }).poster_path).toBe(ok);
    expect(buildItemInsert({ ...base, posterPath: `${ok}b` }).poster_path).toBeNull();
  });

  it('sends null for a missing or blank poster path', () => {
    expect(buildItemInsert({ ...base, posterPath: undefined }).poster_path).toBeNull();
    expect(buildItemInsert({ ...base, posterPath: ' ' }).poster_path).toBeNull();
  });
});

describe('clipChars', () => {
  it('returns a short string unchanged', () => {
    expect(clipChars('abc', 3)).toBe('abc');
  });
});

describe('nextReaction', () => {
  it('sets, switches and clears', () => {
    expect(nextReaction(null, 'up')).toBe('up');
    expect(nextReaction('up', 'tonight')).toBe('tonight');
    expect(nextReaction('tonight', 'tonight')).toBeNull();
  });
});

describe('summariseReactions', () => {
  it('counts each reaction and finds the caller', () => {
    const s = summariseReactions(
      [
        { user_id: 'a', reaction: 'up' },
        { user_id: 'b', reaction: 'up' },
        { user_id: 'c', reaction: 'tonight' },
        { user_id: 'd', reaction: 'meh' },
      ],
      'c',
    );
    expect(s).toEqual({ counts: { up: 2, down: 0, tonight: 1 }, mine: 'tonight' });
  });

  it('handles no rows and no caller', () => {
    expect(summariseReactions(null, null)).toEqual({ counts: { up: 0, down: 0, tonight: 0 }, mine: null });
  });
});

function row(id: string, addedAt: string, reactions: SharedItemRow['watchlist_reactions'] = []): SharedItemRow {
  return {
    id,
    watchlist_id: 'w1',
    tmdb_id: 1,
    media_type: 'tv',
    title: id,
    poster_path: null,
    added_by: 'u1',
    added_at: addedAt,
    watchlist_reactions: reactions,
  };
}

describe('toSharedItem', () => {
  it('builds the app content id', () => {
    expect(toSharedItem(row('i', '2026-09-18T10:00:00Z'), null).contentId).toBe('tv-1');
  });
});

describe('arrangeSharedList', () => {
  it('sorts newest first and pins tonight items', () => {
    const items: SharedItem[] = [
      toSharedItem(row('old', '2026-09-01T00:00:00Z'), 'u1'),
      toSharedItem(row('new', '2026-09-18T00:00:00Z'), 'u1'),
      toSharedItem(row('mid', '2026-09-10T00:00:00Z', [{ user_id: 'u2', reaction: 'tonight' }]), 'u1'),
    ];
    const out = arrangeSharedList(items);
    expect(out.tonight.map((i) => i.id)).toEqual(['mid']);
    expect(out.rest.map((i) => i.id)).toEqual(['new', 'old']);
  });
});

describe('canRemoveItem', () => {
  it('lets the adder or the owner remove', () => {
    expect(canRemoveItem({ addedBy: 'u1' }, 'u1', false)).toBe(true);
    expect(canRemoveItem({ addedBy: 'u1' }, 'u2', false)).toBe(false);
    expect(canRemoveItem({ addedBy: null }, 'u2', true)).toBe(true);
    expect(canRemoveItem({ addedBy: null }, null, true)).toBe(false);
  });
});

describe('tmdbPathFromImageUrl', () => {
  it('strips the TMDb prefix and keeps raw paths', () => {
    expect(tmdbPathFromImageUrl('https://image.tmdb.org/t/p/w342/abc.jpg')).toBe('/abc.jpg');
    expect(tmdbPathFromImageUrl('/abc.jpg')).toBe('/abc.jpg');
    expect(tmdbPathFromImageUrl('https://other.example/x.jpg')).toBeNull();
    expect(tmdbPathFromImageUrl(undefined)).toBeNull();
  });
});
