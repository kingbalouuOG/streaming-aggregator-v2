/**
 * Incoming deep-link query guard (IN-DEP-001).
 *
 * Expo Router parses an incoming link's query with query-string 7, which
 * decodes through decode-uri-component 0.2.2. When native
 * decodeURIComponent throws on malformed percent-encoding, that package
 * falls back to a decoder that is super-linear in the input
 * (GHSA-vcc3-ghjq-m6fr): ~1.5 KB of `%FF` in a `videx://` query blocked
 * parsing for 25 s in Node. Any web page or app can open a `videx://`
 * link, so this is reachable from untrusted input.
 *
 * There is no dependency fix to take: expo-router 56, 57 and 58 all pin
 * query-string ^7.1.3, and the patched decode-uri-component 0.5.0 is
 * ESM-only, so it cannot be pinned under query-string 7 via overrides.
 *
 * The slow path only runs when native decoding fails, so a query that
 * decodes natively is safe at any length. A query that does not is
 * dropped, keeping the route. No link Videx issues carries malformed
 * encoding (reset links are hex token_hash + type).
 */
export function stripMalformedQuery(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  try {
    // Literal `&` / `=` cannot split a %XX triplet, so the whole query
    // decodes iff every key and value query-string decodes does.
    decodeURIComponent(url.slice(q + 1));
    return url;
  } catch {
    return url.slice(0, q);
  }
}
