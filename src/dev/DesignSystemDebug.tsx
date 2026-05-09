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
import { ServiceBadge, ServiceStack } from "../components/ServiceBadge";
import type { ServiceId } from "../components/platformLogos";
import { BottomNav } from "../components/BottomNav";
import { MagazineHero } from "../components/MagazineHero";
import { EditorsNote } from "../components/EditorsNote";
import { WideCard, type WideCardItem } from "../components/WideCard";

// Picsum gives a stable random poster per seed without auth/network policy
// pain — good enough for the debug surface, never reaches production.
const poster = (seed: string) => `https://picsum.photos/seed/${seed}/500/700`;

const SAMPLE: ContentItem = {
  id: "movie-1",
  title: "The Brutalist",
  image: poster("brutalist"),
  services: [],
  rating: 8.4,
  year: 2024,
  genre: "Drama",
};
const SAMPLE_LONG: ContentItem = {
  ...SAMPLE,
  id: "movie-2",
  title: "Everything Everywhere All at Once",
  image: poster("eeaao"),
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

export function MagazineHeroDebug() {
  const item: ContentItem = {
    id: "movie-hero",
    title: "The Brutalist.",
    image: poster("brutalist-hero"),
    services: ["netflix", "prime", "apple"],
    rating: 8.4,
    year: 2024,
    genre: "Drama",
  };
  return (
    <div className="editorial" style={{ paddingTop: 24, paddingBottom: 80, color: "var(--fg)" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-headline)",
          fontWeight: 600,
          fontVariationSettings: '"opsz" 48',
          marginBottom: 16,
        }}
      >
        MagazineHero (Phase 5)
      </h1>

      <Kicker>DEFAULT</Kicker>
      <div style={{ marginTop: 8, marginBottom: 32 }}>
        <MagazineHero
          item={item}
          standfirst="A first-generation American architect rebuilds his life one impossible commission at a time."
          onSelect={() => {}}
        />
      </div>

      <Kicker>SERVICE-TINTED KICKER</Kicker>
      <div style={{ marginTop: 8, marginBottom: 32 }}>
        <MagazineHero
          item={{ ...item, id: "movie-hero-2", title: "Slow Horses, season 5." }}
          kicker="NEW ON APPLE TV+"
          kickerColor="var(--svc-apple)"
          standfirst="Jackson Lamb's reluctant misfits return — and the spies are louder than ever."
          onSelect={() => {}}
        />
      </div>

      <Kicker>NO STANDFIRST</Kicker>
      <div style={{ marginTop: 8 }}>
        <MagazineHero item={{ ...item, id: "movie-hero-3", title: "Ripley." }} kicker="EDITOR'S CHOICE" onSelect={() => {}} />
      </div>

      <p style={{ marginTop: 56, fontSize: "var(--t-meta)", color: "var(--fg-faint)" }}>
        Dev-only route. Tree-shaken from production builds via{" "}
        <code>import.meta.env.DEV</code>.
      </p>
    </div>
  );
}

export function EditorsNoteDebug() {
  return (
    <div className="editorial" style={{ paddingTop: 40, paddingBottom: 80, color: "var(--fg)" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-headline)",
          fontWeight: 600,
          fontVariationSettings: '"opsz" 48',
          marginBottom: 24,
        }}
      >
        EditorsNote (Phase 5)
      </h1>

      <Kicker>COLLAPSED STRIP — tap to open</Kicker>
      <div style={{ marginTop: 8, marginBottom: 32 }}>
        <EditorsNote
          kicker="EDITOR'S NOTE · 7 MAY"
          teaser="A great prestige drama, three sci-fi misses, and the case for taking notes during the credits."
          body={`A great prestige drama is rare in any year. The Brutalist is one — three and a half hours of patient cinema that earns every minute, and a reminder that the streaming services still know how to platform serious work when they want to.

Elsewhere this week the sci-fi shelf is thin. Two of the three new high-concept releases stumble in the second act, and the third never finds a tone. Worth waiting on.

The case for credits: Slow Horses keeps tucking jokes into the typography. Watch them. We do.`}
        />
      </div>

      <Kicker>DEFAULT KICKER</Kicker>
      <div style={{ marginTop: 8 }}>
        <EditorsNote
          teaser="The Brutalist earns every minute of its three-and-a-half-hour runtime."
          body="A short note. Not every editorial has to be long; some weeks one sentence is enough."
        />
      </div>

      <p style={{ marginTop: 56, fontSize: "var(--t-meta)", color: "var(--fg-faint)" }}>
        Dev-only route. Tree-shaken from production builds via{" "}
        <code>import.meta.env.DEV</code>.
      </p>
    </div>
  );
}

export function BottomNavDebug() {
  const [tab, setTab] = React.useState("home");
  const Frame = ({ label, count }: { label: string; count: number }) => (
    <div style={{ marginBottom: 24 }}>
      <Kicker>{label}</Kicker>
      <div
        style={{
          marginTop: 8,
          background: "var(--surface-elev)",
          borderRadius: "var(--r-card)",
          overflow: "hidden",
        }}
      >
        <BottomNav activeTab={tab} onTabChange={setTab} watchlistCount={count} />
      </div>
    </div>
  );

  return (
    <div className="editorial" style={{ paddingTop: 40, paddingBottom: 80, color: "var(--fg)" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-headline)",
          fontWeight: 600,
          fontVariationSettings: '"opsz" 48',
          marginBottom: 24,
        }}
      >
        BottomNav (Phase 2)
      </h1>
      <p style={{ fontSize: "var(--t-meta)", color: "var(--fg-soft)", marginBottom: 32 }}>
        Active tab: <code style={{ color: "var(--primary)" }}>{tab}</code> — tap to change
      </p>

      <Frame label="DEFAULT — no unread" count={0} />
      <Frame label="WITH UNREAD DOT" count={3} />

      <p style={{ marginTop: 56, fontSize: "var(--t-meta)", color: "var(--fg-faint)" }}>
        Dev-only route. Tree-shaken from production builds via{" "}
        <code>import.meta.env.DEV</code>.
      </p>
    </div>
  );
}

