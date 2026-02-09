// ── Central Platform Configuration ──────────────────────────────────
// All 10 streaming platforms with their logo assets and metadata.

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
    name: "Netflix",
    description: "Movies & Series",
    logo: imgNetflix,
    bg: "bg-red-600",
    label: "N",
    selectedBorder: "border-red-500",
    ring: "ring-red-500",
  },
  {
    id: "prime",
    name: "Prime Video",
    description: "Amazon Originals",
    logo: imgPrime,
    bg: "bg-sky-700",
    label: "P",
    selectedBorder: "border-sky-500",
    ring: "ring-sky-400",
  },
  {
    id: "apple",
    name: "Apple TV+",
    description: "Apple Originals",
    logo: imgApple,
    bg: "bg-gray-800",
    label: "tv",
    selectedBorder: "border-gray-400",
    ring: "ring-gray-400",
  },
  {
    id: "disney",
    name: "Disney+",
    description: "Disney, Marvel, Star Wars",
    logo: imgDisney,
    bg: "bg-blue-800",
    label: "D+",
    selectedBorder: "border-blue-500",
    ring: "ring-blue-500",
  },
  {
    id: "now",
    name: "NOW",
    description: "Sky Cinema & HBO",
    logo: imgNow,
    bg: "bg-teal-700",
    label: "NOW",
    selectedBorder: "border-teal-400",
    ring: "ring-teal-400",
  },
  {
    id: "skygo",
    name: "Sky Go",
    description: "Live TV & Sky Originals",
    logo: imgSkyGo,
    bg: "bg-sky-600",
    label: "Sky",
    selectedBorder: "border-sky-400",
    ring: "ring-sky-400",
  },
  {
    id: "paramount",
    name: "Paramount+",
    description: "CBS & Paramount",
    logo: imgParamount,
    bg: "bg-blue-600",
    label: "P+",
    selectedBorder: "border-blue-400",
    ring: "ring-blue-400",
  },
  {
    id: "bbc",
    name: "BBC iPlayer",
    description: "BBC Originals & Live",
    logo: imgBBC,
    bg: "bg-pink-800",
    label: "BBC",
    selectedBorder: "border-pink-400",
    ring: "ring-pink-400",
  },
  {
    id: "itvx",
    name: "ITVX",
    description: "ITV Originals & Live",
    logo: imgITVX,
    bg: "bg-lime-500",
    label: "ITV",
    selectedBorder: "border-lime-400",
    ring: "ring-lime-400",
  },
  {
    id: "channel4",
    name: "Channel 4",
    description: "Channel 4 & Film4",
    logo: imgChannel4,
    bg: "bg-lime-300",
    label: "4",
    selectedBorder: "border-lime-300",
    ring: "ring-lime-300",
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
