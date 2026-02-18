import React from "react";
import { SlidersHorizontal } from "lucide-react";

interface CategoryFilterProps {
  categories: string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  onFilterPress?: () => void;
  hasActiveFilters?: boolean;
}

export function CategoryFilter({
  categories,
  activeCategory,
  onCategoryChange,
  onFilterPress,
  hasActiveFilters,
}: CategoryFilterProps) {
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl" style={{ backgroundColor: "var(--background)", paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}>
      <div className="flex items-center gap-2 px-5 py-3">
        <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar">
          {categories.map((category) => {
            const isActive = category === activeCategory;
            return (
              <button
                key={category}
                onClick={() => onCategoryChange(category)}
                className={`px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
        <button
          onClick={onFilterPress}
          className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors shrink-0 ${
            hasActiveFilters
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary border border-background" />
          )}
        </button>
      </div>
    </div>
  );
}