// useFilterUrlSync — keeps the search-page filter state in sync with
// `window.location.hash`.
//
// On first mount: reads the URL hash, parses it via `deserialize`, and
// pushes the result through `onFiltersChange` so a deep link or back-
// button navigation restores prior filters.
//
// On subsequent filter changes: serialises and replaces the hash. We
// use `history.replaceState` (not `pushState`) so filter tweaks don't
// flood the back stack; the back button takes the user one tab back,
// not one chip back.
//
// Hash format: `#search?services=netflix&type=movie&...`. The `search?`
// prefix scopes the persisted state to this surface so other tabs are
// free to use the hash for their own purposes later without collision.

import { useEffect, useRef } from "react";
import type { ServiceId } from "@/components/platformLogos";
import type { FilterState } from "@/lib/search/filterState";
import { deserialize, hash as hashState, serialize } from "@/lib/search/filterState";

const HASH_PREFIX = "search?";

interface Options {
  /** Genre catalogue — for slug → original-name decoding on hydrate. */
  genres: readonly string[];
  /** Language catalogue — same role. */
  languages: readonly string[];
  /** True while the host page is mounted; gates writes so a non-Browse
   *  tab can't clobber the hash. */
  enabled: boolean;
}

export function useFilterUrlSync(
  filters: FilterState,
  onFiltersChange: (next: FilterState) => void,
  userServices: readonly ServiceId[],
  options: Options,
): void {
  const { genres, languages, enabled } = options;
  const hydratedRef = useRef(false);
  const lastWrittenHashRef = useRef<string | null>(null);

  // Hydrate from hash on first mount.
  useEffect(() => {
    if (!enabled || hydratedRef.current) return;
    hydratedRef.current = true;

    const raw = window.location.hash.replace(/^#/, "");
    if (!raw.startsWith(HASH_PREFIX)) return;

    const params = new URLSearchParams(raw.slice(HASH_PREFIX.length));
    if (params.toString() === "") return;

    const restored = deserialize(params, userServices, genres, languages);
    onFiltersChange(restored);
    lastWrittenHashRef.current = hashState(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Mirror live state to hash. Gated on hydration so the read-from-
  // hash flow doesn't immediately echo back the same value.
  useEffect(() => {
    if (!enabled || !hydratedRef.current) return;

    const next = hashState(filters);
    if (next === lastWrittenHashRef.current) return;

    const params = serialize(filters, userServices);
    const serialised = params.toString();
    const newHash = serialised ? `#${HASH_PREFIX}${serialised}` : "";
    if (newHash === window.location.hash) return;

    const url = `${window.location.pathname}${window.location.search}${newHash}`;
    window.history.replaceState(window.history.state, "", url);
    lastWrittenHashRef.current = next;
  }, [filters, enabled, userServices, genres, languages]);
}
