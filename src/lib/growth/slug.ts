/**
 * Title URL slugs (Growth G0-4, ADR-015).
 *
 * The canonical title URL is /t/{movie|tv}/{tmdbId}-{slug}. The slug is
 * cosmetic: the Worker resolves by type and id only and 301s a bare or
 * stale slug to this form, so there is no slug column and no collision
 * policy. Same shape as buildChannel4Slug in src/lib/deepLinks.ts, plus
 * ASCII folding and a length cap.
 *
 * Pure, imported by the Worker and the native share button.
 */

export const TITLE_SLUG_MAX = 80;

export const CANONICAL_ORIGIN = 'https://videxstreaming.com';

// Letters NFKD leaves whole. Everything else non-ASCII becomes a hyphen.
const FOLD: Record<string, string> = {
  ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', þ: 'th', ð: 'd',
};

/**
 * "The Matrix", 1999 -> "the-matrix-1999". Lowercase, accents folded,
 * runs of anything outside [a-z0-9] collapsed to one hyphen, trimmed,
 * "-year" appended when present, at most 80 characters (the title part is
 * cut, never the year). A title with no ASCII letters or digits yields ""
 * and the canonical URL is then the bare id.
 */
export function titleSlug(title: string, year?: number | null): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ßæœøđłþð]/g, (ch) => FOLD[ch] ?? '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return '';
  const suffix = year && Number.isInteger(year) && year > 0 ? `-${year}` : '';
  const cut = base.slice(0, TITLE_SLUG_MAX - suffix.length).replace(/-+$/, '');
  return `${cut}${suffix}`;
}

/** The {tmdbId}-{slug} path segment, or the bare id when the slug is empty. */
export function titleRef(tmdbId: number, title: string, year?: number | null): string {
  const slug = titleSlug(title, year);
  return slug ? `${tmdbId}-${slug}` : String(tmdbId);
}

/** Canonical share URL for a title. */
export function titlePageUrl(
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  title: string,
  year?: number | null,
): string {
  return `${CANONICAL_ORIGIN}/t/${mediaType}/${titleRef(tmdbId, title, year)}`;
}

/**
 * Split a /t/ path segment into its id and slug suffix. Accepts "603" and
 * "603-the-matrix-1999"; anything not starting with digits is null.
 */
export function parseTitleRef(ref: string): { id: string; slug: string | null } | null {
  const m = /^(\d+)(?:-(.*))?$/.exec(ref);
  if (!m) return null;
  return { id: m[1], slug: m[2] ?? null };
}
