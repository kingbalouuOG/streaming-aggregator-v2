/**
 * Count-aware nouns for copy (IN-GR-045: one rule instead of an inline
 * `count === 1 ? 'title' : 'titles'` per caller).
 *
 * Pure: shared by the app, native and the Worker.
 */

/** `singular` for exactly 1, otherwise `plural` (default: singular + "s"). */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/** "1 title", "0 titles", "12 titles". */
export function countLabel(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralise(count, singular, plural)}`;
}
