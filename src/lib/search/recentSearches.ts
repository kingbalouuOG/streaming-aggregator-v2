/**
 * Recent searches — local-storage layer for the Phase Search V2
 * empty-state recents list.
 *
 * Surface: up to 5 entries (UI cap). Storage: up to 20 (so the list
 * survives mild churn without losing earlier queries the user might
 * scroll/expand to later — Phase 1 only renders 5, but the cap is
 * 20-deep so a future "see all" surface can use the same store).
 *
 * Dedupe is case-insensitive — searching "Saltburn" then "saltburn"
 * is the same entry, with the new case displayed (most-recent wins).
 *
 * No syncing across devices. Phase 3 (search-as-signal) will revisit
 * this with a per-account store in Supabase.
 */

const KEY = 'videx_recent_searches';
const MAX = 20;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch {
    return [];
  }
}

function write(values: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(values.slice(0, MAX)));
  } catch {
    // Quota / storage disabled — drop silently. The list is non-load-
    // bearing and a missing entry next session is an acceptable failure.
  }
}

/** All recent entries, most-recent first. */
export function getRecentSearches(): string[] {
  return read();
}

/**
 * Push a query to the front of the list. Empty / whitespace-only
 * queries are ignored. Dedupe is case-insensitive but the new entry's
 * casing replaces any prior — so a user who searches "lord of the
 * rings" then later "Lord of the Rings" sees the latter.
 */
export function addRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const lowered = trimmed.toLowerCase();
  const existing = read();
  const filtered = existing.filter((s) => s.toLowerCase() !== lowered);
  write([trimmed, ...filtered]);
}

export function removeRecentSearch(query: string): void {
  const lowered = query.toLowerCase();
  const existing = read();
  write(existing.filter((s) => s.toLowerCase() !== lowered));
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
