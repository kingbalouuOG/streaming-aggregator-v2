/**
 * Tests for dedupeInteractionsByIdentity (A4 / roadmap 0.5).
 *
 * The dedup rule is the integrity fix for the skewed-vector incident:
 * repeated events of the same (content_id, media_type, event_type) must
 * collapse to a single, latest occurrence before the taste replay.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect } from 'vitest';
import { dedupeInteractionsByIdentity } from '../interactionUpdate.ts';

type Row = {
  content_id: number | null;
  media_type: string | null;
  event_type: string;
  created_at: string | null;
  metadata?: unknown;
};

const row = (
  content_id: number | null,
  media_type: string | null,
  event_type: string,
  created_at: string | null,
  metadata?: unknown,
): Row => ({ content_id, media_type, event_type, created_at, metadata });

describe('dedupeInteractionsByIdentity', () => {
  it('collapses repeated identical events to one (the mark-watched ×4 incident)', () => {
    const rows = [
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z'),
      row(603, 'movie', 'watched', '2026-07-01T10:00:01Z'),
      row(603, 'movie', 'watched', '2026-07-01T10:00:02Z'),
      row(603, 'movie', 'watched', '2026-07-01T10:00:03Z'),
    ];
    const out = dedupeInteractionsByIdentity(rows);
    expect(out).toHaveLength(1);
  });

  it('keeps the LATEST occurrence by created_at', () => {
    const rows = [
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z', { tag: 'first' }),
      row(603, 'movie', 'watched', '2026-07-03T10:00:00Z', { tag: 'latest' }),
      row(603, 'movie', 'watched', '2026-07-02T10:00:00Z', { tag: 'middle' }),
    ];
    const out = dedupeInteractionsByIdentity(rows);
    expect(out).toHaveLength(1);
    expect(out[0].created_at).toBe('2026-07-03T10:00:00Z');
    expect(out[0].metadata).toEqual({ tag: 'latest' });
  });

  it('keeps distinct event_types on the same title separate (thumbs_up + watched still sum)', () => {
    const rows = [
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z'),
      row(603, 'movie', 'thumbs_up', '2026-07-01T10:00:05Z'),
    ];
    const out = dedupeInteractionsByIdentity(rows);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((r) => r.event_type))).toEqual(new Set(['watched', 'thumbs_up']));
  });

  it('keeps the same event_type on different titles separate', () => {
    const rows = [
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z'),
      row(604, 'movie', 'watched', '2026-07-01T10:00:00Z'),
      row(603, 'tv', 'watched', '2026-07-01T10:00:00Z'),
    ];
    const out = dedupeInteractionsByIdentity(rows);
    // (603,movie), (604,movie), (603,tv) are three distinct identities —
    // media_type is part of the key, so movie 603 ≠ tv 603.
    expect(out).toHaveLength(3);
  });

  it('a single event and four duplicates dedupe to the same shape', () => {
    const one = dedupeInteractionsByIdentity([row(603, 'movie', 'watched', '2026-07-01T10:00:00Z')]);
    const four = dedupeInteractionsByIdentity([
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z'),
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z'),
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z'),
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z'),
    ]);
    expect(four).toHaveLength(one.length);
    expect(four).toHaveLength(1);
  });

  it('passes rows with null content_id/media_type through untouched', () => {
    const rows = [
      row(null, null, 'search', '2026-07-01T10:00:00Z'),
      row(null, null, 'search', '2026-07-01T10:00:01Z'),
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z'),
    ];
    const out = dedupeInteractionsByIdentity(rows);
    // Both null rows survive (not deduped), plus the one watched identity.
    expect(out).toHaveLength(3);
    expect(out.filter((r) => r.content_id === null)).toHaveLength(2);
  });

  it('treats a null created_at as oldest so a timestamped repeat wins', () => {
    const rows = [
      row(603, 'movie', 'watched', null, { tag: 'null-date' }),
      row(603, 'movie', 'watched', '2026-07-01T10:00:00Z', { tag: 'dated' }),
    ];
    const out = dedupeInteractionsByIdentity(rows);
    expect(out).toHaveLength(1);
    expect(out[0].metadata).toEqual({ tag: 'dated' });
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeInteractionsByIdentity([])).toEqual([]);
  });
});
