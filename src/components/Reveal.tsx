import React from "react";
import { motion } from "motion/react";

/**
 * UX-1: staged section entrance for the heavy tabs (Home, For You).
 *
 * Sections cascade in top-to-bottom (fade + 14px rise, M3 decelerate,
 * 60ms stagger per index) so first paint reads as a designed reveal
 * rather than "nothing, then the whole page at once" — and sections
 * whose data arrives late enter through the same motion, which turns
 * staggered loading from a glitch into choreography.
 *
 * Mount-only by design: the keep-alive tab pattern means Home/For You
 * mount once per session, so this never replays on tab returns.
 * Compositor-only properties (opacity/transform).
 */
export function Reveal({
  index = 0,
  children,
  className,
}: {
  /** Stagger slot — 0 is the topmost section. */
  index?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.06, ease: [0, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
