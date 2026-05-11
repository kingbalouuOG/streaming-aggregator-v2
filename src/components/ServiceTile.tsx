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
 * Active: orange ring + 18px tick badge at the bottom-right of the tile.
 * Inactive: greyscale + 40% opacity inner thumbnail so excluded services
 * read as suppressed (per artboard 05). Tap toggles selection.
 *
 * Anatomy (artboard 05 / videx-search-v2.jsx SvServiceTile):
 *   - 64w column → 56×56 ring + 11px service name below
 *   - Ring becomes filled `--primary` when active; transparent otherwise
 *   - Inner 12px-radius thumbnail holds the logo and dims when inactive
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
      aria-pressed={active}
      aria-label={`${platform.name} — ${active ? "selected" : "excluded"}`}
    >
      <div
        className="relative"
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          padding: 2,
          background: active ? "var(--primary)" : "transparent",
          transition: "background var(--d-base) var(--ease-out)",
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 12,
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
        {active && (
          <span
            className="absolute flex items-center justify-center"
            style={{
              bottom: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: "9999px",
              background: "var(--primary)",
              color: "#fff",
              boxShadow: "0 0 0 2px var(--surface-elev)",
            }}
          >
            <TickIcon className="w-[10px] h-[10px]" />
          </span>
        )}
      </div>
      <span
        className="whitespace-nowrap"
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10.5,
          fontWeight: 600,
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
