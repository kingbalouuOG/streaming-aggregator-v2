import { ReactNode } from "react";

interface KickerProps {
  children: ReactNode;
  /**
   * Override the default orange. Intended for service-tinted kickers
   * (var(--svc-netflix), var(--svc-disney), …) and atmosphere-tinted
   * kickers (var(--atm-rose), var(--atm-teal), …).
   */
  color?: string;
  className?: string;
}

/**
 * Kicker — DM Sans 11 / 700 / uppercase / 1.6px tracked / orange.
 * Wraps the .t-kicker helper class from src/index.css. Used by
 * <SectionHead> and any standalone kicker (mood-tile labels,
 * editor's-note marks, etc).
 *
 * Anatomy: docs/v3-design/design-system.md §4 (SectionHead),
 * tinted-variant rationale: §3 (service tints).
 */
export function Kicker({ children, color, className = "" }: KickerProps) {
  return (
    <span
      className={`t-kicker ${className}`}
      style={color ? { color } : undefined}
    >
      {children}
    </span>
  );
}
