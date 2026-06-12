/**
 * TMDb image URL builders — pure string helpers, no client, no env.
 *
 * Extracted from tmdb.ts in PLAT-3 W1: the engine tree (titleAdapter,
 * semantic search) needs these, and importing them via tmdb.ts dragged
 * the whole axios client + module-scope `import.meta.env` read into the
 * videx-api Worker bundle, crashing module init off-Vite. tmdb.ts
 * re-exports them, so existing client callers are unaffected.
 */

export const buildImageUrl = (path: string | null, size = 'w500'): string | null => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export const buildPosterUrl = (path: string | null, size = 'w342') => buildImageUrl(path, size);
export const buildBackdropUrl = (path: string | null, size = 'w1280') => buildImageUrl(path, size);
export const buildLogoUrl = (path: string | null, size = 'w92') => buildImageUrl(path, size);
