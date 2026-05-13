// FilterState — canonical filter shape for Phase Search V2.
//
// Adopted app-wide as of A2; FilterSheet re-exports the type so legacy
// import paths keep compiling.
//
// UK content rating axis is intentionally omitted — dropped from
// Phase 1 per the kickoff-brief H7 resolution (no compliance pressure,
// data spans UK/US/MPAA/TV schemas with no clean mapping). Add back
// in a later phase if parental controls or a real user need surfaces.

import type { ServiceId } from "../../components/platformLogos";

// ─── Types ────────────────────────────────────────────────────────

export type ContentType = "all" | "movie" | "tv" | "doc";
export type Cost = "all" | "free" | "rent" | "buy";
export type Runtime = "any" | "under_60" | "60_120" | "over_120";
export type ShowWatched = "all" | "hide" | "only";

export interface FilterState {
  services: ServiceId[];
  contentType: ContentType;
  cost: Cost;
  runtime: Runtime;
  genres: string[];
  minRating: number;
  showWatched: ShowWatched;
  languages: string[];
  onlyOnMyServices: boolean;
}

const CONTENT_TYPES: readonly ContentType[] = ["all", "movie", "tv", "doc"];
const COSTS: readonly Cost[] = ["all", "free", "rent", "buy"];
const RUNTIMES: readonly Runtime[] = ["any", "under_60", "60_120", "over_120"];
const SHOW_WATCHED: readonly ShowWatched[] = ["all", "hide", "only"];

// ─── Defaults ─────────────────────────────────────────────────────

/**
 * Build the default state for a user. All connected services start
 * pre-selected (opt-out, not opt-in). `onlyOnMyServices` defaults true
 * per design brief §3.6 — the pinned toggle at the top of the sheet.
 */
export function defaultFor(userServices: readonly ServiceId[]): FilterState {
  return {
    services: [...userServices],
    contentType: "all",
    cost: "all",
    runtime: "any",
    genres: [],
    minRating: 0,
    showWatched: "all",
    languages: [],
    onlyOnMyServices: true,
  };
}

/**
 * True when `state` matches the default for the given user services.
 * Drives whether the results-page active-filter strip renders.
 */
export function isDefault(state: FilterState, userServices: readonly ServiceId[]): boolean {
  return (
    state.contentType === "all" &&
    state.cost === "all" &&
    state.runtime === "any" &&
    state.minRating === 0 &&
    state.showWatched === "all" &&
    state.onlyOnMyServices === true &&
    state.genres.length === 0 &&
    state.languages.length === 0 &&
    sameSet(state.services, userServices)
  );
}

// ─── URL serialisation ────────────────────────────────────────────

// Only non-default values are emitted; defaults stay out of the URL so
// the visible string tracks what the user has actually changed.
//
// Keys (per design brief §5):
//   services  · type    · cost   · runtime
//   genre     · decade  · min    · watched
//   lang      · mine    (0 when onlyOnMyServices=false; omitted otherwise)

export function serialize(state: FilterState, userServices: readonly ServiceId[]): URLSearchParams {
  const params = new URLSearchParams();
  if (!sameSet(state.services, userServices)) {
    params.set("services", [...state.services].sort().join(","));
  }
  if (state.contentType !== "all") params.set("type", state.contentType);
  if (state.cost !== "all") params.set("cost", state.cost);
  if (state.runtime !== "any") params.set("runtime", state.runtime);
  if (state.genres.length > 0) params.set("genre", [...state.genres].map(slug).sort().join(","));
  if (state.minRating > 0) params.set("min", state.minRating.toFixed(1));
  if (state.showWatched !== "all") params.set("watched", state.showWatched);
  if (state.languages.length > 0) params.set("lang", [...state.languages].map(slug).sort().join(","));
  if (state.onlyOnMyServices === false) params.set("mine", "0");
  return params;
}

export function deserialize(
  params: URLSearchParams,
  userServices: readonly ServiceId[],
  genreCatalogue: readonly string[],
  languageCatalogue: readonly string[],
): FilterState {
  const base = defaultFor(userServices);

  const services = params.get("services");
  if (services !== null) {
    base.services = services.split(",").filter((s): s is ServiceId => isServiceId(s));
  }

  const type = params.get("type");
  if (type && CONTENT_TYPES.includes(type as ContentType)) base.contentType = type as ContentType;

  const cost = params.get("cost");
  if (cost && COSTS.includes(cost as Cost)) base.cost = cost as Cost;

  const runtime = params.get("runtime");
  if (runtime && RUNTIMES.includes(runtime as Runtime)) base.runtime = runtime as Runtime;

  const genre = params.get("genre");
  if (genre) base.genres = unslugAgainst(genre.split(","), genreCatalogue);

  const min = params.get("min");
  if (min) {
    const n = Number.parseFloat(min);
    if (Number.isFinite(n) && n >= 0 && n <= 10) base.minRating = Math.round(n * 10) / 10;
  }

  const watched = params.get("watched");
  if (watched && SHOW_WATCHED.includes(watched as ShowWatched)) base.showWatched = watched as ShowWatched;

  const lang = params.get("lang");
  if (lang) base.languages = unslugAgainst(lang.split(","), languageCatalogue);

  if (params.get("mine") === "0") base.onlyOnMyServices = false;

  return base;
}

// ─── Hash (for impression metadata) ───────────────────────────────

/**
 * Stable 32-bit FNV-1a hash of the filter state. Hex-encoded. Sort
 * arrays before hashing so irrelevant key-order changes don't shift
 * the hash — round-trip stability is what `filter_set_hash` in
 * `card_impressions.metadata` relies on.
 */
export function hash(state: FilterState): string {
  const canonical = JSON.stringify({
    services: [...state.services].sort(),
    contentType: state.contentType,
    cost: state.cost,
    runtime: state.runtime,
    genres: [...state.genres].sort(),
    minRating: state.minRating,
    showWatched: state.showWatched,
    languages: [...state.languages].sort(),
    onlyOnMyServices: state.onlyOnMyServices,
  });
  return fnv1a(canonical);
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ─── Small helpers ────────────────────────────────────────────────

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set<T>(a);
  for (const v of b) if (!set.has(v)) return false;
  return true;
}

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "-");
}

function unslugAgainst(slugs: readonly string[], catalogue: readonly string[]): string[] {
  const slugToOriginal = new Map(catalogue.map((c) => [slug(c), c]));
  return slugs.map((s) => slugToOriginal.get(s)).filter((v): v is string => v !== undefined);
}

const SERVICE_IDS: readonly string[] = [
  "netflix", "prime", "apple", "disney", "now", "skygo", "paramount", "bbc", "itvx", "channel4",
];

function isServiceId(v: string): v is ServiceId {
  return SERVICE_IDS.includes(v);
}
