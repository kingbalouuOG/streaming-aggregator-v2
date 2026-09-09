import { describe, it, expect } from 'vitest';
import { semanticRetrieval, type SemanticCandidateMeta } from '../semanticCore';

/**
 * Review 2026-09-09-001, engine follow-up: the `released` floor is pushed
 * into match_titles_by_vector (migration 082) instead of only being
 * post-filtered over whatever the unfiltered pool happened to contain.
 */

interface Call { fn: string; args: Record<string, unknown> }

function row(tmdb_id: number, release_year: number) {
  return {
    tmdb_id, media_type: 'movie', title: `T${tmdb_id}`, release_year,
    genre_ids: [18], original_language: 'en', poster_path: null,
    backdrop_path: null, vote_average: 7, vote_count: 500, popularity: 10,
    runtime: 100, embedding: null,
  };
}

/**
 * @param rpc decides what each RPC call returns, so a test can make the
 *            three-argument form fail the way an un-migrated database does.
 */
function stubClient(
  calls: Call[],
  rpc: (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null },
  rows: ReturnType<typeof row>[],
) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(rpc(args));
    },
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            in(_column: string, _values: readonly unknown[]) {
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

const matchedOk = (ids: number[]) => ({
  data: ids.map((id) => ({ tmdb_id: id, media_type: 'movie', distance: 0.2 })),
  error: null,
});

const embedding = [0.1, 0.2, 0.3];

describe('semanticRetrieval: release floor push-down', () => {
  it('sends min_release_year to the RPC when a floor is set', async () => {
    const calls: Call[] = [];
    const client = stubClient(calls, () => matchedOk([1, 2]), [row(1, 2026), row(2, 2025)]);

    await semanticRetrieval(client, embedding, null, null, {
      candidateLimit: 150,
      minReleaseYear: 2025,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('match_titles_by_vector');
    expect(calls[0].args.min_release_year).toBe(2025);
    expect(calls[0].args.match_limit).toBe(150);
  });

  it('omits the argument entirely when no floor is set', async () => {
    const calls: Call[] = [];
    const client = stubClient(calls, () => matchedOk([1]), [row(1, 1998)]);

    await semanticRetrieval(client, embedding, null, null, { candidateLimit: 150 });

    expect(calls).toHaveLength(1);
    expect('min_release_year' in calls[0].args).toBe(false);
  });

  it('retries without the argument when the RPC does not have it yet', async () => {
    const calls: Call[] = [];
    // An un-migrated database: PostgREST resolves by argument name, so the
    // three-argument call fails outright rather than ignoring the extra.
    const client = stubClient(
      calls,
      (args) =>
        'min_release_year' in args
          ? { data: null, error: { message: 'function public.match_titles_by_vector(...) does not exist' } }
          : matchedOk([1, 2]),
      [row(1, 2026), row(2, 1998)],
    );

    const post = (m: SemanticCandidateMeta) => (m.release_year ?? 0) >= 2025;
    const out = await semanticRetrieval(client, embedding, null, post, {
      candidateLimit: 150,
      minReleaseYear: 2025,
    });

    expect(calls).toHaveLength(2);
    expect('min_release_year' in calls[1].args).toBe(false);
    // The post-filter is what holds the floor on the fallback path.
    expect(out.map((c) => c.meta.tmdb_id)).toEqual([1]);
  });

  it('gives up when the retry fails too', async () => {
    const calls: Call[] = [];
    const client = stubClient(calls, () => ({ data: null, error: { message: 'down' } }), []);

    const out = await semanticRetrieval(client, embedding, null, null, {
      minReleaseYear: 2025,
    });

    expect(calls).toHaveLength(2);
    expect(out).toEqual([]);
  });

  it('does not retry when there was no floor to drop', async () => {
    const calls: Call[] = [];
    const client = stubClient(calls, () => ({ data: null, error: { message: 'down' } }), []);

    await semanticRetrieval(client, embedding, null, null, {});

    expect(calls).toHaveLength(1);
  });

  it('keeps the post-filter as a no-op safety once the push-down works', async () => {
    const calls: Call[] = [];
    // The RPC now returns only rows at or above the floor, so the caller's
    // post-filter removes nothing — and must still not remove anything.
    const client = stubClient(calls, () => matchedOk([1, 2]), [row(1, 2026), row(2, 2025)]);

    const post = (m: SemanticCandidateMeta) => (m.release_year ?? 0) >= 2025;
    const out = await semanticRetrieval(client, embedding, null, post, {
      minReleaseYear: 2025,
    });

    expect(out.map((c) => c.meta.tmdb_id).sort()).toEqual([1, 2]);
  });

});
