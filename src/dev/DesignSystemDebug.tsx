/**
 * Dev-only debug surfaces for the v3 editorial redesign.
 * Mounted via ?debug=<name> in App.tsx, gated on import.meta.env.DEV
 * so the entire branch (and the imports below) tree-shake out of
 * production bundles.
 *
 * Module is intentionally side-effect-free.
 */

import React from "react";
import {
  BookmarkIcon,
  BookmarkFilledIcon,
  CloseIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ExpandIcon,
  PlayFillIcon,
  SparkleIcon,
} from "../components/icons";
import { SectionHead } from "../components/SectionHead";
import { Kicker } from "../components/Kicker";
import { ContentCard, type ContentItem } from "../components/ContentCard";

const SAMPLE: ContentItem = {
  id: "movie-1",
  title: "The Brutalist",
  image: "https://image.tmdb.org/t/p/w500/o81mAlchcyLzcsIIcTvCERdEyL3.jpg",
  services: [],
  rating: 8.4,
  year: 2024,
  genre: "Drama",
};
const SAMPLE_LONG: ContentItem = {
  ...SAMPLE,
  id: "movie-2",
  title: "Everything Everywhere All at Once",
  rating: 8.0,
  year: 2022,
  genre: "Sci-Fi",
};

const ICONS = [
  ["BookmarkIcon", BookmarkIcon],
  ["BookmarkFilledIcon", BookmarkFilledIcon],
  ["CloseIcon", CloseIcon],
  ["ChevronRightIcon", ChevronRightIcon],
  ["ChevronDownIcon", ChevronDownIcon],
  ["ExpandIcon", ExpandIcon],
  ["PlayFillIcon", PlayFillIcon],
  ["SparkleIcon", SparkleIcon],
] as const;

export function IconsDebug() {
  return (
    <div className="editorial" style={{ paddingTop: 40, paddingBottom: 40, color: "var(--fg)" }}>
      <h1 className="t-headline" style={{ fontSize: "var(--t-headline)", marginBottom: 24 }}>
        v3 icons (Phase 0)
      </h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        {ICONS.map(([name, Icon]) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 16,
              background: "var(--surface-elev)",
              borderRadius: "var(--r-card)",
              border: "0.5px solid var(--hairline)",
            }}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span style={{ fontSize: "var(--t-meta)", color: "var(--fg-soft)" }}>{name}</span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24, fontSize: "var(--t-meta)", color: "var(--fg-faint)" }}>
        Dev-only route. Tree-shaken from production builds via{" "}
        <code>import.meta.env.DEV</code>.
      </p>
    </div>
  );
}

export function SectionHeadDebug() {
  return (
    <div className="editorial" style={{ paddingTop: 40, paddingBottom: 80, color: "var(--fg)" }}>
      {/* Default — orange kicker */}
      <SectionHead
        kicker="THE CHARTS"
        title="Trending across your stack."
        standfirst="What everyone's queueing tonight."
        right={
          <a
            href="#"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-meta)",
              color: "var(--fg-soft)",
              textDecoration: "none",
            }}
            onClick={(e) => e.preventDefault()}
          >
            See all →
          </a>
        }
      />

      <div style={{ height: 56 }} />

      {/* Service-tinted kicker via Kicker color override */}
      <header className="flex items-end justify-between gap-4 mb-3">
        <div className="min-w-0">
          <Kicker color="var(--svc-netflix)">NEW ON NETFLIX</Kicker>
          <h2
            className="mt-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-title)",
              fontWeight: 700,
              fontVariationSettings: '"opsz" 36',
              letterSpacing: "-0.01em",
              color: "var(--fg)",
              lineHeight: 1.15,
            }}
          >
            This week on Netflix.
          </h2>
        </div>
      </header>

      <div style={{ height: 56 }} />

      {/* Atmosphere-tinted kicker */}
      <header className="flex items-end justify-between gap-4 mb-3">
        <div className="min-w-0">
          <Kicker color="var(--atm-rose)">IN YOUR MOOD</Kicker>
          <h2
            className="mt-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-title)",
              fontWeight: 700,
              fontVariationSettings: '"opsz" 36',
              letterSpacing: "-0.01em",
              color: "var(--fg)",
              lineHeight: 1.15,
            }}
          >
            Slow-burn romance.
          </h2>
        </div>
      </header>

      <p style={{ marginTop: 56, fontSize: "var(--t-meta)", color: "var(--fg-faint)" }}>
        Dev-only route. Tree-shaken from production builds via{" "}
        <code>import.meta.env.DEV</code>.
      </p>
    </div>
  );
}

export function ContentCardDebug() {
  const [bookmarked, setBookmarked] = React.useState<Set<string>>(new Set());
  const toggle = (item: ContentItem) =>
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });

  return (
    <div className="editorial" style={{ paddingTop: 40, paddingBottom: 80, color: "var(--fg)" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-headline)",
          fontWeight: 600,
          fontVariationSettings: '"opsz" 48',
          marginBottom: 8,
        }}
      >
        ContentCard (Phase 1)
      </h1>
      <p style={{ fontSize: "var(--t-meta)", color: "var(--fg-soft)", marginBottom: 32 }}>
        Variants: default · wide · lead · mosaic
      </p>

      <Kicker>DEFAULT — 160</Kicker>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", marginTop: 8, marginBottom: 32, paddingBottom: 4 }}>
        <ContentCard item={SAMPLE} bookmarked={bookmarked.has(SAMPLE.id)} onToggleBookmark={toggle} />
        <ContentCard item={SAMPLE_LONG} bookmarked={bookmarked.has(SAMPLE_LONG.id)} onToggleBookmark={toggle} />
        <ContentCard item={{ ...SAMPLE, id: "movie-3", rating: undefined }} watched bookmarked={false} onToggleBookmark={toggle} />
      </div>

      <Kicker>WIDE — 220</Kicker>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", marginTop: 8, marginBottom: 32, paddingBottom: 4 }}>
        <ContentCard item={SAMPLE} variant="wide" bookmarked={bookmarked.has(SAMPLE.id)} onToggleBookmark={toggle} />
        <ContentCard item={SAMPLE_LONG} variant="wide" bookmarked={bookmarked.has(SAMPLE_LONG.id)} onToggleBookmark={toggle} />
      </div>

      <Kicker>LEAD — 358 full-bleed</Kicker>
      <div style={{ marginTop: 8, marginBottom: 32 }}>
        <ContentCard item={SAMPLE} variant="lead" bookmarked={bookmarked.has(SAMPLE.id)} onToggleBookmark={toggle} />
      </div>

      <Kicker>MOSAIC — 2-col grid</Kicker>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginTop: 8, marginBottom: 32 }}>
        <ContentCard item={SAMPLE} variant="mosaic" bookmarked={bookmarked.has(SAMPLE.id)} onToggleBookmark={toggle} />
        <ContentCard item={SAMPLE_LONG} variant="mosaic" bookmarked={bookmarked.has(SAMPLE_LONG.id)} onToggleBookmark={toggle} />
      </div>

      <p style={{ marginTop: 56, fontSize: "var(--t-meta)", color: "var(--fg-faint)" }}>
        Dev-only route. Tree-shaken from production builds via{" "}
        <code>import.meta.env.DEV</code>.
      </p>
    </div>
  );
}