export function ServiceStackDebug() {
  const ALL: ServiceId[] = ["netflix", "prime", "disney", "apple", "now", "paramount", "itvx"];
  const Row = ({ label, services, size }: { label: string; services: ServiceId[]; size?: "sm" | "md" | "lg" }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "0.5px solid var(--hairline)" }}>
      <span style={{ fontSize: "var(--t-meta)", color: "var(--fg-soft)" }}>{label}</span>
      <ServiceStack services={services} size={size} />
    </div>
  );

  return (
    <div className="editorial" style={{ paddingTop: 40, paddingBottom: 80, color: "var(--fg)" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-headline)",
          fontWeight: 600,
          fontVariationSettings: '"opsz" 48',
          marginBottom: 24,
        }}
      >
        ServiceBadge & ServiceStack (Phase 1)
      </h1>

      <Kicker>SINGLE BADGE — sizes</Kicker>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", marginBottom: 16 }}>
        <ServiceBadge service="netflix" size="sm" />
        <ServiceBadge service="netflix" size="md" />
        <ServiceBadge service="netflix" size="lg" />
        <span style={{ fontSize: "var(--t-meta)", color: "var(--fg-faint)" }}>sm 20 · md 24 (default) · lg 32</span>
      </div>

      <Kicker>STACK — overlap & cap</Kicker>
      <div style={{ marginTop: 8 }}>
        <Row label="1 service" services={ALL.slice(0, 1)} />
        <Row label="2 services" services={ALL.slice(0, 2)} />
        <Row label="3 services" services={ALL.slice(0, 3)} />
        <Row label="4 services (cap)" services={ALL.slice(0, 4)} />
        <Row label="5 services → +1" services={ALL.slice(0, 5)} />
        <Row label="7 services → +3" services={ALL} />
      </div>

      <div style={{ height: 32 }} />
      <Kicker>STACK — sm size</Kicker>
      <div style={{ marginTop: 8 }}>
        <Row label="5 services" services={ALL.slice(0, 5)} size="sm" />
      </div>

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
        <ContentCard item={{ ...SAMPLE, id: "movie-3", image: poster("watched"), title: "Already Watched", rating: undefined }} watched bookmarked={false} onToggleBookmark={toggle} />
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

/**
 * WideCardDebug — visual approval surface for landscape (16:9) cards.
 * Hits TMDb's public CDN directly so designers can compare backdrop
 * art against the existing 5:7 portrait variants. Mount via
 * `?debug=widecards`. Backdrops chosen to span dark / mid / light
 * cinematography.
 */
// Real TMDb backdrop paths (fetched from /movie/{id} and /tv/{id} on
// 2026-05-08). Renders the production CDN at the same size we'd use
// in-app so the visual review matches reality.
const tmdbBackdrop = (path: string) => `https://image.tmdb.org/t/p/w780${path}`;

const WIDE_SAMPLES: WideCardItem[] = [
  {
    id: "movie-wide-1",
    title: "Dune: Part Two",
    image: poster("dune-poster"),
    backdrop: tmdbBackdrop("/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"),
    services: ["netflix", "prime"],
    genre: "SCI-FI",
    year: 2024,
    rating: 8.2,
  },
  {
    id: "tv-wide-1",
    title: "The Bear",
    image: poster("bear-poster"),
    backdrop: tmdbBackdrop("/wHNwlE6ftEpgjVbdhLXOtv1hLs0.jpg"),
    services: ["disney"],
    genre: "DRAMA",
    year: 2022,
    rating: 8.7,
  },
  {
    id: "movie-wide-2",
    title: "Past Lives",
    image: poster("pastlives-poster"),
    backdrop: tmdbBackdrop("/7HR38hMBl23lf38MAN63y4pKsHz.jpg"),
    services: ["bbc"],
    genre: "ROMANCE",
    year: 2023,
    rating: 7.8,
  },
];

export function WideCardDebug() {
  return (
    <div className="editorial mx-auto py-8 flex flex-col gap-10">
      <SectionHead
        kicker="DEBUG"
        title="Wide cards — visual approval."
        standfirst="Landscape (16:9) variant. Compare against the portrait 5:7 elsewhere on the screen."
      />

      <section className="flex flex-col gap-3">
        <Kicker>DEFAULT (272PX)</Kicker>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2" style={{ scrollbarWidth: "none" }}>
          {WIDE_SAMPLES.map((item) => (
            <WideCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Kicker>LEAD (358PX, FULL-BLEED)</Kicker>
        <div className="flex flex-col gap-4">
          {WIDE_SAMPLES.map((item) => (
            <WideCard key={item.id} item={item} size="lead" />
          ))}
        </div>
      </section>

      <p style={{ fontSize: "var(--t-meta)", color: "var(--fg-faint)" }}>
        Backdrops fetched directly from <code>image.tmdb.org/t/p/w780/...</code>.
        Threading <code>backdrop_path</code> through <code>contentAdapter</code> is
        the next step once the visual is approved.
      </p>
    </div>
  );
}

