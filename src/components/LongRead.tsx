import { ImageSkeleton } from "./ImageSkeleton";
import { Kicker } from "./Kicker";

interface LongReadProps {
  /** Tap target — usually opens a long-form essay sheet. Optional for now. */
  onSelect?: () => void;
}

/**
 * LongRead — full-bleed editorial spotlight with cover image, kicker,
 * Fraunces title, byline, and a teaser paragraph.
 *
 * TODO(IN-V3-001): replace the hardcoded sample below with a real
 * data source — most likely a `long_reads` Supabase table parallel
 * to `editor_notes` (Phase 6 migration 040). Today's render is
 * deliberately frozen so we can ship the §5.x anatomy ahead of the
 * editorial pipeline.
 */
const SAMPLE = {
  kicker: "THE LONG READ",
  title: "Why prestige TV stopped chasing the cliffhanger.",
  byline: "By the Editors · 8 min read",
  cover: "https://image.tmdb.org/t/p/w780/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg",
  excerpt:
    "Once, the only currency was the next-week hook. The streaming era quietly retired it — and the better shows learned to sell mood instead. Here's how that bargain landed in your living room, and what it says about the writers' rooms still chasing it.",
};

export function LongRead({ onSelect }: LongReadProps) {
  return (
    <section className="editorial mt-3 mb-9">
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left cursor-pointer"
        style={{ background: "transparent", color: "var(--fg)" }}
      >
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: "16 / 10",
            borderRadius: "var(--r-card)",
            background: "var(--surface-elev)",
          }}
        >
          <ImageSkeleton
            src={SAMPLE.cover}
            alt={SAMPLE.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(10,10,15,0.9) 0%, rgba(10,10,15,0.3) 50%, rgba(10,10,15,0) 75%)",
            }}
          />
          <div className="absolute left-0 right-0 bottom-0 p-5">
            <span
              className="t-kicker"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              {SAMPLE.kicker}
            </span>
            <h2
              className="line-clamp-2"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 800,
                fontVariationSettings: '"opsz" 96',
                letterSpacing: "-0.02em",
                color: "#fff",
                lineHeight: 1.1,
                margin: "6px 0 0",
                textShadow: "0 1px 4px rgba(0,0,0,0.45)",
              }}
            >
              {SAMPLE.title}
            </h2>
          </div>
        </div>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-body)",
            color: "var(--fg-soft)",
            lineHeight: 1.55,
            margin: "12px 0 0",
          }}
        >
          {SAMPLE.excerpt}
        </p>
        <div className="mt-2">
          <Kicker color="var(--fg-faint)">{SAMPLE.byline}</Kicker>
        </div>
      </button>
    </section>
  );
}
