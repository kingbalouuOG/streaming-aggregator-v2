import React from "react";
import { motion } from "motion/react";
import { ContentCard, ContentItem } from "./ContentCard";
import type { ServiceId } from "./platformLogos";

interface BrowseCardProps {
  item: ContentItem;
  index?: number;
  onSelect?: (item: ContentItem) => void;
  bookmarked?: boolean;
  onToggleBookmark?: (item: ContentItem) => void;
  userServices?: ServiceId[];
  watched?: boolean;
  /** Forwarded to ContentCard — tints the poster + shows "where it
   *  lives" service icons when the title isn't on the user's stack. */
  offService?: boolean;
  /** Forwarded to ContentCard — renders the bottom-right "From £X.XX"
   *  pill for rentable/buyable off-service titles. */
  rentBuyPriceLabel?: string;
  /** True when the card renders inside a virtual row (PLAT-1 grid
   *  virtualization). Disables the staggered entrance animation —
   *  virtual rows remount as they scroll into view, so replaying the
   *  entry transition on every scroll would be visible churn. */
  virtualized?: boolean;
}

/**
 * BrowseCard — thin wrapper around <ContentCard variant="mosaic"> that
 * adds the staggered entry animation used in the Browse grid. All card
 * anatomy (poster, bookmark, rating pill, title+meta below) lives in
 * ContentCard so Browse stays in lockstep with the rest of the app.
 */
function BrowseCardImpl({ item, index = 0, virtualized = false, ...rest }: BrowseCardProps) {
  return (
    <motion.div
      initial={virtualized ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.04, 0.3),
        type: "spring",
        damping: 22,
        stiffness: 300,
      }}
    >
      <ContentCard item={item} variant="mosaic" {...rest} />
    </motion.div>
  );
}

// PLAT-1 Workstream E: memo'd — App re-renders on every scroll pixel
// (scrollY is state); with store-backed stable props this stops the
// per-frame re-render cascade through the card/row primitives.
export const BrowseCard = React.memo(BrowseCardImpl);
