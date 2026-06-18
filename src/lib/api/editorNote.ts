/**
 * Editor's note (§5.2 strip) — moved from useHomeContent.ts in
 * NATIVE-2 W2 so the native Home renders the same note through the
 * same module (ADR-014: copy nothing).
 */

import { supabase } from '../supabase';
import { env } from '../env';

/** Editor's note shape per Phase 6 migration 040. */
export interface EditorNote {
  id: string;
  kicker: string;
  teaser: string;
  body: string;
  publishedAt: string;
}

/** Fallback note when Supabase returns nothing (or the table doesn't
 *  exist yet locally). Keeps the §5.2 strip populated regardless of
 *  remote availability — same copy that App.tsx rendered inline
 *  before the hook was wired up. */
export const FALLBACK_NOTE: EditorNote = {
  id: 'fallback',
  kicker: "EDITOR'S NOTE",
  teaser:
    "A great prestige drama, three sci-fi misses, and the case for taking notes during the credits.",
  body:
    "A great prestige drama is rare in any year, and this week we have one. Three and a half hours of patient cinema that earns every minute — and a reminder that the streaming services still know how to platform serious work when they want to.\n\nElsewhere the sci-fi shelf is thin. Two of the three new high-concept releases stumble in the second act, and the third never finds a tone. Worth waiting on.\n\nThe case for credits: keep watching after the cut. The best gags this season are tucked into the typography.",
  publishedAt: new Date().toISOString(),
};

/** 24h — callers use this as the query staleTime. */
export const EDITOR_NOTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchEditorNote(): Promise<EditorNote | null> {
  // Migration 040 (editor_notes) lives in the repo but is not applied to
  // the remote project — `database.types.ts` therefore has no entry for
  // this table, and the .from('editor_notes') call needs to bypass the
  // generated schema types. A structural stub of the exact call chain is
  // used until the migration is applied; gracefully no-ops via the error
  // check below when the table is absent.
  const untypedFrom = supabase.from as unknown as (table: string) => {
    select: (columns: string) => {
      order: (column: string, opts: { ascending: boolean }) => {
        limit: (count: number) => {
          maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await untypedFrom('editor_notes')
    .select('id, kicker, teaser, body, published_at')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table may not exist yet on this Supabase project (migration not
    // applied locally). That's expected during the v3 redesign rollout
    // — fall back silently.
    if (env.DEV) {
      console.info('[editorNote] editor_notes unavailable:', error.message);
    }
    return null;
  }

  if (!data) return null;

  const row = data as {
    id: string;
    kicker: string;
    teaser: string | null;
    body: string;
    published_at: string;
  };
  return {
    id: row.id,
    kicker: row.kicker,
    teaser: row.teaser ?? row.body,
    body: row.body,
    publishedAt: row.published_at,
  };
}
