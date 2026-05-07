import React from "react";
import { SlidersHorizontal } from "lucide-react";

interface CategoryFilterProps {
  categories: string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  onFilterPress?: () => void;
  hasActiveFilters?: boolean;
  /** Optional kicker above the chip row — defaults to "BROWSE BY". */
  kicker?: string;
}

/**
 * CategoryFilter — editorial chip bar with optional kicker per
 * docs/v3-design/redesign-plan.md Phase 5. Active chip carries
 * --primary, inactive sits in --surface-tint with --fg-soft text.
 * The trailing filter-sheet button matches the chip family (pill
 * radius, surface-tint surface) when no filters are active and
 * flips to --primary when at least one is.
 */
export function CategoryFilter({
  categories,
  activeCategory,
  onCategoryChange,
  onFilterPress,
  hasActiveFilters,
  kicker = "BROWSE BY",
}: CategoryFilterProps) {
  return (
    <div
      className="sticky top-0 z-20 backdrop-blur-xl"
      style={{
        background: "color-mix(in srgb, var(--surface) 85%, transparent)",
        paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))",
      }}
    >
      <div className="px-5 pt-1">
        <span className="t-kicker">{kicker}</span>
      </div>
      <div className="flex items-center gap-2 px-5 py-2">
        <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar">
          {categories.map((category) => {
            const isActive = category === activeCategory;
            return (
              <button
                key={category}
                type="button"
                onClick={() => onCategoryChange(category)}
                className="shrink-0 px-3 py-1.5 whitespace-nowrap"
                style={{
                  background: isActive ? "var(--primary)" : "var(--surface-tint)",
                  color: isActive ? "#fff" : "var(--fg-soft)",
                  borderRadius: "var(--r-pill)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  letterSpacing: "0.01em",
                  transition:
                    "background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out)",
                }}
              >
                {category}
              </button>
            );
          })}
        </div>
        {onFilterPress && (
          <button
            type="button"
            onClick={onFilterPress}
            className="relative flex items-center justify-center w-9 h-9 shrink-0 transition-colors"
            style={{
              background: hasActiveFilters ? "var(--primary)" : "var(--surface-tint)",
              color: hasActiveFilters ? "#fff" : "var(--fg-soft)",
              borderRadius: "var(--r-md)",
            }}
            aria-label="Filters"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {hasActiveFilters && (
              <span
                className="absolute -top-1 -right-1"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--primary)",
                  boxShadow: "0 0 0 1.5px var(--surface)",
                }}
              />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
