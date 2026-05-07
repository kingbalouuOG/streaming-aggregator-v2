import React from "react";
import { SectionHead } from "./SectionHead";
import { MoodRoomCard, type MoodRoomCardProps } from "./MoodRoomCard";

export interface MoodRoomsRowItem extends Omit<MoodRoomCardProps, "onSelect"> {
  /** Per-item select handler — wired into MoodRoomCard. */
  onSelect: () => void;
}

interface MoodRoomsRowProps {
  rooms: MoodRoomsRowItem[];
  /** Defaults to "MOOD ROOMS". */
  kicker?: string;
  /** Defaults to "Pick an atmosphere." */
  title?: string;
  /** Optional Fraunces italic standfirst. */
  standfirst?: string;
  /** Optional trailing slot — typically "See all →". */
  right?: React.ReactNode;
}

/**
 * MoodRoomsRow — SectionHead + horizontal scroll of <MoodRoomCard>
 * tiles per Phase 5 matrix. Used by the global mood-rooms browse
 * surface (v2.5) and any other place that wants to mount the
 * atmosphere-tile pattern.
 */
export function MoodRoomsRow({
  rooms,
  kicker = "MOOD ROOMS",
  title = "Pick an atmosphere.",
  standfirst,
  right,
}: MoodRoomsRowProps) {
  if (rooms.length === 0) return null;
  return (
    <section className="mb-6">
      <div className="px-5">
        <SectionHead kicker={kicker} title={title} standfirst={standfirst} right={right} />
      </div>
      <div
        className="flex gap-3 overflow-x-auto no-scrollbar px-5 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {rooms.map((room) => (
          <MoodRoomCard {...room} key={room.id} />
        ))}
      </div>
    </section>
  );
}
