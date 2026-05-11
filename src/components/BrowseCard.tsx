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
  /** Forwarded to ContentCard — when true, rating pill is replaced by
   *  the "Not on yours" pill and the card drops to 0.75 opacity. */
  notOnYours?: boolean;
}

/**
 * BrowseCard — thin wrapper around <ContentCard variant="mosaic"> that
 * adds the staggered entry animation used in the Browse grid. All card
 * anatomy (poster, bookmark, rating pill, title+meta below) lives in
 * ContentCard so Browse stays in lockstep with the rest of the app.
 */
export function BrowseCard({ item, index = 0, ...rest }: BrowseCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
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
