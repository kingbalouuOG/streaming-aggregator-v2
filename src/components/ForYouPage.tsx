/**
 * ForYouPage — the For You surface.
 *
 * Renders up to 8 rows of heavily personalised, slider-tunable content:
 *   1. Slider entry point ("Tune your recommendations")
 *   2. Recommended For You
 *   3. [Mood Rooms placeholder — not rendered in Phase 4]
 *   4. Hidden Gems
 *   5. Because You Watched [Title 1] (conditional)
 *   6. Because You Watched [Title 2] (conditional)
 *   7. More From [Director/Actor] (conditional)
 *   8. Outside Your Usual
 *   9. From Your Watchlist (conditional)
 */

import { useState, useCallback } from 'react';
import { Sliders, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { ContentRow } from './ContentRow';
import { SliderTray } from './SliderTray';
import { useForYouContent } from '@/hooks/useForYouContent';
import type { FilterSets } from '@/lib/recommendations-v2/hardFilters';
import type { ContentItem } from './ContentCard';
import type { ServiceId } from './platformLogos';
import type { SliderState } from '@/lib/taste-v2/types';

interface ForYouPageProps {
  providerIds: number[];
  connectedServiceIds: ServiceId[];
  sharedFilters: FilterSets | null;
  filterWatched: (items: ContentItem[]) => ContentItem[];
  filterLanguage: (items: ContentItem[]) => ContentItem[];
  onItemSelect: (item: ContentItem) => void;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (item: ContentItem) => void;
  watchedIds: Set<string>;
}

export function ForYouPage({
  providerIds,
  connectedServiceIds,
  sharedFilters,
  filterWatched,
  filterLanguage,
  onItemSelect,
  bookmarkedIds,
  onToggleBookmark,
  watchedIds,
}: ForYouPageProps) {
  const content = useForYouContent(providerIds, sharedFilters);
  const [showSliderTray, setShowSliderTray] = useState(false);

  const applyFilters = (items: ContentItem[]) => filterLanguage(filterWatched(items));

  const handleSlidersChange = useCallback((newSliders: SliderState) => {
    content.rerank(newSliders);
  }, [content.rerank]);

  const isEmpty =
    content.recommendedForYou.length === 0 &&
    content.hiddenGems.length === 0 &&
    content.becauseYouWatched.length === 0 &&
    !content.moreFromPerson &&
    content.outsideYourUsual.length === 0 &&
    content.fromYourWatchlist.length === 0;

  return (
    <div className="px-0 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between px-5 mb-4">
        <h1 className="text-foreground text-[22px]" style={{ fontWeight: 700 }}>For You</h1>

        {/* Slider entry point */}
        {content.sliders && (
          <button
            onClick={() => setShowSliderTray(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
          >
            <Sliders className="w-4 h-4" />
            <span className="text-[13px]" style={{ fontWeight: 500 }}>Tune</span>
          </button>
        )}
      </div>

      {content.loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : isEmpty && !content.loading ? (
        <p className="text-muted-foreground text-[14px] text-center px-5 py-12">
          Complete onboarding to see personalised recommendations here.
        </p>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          {/* Recommended For You */}
          {content.recommendedForYou.length > 0 && (
            <ContentRow
              title="Recommended For You"
              sectionKey="foryou-recs"
              sourceSurface="for_you"
              items={applyFilters(content.recommendedForYou)}
              onItemSelect={onItemSelect}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={onToggleBookmark}
              userServices={connectedServiceIds}
              watchedIds={watchedIds}
            />
          )}

          {/* Hidden Gems */}
          {content.hiddenGems.length > 0 && (
            <ContentRow
              title="Hidden Gems"
              sectionKey="foryou-gems"
              sourceSurface="for_you"
              items={applyFilters(content.hiddenGems)}
              onItemSelect={onItemSelect}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={onToggleBookmark}
              userServices={connectedServiceIds}
              watchedIds={watchedIds}
            />
          )}

          {/* Because You Watched */}
          {content.becauseYouWatched.map((row, idx) => (
            <ContentRow
              key={`byw-${idx}`}
              title={`Because You Watched ${row.anchor.title}`}
              sectionKey={`foryou-byw-${idx}`}
              sourceSurface="for_you"
              items={applyFilters(row.items)}
              onItemSelect={onItemSelect}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={onToggleBookmark}
              userServices={connectedServiceIds}
              watchedIds={watchedIds}
            />
          ))}

          {/* More From [Director/Actor] */}
          {content.moreFromPerson && content.moreFromPerson.items.length > 0 && (
            <ContentRow
              title={`More From ${content.moreFromPerson.personName}`}
              sectionKey="foryou-morefrom"
              sourceSurface="for_you"
              items={applyFilters(content.moreFromPerson.items)}
              onItemSelect={onItemSelect}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={onToggleBookmark}
              userServices={connectedServiceIds}
              watchedIds={watchedIds}
            />
          )}

          {/* Outside Your Usual */}
          {content.outsideYourUsual.length > 0 && (
            <ContentRow
              title="Outside Your Usual"
              sectionKey="foryou-outside"
              sourceSurface="for_you"
              items={applyFilters(content.outsideYourUsual)}
              onItemSelect={onItemSelect}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={onToggleBookmark}
              userServices={connectedServiceIds}
              watchedIds={watchedIds}
            />
          )}

          {/* From Your Watchlist */}
          {content.fromYourWatchlist.length > 0 && (
            <ContentRow
              title="From Your Watchlist"
              sectionKey="foryou-watchlist"
              sourceSurface="for_you"
              items={applyFilters(content.fromYourWatchlist)}
              onItemSelect={onItemSelect}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={onToggleBookmark}
              userServices={connectedServiceIds}
              watchedIds={watchedIds}
            />
          )}
        </motion.div>
      )}

      {/* Slider Tray (bottom sheet) */}
      <SliderTray
        isOpen={showSliderTray}
        onClose={() => setShowSliderTray(false)}
        onSlidersChange={handleSlidersChange}
        initialSliders={content.sliders}
      />
    </div>
  );
}
