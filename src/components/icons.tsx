import React from "react";

interface IconProps {
  className?: string;
}

/** Simple checkmark icon (stroke-based, uses currentColor) */
export function TickIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20 6L9 17L4 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Eye outline icon (stroke-based, uses currentColor) */
export function EyeIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4553 9.50484 21.5807 11.2868C21.7169 11.5025 21.785 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.785 12.3897 21.7169 12.4975 21.5807 12.7132C20.4553 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Filled eye icon (fill-based, currentColor body + contrasting pupil) */
export function EyeFilledIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4553 9.50484 21.5807 11.2868C21.7169 11.5025 21.785 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.785 12.3897 21.7169 12.4975 21.5807 12.7132C20.4553 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z"
        fill="currentColor"
      />
      <path
        d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z"
        fill="var(--background)"
      />
    </svg>
  );
}

/** Eye with strikethrough line (for "hidden" state) */
export function EyeOffIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4553 9.50484 21.5807 11.2868C21.7169 11.5025 21.785 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.785 12.3897 21.7169 12.4975 21.5807 12.7132C20.4553 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Diagonal strikethrough line */}
      <line
        x1="4"
        y1="20"
        x2="20"
        y2="4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
 * v3 editorial-redesign icon set (Phase 0).
 * 24×24 viewbox, 1.8 stroke, currentColor, rounded line caps.
 * Default size w-5 h-5; callers override via className.
 * ───────────────────────────────────────────────────────────── */

const OUTLINE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Bookmark — outline. Used top-right of ContentCard.
 *  Bbox 4→20 = 16×16 to match the bottom-nav optical-weight contract. */
export function BookmarkIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M 4 4 L 20 4 L 20 20 L 12 16 L 4 20 Z" {...OUTLINE} />
    </svg>
  );
}

/** Bookmark — filled. Active state for ContentCard bookmark. */
export function BookmarkFilledIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M 4 4 L 20 4 L 20 20 L 12 16 L 4 20 Z" fill="currentColor" />
    </svg>
  );
}

/** Close — X. Sheets, modals, dismissable chips. */
export function CloseIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M6 6L18 18M18 6L6 18" {...OUTLINE} />
    </svg>
  );
}

/** Chevron right — "See all" affordances, list-row disclosure. */
export function ChevronRightIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M9 6l6 6-6 6" {...OUTLINE} />
    </svg>
  );
}

/** Chevron down — accordion, dropdown affordance. */
export function ChevronDownIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M6 9l6 6 6-6" {...OUTLINE} />
    </svg>
  );
}

/** Expand — four corner brackets. EditorsNote → modal trigger. */
export function ExpandIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" {...OUTLINE} />
    </svg>
  );
}

/** Play — filled triangle. Hero CTAs, watch-now buttons. */
export function PlayFillIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

/** Sparkle — 4-point star. Editorial highlights, "for you" markers.
 *  Outer points reach 4→20 to match the optical weight of the other
 *  bottom-nav icons. Inner curve waypoints scale proportionally. */
export function SparkleIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Bottom-nav icons (Phase 2). Same 24×24 / 1.8 outline contract
 * as the v3 set above; filled variants where the tab gets an
 * "active" visual.
 * ───────────────────────────────────────────────────────────── */

/** Home — outline house. Bottom-nav Home tab (inactive). */
export function HomeIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M4 11 L12 4 L20 11 L20 20 L14 20 L14 14 L10 14 L10 20 L4 20 Z" {...OUTLINE} />
    </svg>
  );
}

/** Home — filled. Active state for Home tab. */
export function HomeFilledIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M4 11 L12 4 L20 11 L20 20 L14 20 L14 14 L10 14 L10 20 L4 20 Z" fill="currentColor" />
    </svg>
  );
}

/** Search — outline magnifier. Bottom-nav Browse tab.
 *  Bbox 4→20 = 16×16 to match the bottom-nav optical-weight contract. */
export function SearchIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="10" cy="10" r="6" {...OUTLINE} />
      <path d="M15 15 L20 20" {...OUTLINE} />
    </svg>
  );
}

/** User — outline person. Bottom-nav Profile tab.
 *  Bbox 4→20 = 16×16 to match the bottom-nav optical-weight contract. */
export function UserIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="8" r="4" {...OUTLINE} />
      <path d="M4 20 C 4 15 8 13 12 13 C 16 13 20 15 20 20" {...OUTLINE} />
    </svg>
  );
}

/** User — filled. Active state for Profile tab. */
export function UserFilledIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4 20 C 4 15 8 13 12 13 C 16 13 20 15 20 20 L 4 20 Z" fill="currentColor" />
    </svg>
  );
}
