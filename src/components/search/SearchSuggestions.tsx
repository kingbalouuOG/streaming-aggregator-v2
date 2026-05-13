import { ChevronRight } from "lucide-react";
import { ServiceStack } from "../ServiceBadge";
import { ImageSkeleton } from "../ImageSkeleton";
import type { ContentItem } from "../ContentCard";

interface SearchSuggestionsProps {
  query: string;
  items: readonly ContentItem[];
  loading: boolean;
  /** True when the user has typed exactly one character. */
  tooShort: boolean;
  onSelect: (item: ContentItem) => void;
}

/**
 * As-you-type suggestions list under the search input. Per artboard 02:
 * dense rows (40×60 poster + title + meta + service stack + chevron),
 * shown while the user is still mid-query. The full results grid takes
 * over once the user submits (presses Enter / blurs the input).
 *
 * Three states:
 *   - tooShort (1 char)         → "Keep typing…" hint
 *   - loading + no items yet    → 5 skeleton rows
 *   - has items                 → up to 5 suggestion rows
 *
 * Tap routing: phase 1 always navigates to the detail page via
 * `onSelect`. The kickoff brief reserves a fuzzy-match-vs-detail
 * routing decision for a later refinement.
 */
export function SearchSuggestions({ items, loading, tooShort, onSelect }: SearchSuggestionsProps) {
  if (tooShort) {
    return (
      <div className="py-6 px-5 text-center">
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--fg-soft)",
            letterSpacing: "-0.005em",
          }}
        >
          Keep typing…
        </p>
      </div>
    );
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col">
        <span className="t-kicker mb-3" style={{ paddingLeft: 0 }}>SUGGESTIONS</span>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-2"
            style={{ borderBottom: "0.5px solid var(--hairline)" }}
          >
            <div
              className="shrink-0"
              style={{
                width: 40,
                height: 60,
                borderRadius: 6,
                background: "var(--surface-tint)",
              }}
            />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div
                style={{
                  height: 14,
                  width: "70%",
                  borderRadius: 4,
                  background: "var(--surface-tint)",
                }}
              />
              <div
                style={{
                  height: 10,
                  width: "40%",
                  borderRadius: 4,
                  background: "var(--surface-tint)",
                  opacity: 0.6,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col">
      <span className="t-kicker mb-2" style={{ paddingLeft: 0 }}>SUGGESTIONS</span>
      <ul className="flex flex-col">
        {items.slice(0, 5).map((item) => {
          const typeLabel = item.type === "tv" ? "TV" : item.type === "doc" ? "Doc" : "Movie";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex items-center gap-3 py-2 w-full text-left"
                style={{ borderBottom: "0.5px solid var(--hairline)" }}
              >
                <div
                  className="shrink-0 overflow-hidden"
                  style={{ width: 40, height: 60, borderRadius: 6, background: "#000" }}
                >
                  <ImageSkeleton src={item.image} alt={item.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="truncate"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 15,
                      fontWeight: 600,
                      fontVariationSettings: '"opsz" 18',
                      letterSpacing: "-0.01em",
                      color: "var(--fg)",
                      lineHeight: 1.2,
                      margin: 0,
                    }}
                  >
                    {item.title}
                  </p>
                  <div
                    className="flex items-center gap-1.5 mt-0.5"
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--fg-soft)",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {item.year != null && <span>{item.year}</span>}
                    {item.year != null && <span>·</span>}
                    <span>{typeLabel}</span>
                    {item.services.length > 0 && (
                      <>
                        <span>·</span>
                        <ServiceStack services={item.services} size="sm" max={3} />
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--fg-faint)" }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
