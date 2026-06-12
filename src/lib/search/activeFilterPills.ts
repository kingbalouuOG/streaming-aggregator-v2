// activeFilterPills — derive the user-facing chip strip from a
// FilterState. Each entry knows how to remove just its own axis when
// the × is tapped, so the renderer (BrowsePage results header) stays
// dumb and just maps over the list.

import { defaultFor, type FilterState } from "@/lib/search/filterState";
import { SERVICE_DISPLAY_NAMES, type ServiceId } from "@/lib/types/content";

export interface ActiveFilterPillEntry {
  key: string;
  label: string;
  onRemove: () => void;
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set<T>(a);
  for (const v of b) if (!set.has(v)) return false;
  return true;
}

const CONTENT_TYPE_LABEL: Record<string, string> = {
  movie: "Movies",
  tv: "TV",
  doc: "Docs",
};

const RUNTIME_LABEL: Record<string, string> = {
  under_60: "Under 60 min",
  "60_120": "60–120 min",
  over_120: "120+ min",
};

const COST_LABEL: Record<string, string> = {
  free: "Free",
  rent: "Rent",
  buy: "Buy",
};

export function buildActiveFilterPills(
  filters: FilterState,
  userServices: readonly ServiceId[],
  onFiltersChange: (next: FilterState) => void,
): ActiveFilterPillEntry[] {
  const pills: ActiveFilterPillEntry[] = [];

  // Services — only count as "active" when the selected set differs
  // from the user's full service list (the default state).
  if (!sameSet(filters.services, userServices)) {
    const count = filters.services.length;
    let label: string;
    if (count === 0) {
      label = "No services";
    } else if (count === 1) {
      label = SERVICE_DISPLAY_NAMES[filters.services[0]] ?? "1 service";
    } else {
      label = `${count} services`;
    }
    pills.push({
      key: "services",
      label,
      onRemove: () => onFiltersChange({ ...filters, services: [...userServices] }),
    });
  }

  if (filters.contentType !== "all") {
    pills.push({
      key: "contentType",
      label: CONTENT_TYPE_LABEL[filters.contentType] ?? filters.contentType,
      onRemove: () => onFiltersChange({ ...filters, contentType: "all" }),
    });
  }

  if (filters.costs.length > 0) {
    const label = filters.costs.map((c) => COST_LABEL[c] ?? c).join(" · ");
    pills.push({
      key: "costs",
      label,
      onRemove: () => onFiltersChange({ ...filters, costs: [] }),
    });
  }

  if (filters.runtime !== "any") {
    pills.push({
      key: "runtime",
      label: RUNTIME_LABEL[filters.runtime] ?? filters.runtime,
      onRemove: () => onFiltersChange({ ...filters, runtime: "any" }),
    });
  }

  if (filters.genres.length > 0) {
    const label = filters.genres.length === 1
      ? filters.genres[0]
      : `${filters.genres[0]} +${filters.genres.length - 1}`;
    pills.push({
      key: "genres",
      label,
      onRemove: () => onFiltersChange({ ...filters, genres: [] }),
    });
  }

  if (filters.minRating > 0) {
    pills.push({
      key: "minRating",
      label: `${filters.minRating.toFixed(1)}+`,
      onRemove: () => onFiltersChange({ ...filters, minRating: 0 }),
    });
  }

  if (filters.showWatched !== "all") {
    pills.push({
      key: "showWatched",
      label: filters.showWatched === "hide" ? "Hide watched" : "Only watched",
      onRemove: () => onFiltersChange({ ...filters, showWatched: "all" }),
    });
  }

  if (filters.languages.length > 0) {
    const label = filters.languages.length === 1
      ? filters.languages[0]
      : `${filters.languages.length} languages`;
    pills.push({
      key: "languages",
      label,
      onRemove: () => onFiltersChange({ ...filters, languages: [] }),
    });
  }

  if (!filters.onlyOnMyServices) {
    pills.push({
      key: "onlyOnMyServices",
      label: "Off-services too",
      onRemove: () => onFiltersChange({ ...filters, onlyOnMyServices: true }),
    });
  }

  return pills;
}

/** Reset every axis. Equivalent to opening FilterSheet and tapping
 *  Clear all + Apply. */
export function clearAllActiveFilters(
  userServices: readonly ServiceId[],
  onFiltersChange: (next: FilterState) => void,
): void {
  onFiltersChange(defaultFor(userServices));
}
