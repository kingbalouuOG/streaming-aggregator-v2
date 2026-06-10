import React from "react";
import { getPlatform, type ServiceId } from "./platformLogos";

interface ServiceBadgeProps {
  service: ServiceId | string;
  /**
   * Per docs/design/design-system.md §4 ServiceBadge anatomy
   * the canonical size is `md` (24×24). `sm` (20) and `lg` (32)
   * are kept for tight or hero contexts but new code should
   * default to `md`.
   */
  size?: "sm" | "md" | "lg";
}

const SIZE = {
  sm: { box: "w-5 h-5", radius: 5, font: "text-[9px]" },
  md: { box: "w-6 h-6", radius: 6, font: "text-[10px]" },
  lg: { box: "w-8 h-8", radius: 8, font: "text-[12px]" },
} as const;

export function ServiceBadge({ service, size = "md" }: ServiceBadgeProps) {
  const platform = getPlatform(service);
  const dim = SIZE[size];
  const radiusStyle = { borderRadius: `${dim.radius}px` };

  if (platform?.logo) {
    return (
      <img
        src={platform.logo}
        alt={platform.name}
        className={`${dim.box} object-cover shrink-0 block`}
        style={radiusStyle}
      />
    );
  }

  // Fallback: lettered badge. Per-service tints map to var(--svc-*)
  // so the background follows the design-system contract; if a service
  // has no entry in PLATFORMS, fall back to surface-tint (theme-aware).
  const bgVar = platform ? `var(--svc-${service})` : "var(--surface-tint)";
  const label = platform?.label ?? service.slice(0, 2).toUpperCase();

  return (
    <span
      className={`inline-flex items-center justify-center ${dim.box} ${dim.font} shrink-0`}
      style={{
        ...radiusStyle,
        background: bgVar,
        color: platform ? "#fff" : "var(--fg-soft)",
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
    >
      {label}
    </span>
  );
}

interface ServiceStackProps {
  services: (ServiceId | string)[];
  size?: "sm" | "md" | "lg";
  /** Maximum visible badges before collapsing to "+N". Default 4 per §4. */
  max?: number;
}

/**
 * ServiceStack — overlapped row of ServiceBadges.
 *
 * Per docs/design/design-system.md §4: stack overlaps at -8px
 * when there are 2+ services. Visible cap is 4; remaining services
 * collapse to a "+N" pill matching the badge dimensions.
 */
export function ServiceStack({ services, size = "md", max = 4 }: ServiceStackProps) {
  if (services.length === 0) return null;

  const visible = services.slice(0, max);
  const remaining = services.length - visible.length;
  const dim = SIZE[size];

  return (
    <div className="inline-flex items-center">
      {visible.map((s, i) => (
        <span
          key={`${s}-${i}`}
          className="block"
          style={{
            marginLeft: i === 0 ? 0 : -8,
            zIndex: visible.length - i,
            position: "relative",
            borderRadius: `${dim.radius}px`,
          }}
        >
          <ServiceBadge service={s} size={size} />
        </span>
      ))}
      {remaining > 0 && (
        <span
          className={`inline-flex items-center justify-center ${dim.box} ${dim.font} shrink-0`}
          style={{
            marginLeft: -8,
            zIndex: 0,
            position: "relative",
            borderRadius: `${dim.radius}px`,
            background: "var(--surface-tint)",
            color: "var(--fg-soft)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
          aria-label={`+${remaining} more`}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
}
