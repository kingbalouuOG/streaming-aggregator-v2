// ── Central Platform Configuration ──────────────────────────────────
// All 15 streaming platforms with their logo assets and metadata.
// Logo tiles are the TMDb/JustWatch provider images (200x200 RGBA), the
// same source and size as the original ten.

import imgNetflix from "@/assets/netflix.png";
import imgPrime from "@/assets/prime.png";
import imgApple from "@/assets/apple.png";
import imgDisney from "@/assets/disney.png";
import imgNow from "@/assets/now.png";
import imgSkyGo from "@/assets/skygo.png";
import imgParamount from "@/assets/paramount.png";
import imgBBC from "@/assets/bbc.png";
import imgITVX from "@/assets/itvx.png";
import imgChannel4 from "@/assets/channel4.png";
import imgHBO from "@/assets/hbo.png";
import imgDiscovery from "@/assets/discovery.png";
import imgCrunchyroll from "@/assets/crunchyroll.png";
import imgMUBI from "@/assets/mubi.png";
import imgPlutoTV from "@/assets/plutotv.png";

// ── Service ID type ─────────────────────────────────────────────────
// Canonical definition moved to @/lib/types/content (NATIVE-1 W2) so
// lib modules stop type-importing from components. Re-exported here so
// existing component-side imports keep working.
import { SERVICE_DISPLAY_NAMES, type ServiceId } from "@/lib/types/content";

export type { ServiceId } from "@/lib/types/content";

// ── Platform definition ─────────────────────────────────────────────
export interface PlatformDef {
  id: ServiceId;
  name: string;
  description: string;
  logo: string;
  /** Fallback background used in filter circles / onboarding when no logo */
  bg: string;
  /** Fallback single-letter label */
  label: string;
  /** Border color when selected in filters */
  selectedBorder: string;
  /** Ring color for profile badges */
  ring: string;
}

// ── All platforms in display order ──────────────────────────────────
export const PLATFORMS: PlatformDef[] = [
  {
    id: "netflix",
    name: SERVICE_DISPLAY_NAMES.netflix,
    description: "Movies & Series",
    logo: imgNetflix,
    bg: "bg-red-600",
    label: "N",
    selectedBorder: "border-red-500",
    ring: "ring-red-500",
  },
  {
    id: "prime",
    name: SERVICE_DISPLAY_NAMES.prime,
    description: "Amazon Originals",
    logo: imgPrime,
    bg: "bg-sky-700",
    label: "P",
    selectedBorder: "border-sky-500",
    ring: "ring-sky-400",
  },
  {
    id: "apple",
    name: SERVICE_DISPLAY_NAMES.apple,
    description: "Apple Originals",
    logo: imgApple,
    bg: "bg-gray-800",
    label: "tv",
    selectedBorder: "border-gray-400",
    ring: "ring-gray-400",
  },
  {
    id: "disney",
    name: SERVICE_DISPLAY_NAMES.disney,
    description: "Disney, Marvel, Star Wars",
    logo: imgDisney,
    bg: "bg-blue-800",
    label: "D+",
    selectedBorder: "border-blue-500",
    ring: "ring-blue-500",
  },
  {
    id: "now",
    name: SERVICE_DISPLAY_NAMES.now,
    description: "Sky Cinema & HBO",
    logo: imgNow,
    bg: "bg-teal-700",
    label: "NOW",
    selectedBorder: "border-teal-400",
    ring: "ring-teal-400",
  },
  {
    id: "skygo",
    name: SERVICE_DISPLAY_NAMES.skygo,
    description: "Live TV & Sky Originals",
    logo: imgSkyGo,
    bg: "bg-sky-600",
    label: "Sky",
    selectedBorder: "border-sky-400",
    ring: "ring-sky-400",
  },
  {
    id: "paramount",
    name: SERVICE_DISPLAY_NAMES.paramount,
    description: "CBS & Paramount",
    logo: imgParamount,
    bg: "bg-blue-600",
    label: "P+",
    selectedBorder: "border-blue-400",
    ring: "ring-blue-400",
  },
  {
    id: "bbc",
    name: SERVICE_DISPLAY_NAMES.bbc,
    description: "BBC Originals & Live",
    logo: imgBBC,
    bg: "bg-pink-800",
    label: "BBC",
    selectedBorder: "border-pink-400",
    ring: "ring-pink-400",
  },
  {
    id: "itvx",
    name: SERVICE_DISPLAY_NAMES.itvx,
    description: "ITV Originals & Live",
    logo: imgITVX,
    bg: "bg-lime-500",
    label: "ITV",
    selectedBorder: "border-lime-400",
    ring: "ring-lime-400",
  },
  {
    id: "channel4",
    name: SERVICE_DISPLAY_NAMES.channel4,
    description: "Channel 4 & Film4",
    logo: imgChannel4,
    bg: "bg-lime-300",
    label: "4",
    selectedBorder: "border-lime-300",
    ring: "ring-lime-300",
  },
  {
    id: "hbo",
    name: SERVICE_DISPLAY_NAMES.hbo,
    description: "HBO, Max Originals & DC",
    logo: imgHBO,
    bg: "bg-purple-700",
    label: "MAX",
    selectedBorder: "border-purple-500",
    ring: "ring-purple-500",
  },
  {
    id: "discovery",
    name: SERVICE_DISPLAY_NAMES.discovery,
    description: "Factual & Real-Life",
    logo: imgDiscovery,
    bg: "bg-blue-700",
    label: "D+",
    selectedBorder: "border-blue-500",
    ring: "ring-blue-500",
  },
  {
    id: "crunchyroll",
    name: SERVICE_DISPLAY_NAMES.crunchyroll,
    description: "Anime & Simulcasts",
    logo: imgCrunchyroll,
    bg: "bg-orange-600",
    label: "CR",
    selectedBorder: "border-orange-500",
    ring: "ring-orange-500",
  },
  {
    id: "mubi",
    name: SERVICE_DISPLAY_NAMES.mubi,
    description: "Curated Arthouse Cinema",
    logo: imgMUBI,
    bg: "bg-indigo-900",
    label: "M",
    selectedBorder: "border-indigo-500",
    ring: "ring-indigo-500",
  },
  {
    id: "plutotv",
    name: SERVICE_DISPLAY_NAMES.plutotv,
    description: "Free, Ad-Supported",
    logo: imgPlutoTV,
    bg: "bg-yellow-400",
    label: "PL",
    selectedBorder: "border-yellow-300",
    ring: "ring-yellow-300",
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────
const platformMap = new Map<string, PlatformDef>(
  PLATFORMS.map((p) => [p.id, p])
);

export function getPlatform(id: string): PlatformDef | undefined {
  return platformMap.get(id);
}

export function getPlatformLogo(id: string): string | undefined {
  return platformMap.get(id)?.logo;
}

export function getPlatformName(id: string): string {
  return platformMap.get(id)?.name ?? id;
}

/** Service labels map for backward compat */
export const serviceLabels: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.name])
);
