import { getPlatform, type ServiceId } from "./platformLogos";
import { TickIcon } from "./icons";

interface ServiceTileProps {
  service: ServiceId;
  active: boolean;
  onToggle: (service: ServiceId) => void;
}

/**
 * ServiceTile — 56×56 service logo button used in the Phase Search V2
 * FilterSheet's STREAMING SERVICES row.
 *
 * Active reads as "deliberately on": 3px orange ring around the logo,
 * 20×20 tick badge at the bottom-right, soft orange glow, full-colour
 * thumbnail. Default state in the sheet has every user service active
 * (opt-out, not opt-in), so the on-state needs to feel obvious enough
 * that the user recognises it as a selection.
 *
 * Inactive: 50% grayscale + 40% opacity inner thumbnail, hairline edge,
 * faint label — reads as suppressed.
 *
 * Anatomy (artboard 05):
 *   - 64w column → 56×56 ring + 11px service name below
 *   - Ring is `padding: 3px` of `--primary` between outer and inner radii
 */
export function ServiceTile({ service, active, onToggle }: ServiceTileProps) {
  const platform = getPlatform(service);
  if (!platform) return null;

  return (
    <button
      type="button"
      onClick={() => onToggle(service)}
      className="flex flex-col items-center gap-[7px] shrink-0 focus:outline-none"
      style={{ width: 64 }}
      aria-pressed={active ? "true" : "false"}
      aria-label={`${platform.name} — ${active ? "selected" : "excluded"}`}
    >
      <div
        className="relative"
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          padding: 3,
          background: active ? "var(--primary)" : "transparent",
          boxShadow: active ? "0 2px 10px rgba(232, 93, 37, 0.30)" : "none",
          transition: "background var(--d-base) var(--ease-out), box-shadow var(--d-base) var(--ease-out)",
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 11,
            background: "#000",
            boxShadow: active ? "none" : "inset 0 0 0 0.5px var(--hairline)",
            opacity: active ? 1 : 0.4,
            filter: active ? "none" : "grayscale(0.5)",
            transition: "opacity var(--d-base) var(--ease-out), filter var(--d-base) var(--ease-out)",
          }}
        >
          <img
            src={platform.logo}
            alt=""
            className="block w-full h-full object-cover"
          />
        </div>
        {active ? <span
            className="absolute flex items-center justify-center"
            style={{
              bottom: -3,
              right: -3,
              width: 20,
              height: 20,
              borderRadius: "9999px",
              background: "var(--primary)",
              color: "#fff",
              boxShadow: "0 0 0 2px var(--surface-elev)",
            }}
          >
            <TickIcon className="w-[12px] h-[12px]" />
          </span> : null}
      </div>
      <span
        className="whitespace-nowrap"
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10.5,
          fontWeight: active ? 700 : 500,
          letterSpacing: "-0.01em",
          lineHeight: 1,
          color: active ? "var(--fg)" : "var(--fg-faint)",
        }}
      >
        {platform.name}
      </span>
    </button>
  );
}
