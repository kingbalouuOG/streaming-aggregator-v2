import React from "react";
import { getPlatform, type ServiceId } from "./platformLogos";

interface ServiceBadgeProps {
  service: ServiceId | string;
  size?: "sm" | "md" | "lg";
}

export function ServiceBadge({ service, size = "sm" }: ServiceBadgeProps) {
  const platform = getPlatform(service);

  const sizeClasses =
    size === "lg"
      ? "w-8 h-8 rounded-[8px]"
      : size === "md"
        ? "w-6 h-6 rounded-[6px]"
        : "w-5 h-5 rounded-[5px]";

  if (platform?.logo) {
    return (
      <img
        src={platform.logo}
        alt={platform.name}
        className={`${sizeClasses} object-cover shrink-0`}
      />
    );
  }

  // Fallback: colored letter badge
  const bg = platform?.bg ?? "bg-gray-600";
  const label = platform?.label ?? service.slice(0, 2).toUpperCase();
  const textSize =
    size === "lg"
      ? "text-[12px]"
      : size === "md"
        ? "text-[10px]"
        : "text-[9px]";

  return (
    <span
      className={`inline-flex items-center justify-center ${bg} text-white ${sizeClasses} ${textSize} shrink-0`}
      style={{ fontWeight: 700, letterSpacing: "-0.02em" }}
    >
      {label}
    </span>
  );
}
