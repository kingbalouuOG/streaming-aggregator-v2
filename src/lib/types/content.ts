/**
 * Canonical content/service types (NATIVE-1 W2).
 *
 * ServiceId and ContentItem were defined in src/components
 * (platformLogos.ts, ContentCard.tsx) and type-imported by ~14 lib
 * modules — a lib→components boundary violation (CONVENTIONS: lib has
 * no React) that broke type-checking the shared tree from native/.
 * The definitions now live here; the component files re-export them so
 * component-side imports are unchanged. Lib modules import from here.
 */

// ── Service ID type ─────────────────────────────────────────────────
export type ServiceId =
  | "netflix"
  | "prime"
  | "apple"
  | "disney"
  | "now"
  | "skygo"
  | "paramount"
  | "bbc"
  | "itvx"
  | "channel4";

/** Display names — single source for UI labels and lib copy (e.g.
 *  active-filter pills). platformLogos.ts builds PLATFORMS from this. */
export const SERVICE_DISPLAY_NAMES: Record<ServiceId, string> = {
  netflix: "Netflix",
  prime: "Prime Video",
  apple: "Apple TV+",
  disney: "Disney+",
  now: "NOW",
  skygo: "Sky Go",
  paramount: "Paramount+",
  bbc: "BBC iPlayer",
  itvx: "ITVX",
  channel4: "Channel 4",
};

// ── Content item — the UI-facing title shape ────────────────────────
export interface ContentItem {
  id: string;
  title: string;
  image: string;
  /** TMDb backdrop URL (16:9). Optional — set by contentAdapter from
   *  the upstream `backdrop_path`. Used by the WideCard variant. */
  backdrop?: string;
  services: ServiceId[];
  rating?: number;
  year?: number;
  type?: "movie" | "tv" | "doc";
  matchPercentage?: number;
  runtime?: number;
  addedAt?: number;
  genre?: string;
  /** Plot synopsis from TMDb. Used as a stopgap standfirst on the
   *  MagazineHero until editorial copy lands (IN-V3-001). */
  overview?: string;
  language?: string;
  genreIds?: number[];
  originalLanguage?: string;
  popularity?: number;
  voteCount?: number;
  /** ENG-1 Workstream C: true for exploration-slot picks in Recommended
   *  For You. ContentRow writes it into card_impressions.metadata so
   *  ENG-2 can measure exploration CTR separately. No visual treatment. */
  exploration?: boolean;
}
