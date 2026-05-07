/**
 * ForYouPage — the For You surface, restyled per design-system.md §5.
 *
 * Section order (10):
 *   1. Greeting + top pick (MagazineHero)
 *   2. Taste fingerprint (4 chips visualising the user's profile)
 *   3. Mood chip refiner (above "In your mood")
 *   4. In your mood
 *   5. Cover-story mood room (1 featured + 3 supporting)
 *   6. Continue exploring (Hidden Gems)
 *   7. Watchlist preview (3 items)
 *   8. Outside your usual
 *   9. Quick watch (under 30 min)
 *  10. Calendar strip
 *
 * Taste fingerprint and mood-refiner real wiring depend on the taste-v2
 * surface API; today they render hardcoded labels and a no-op refiner
 * so the §5 anatomy is in place. Real backing data lands in a
 * follow-up PR.
 */

import { useState, useCallback, useMemo } from 'react';
import { Sliders, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { ContentRow } from './ContentRow';
import { ContentCard } from './ContentCard';
import { SectionHead } from './SectionHead';
import { Kicker } from './Kicker';
import { MagazineHero } from './MagazineHero';
import { CalendarStrip } from './CalendarStrip';
import { SliderTray } from './SliderTray';
import { useForYouContent } from '@/hooks/useForYouContent';
import { useAnchorMoodRooms, type AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';
import type { FilterSets } from '@/lib/recommendations-v2/hardFilters';
import type { ContentItem } from './ContentCard';
import type { ServiceId } from './platformLogos';
import type { SliderState } from '@/lib/taste-v2/types';
import type { UpcomingRelease } from '@/hooks/useUpcoming';

interface ForYouPageProps {
  providerIds: number[];
  connectedServiceIds: ServiceId[];
  sharedFilters: FilterSets | null;
  filterWatched: (items: ContentItem[]) => ContentItem[];
  filterLanguage: (items: ContentItem[]) => ContentItem[];
  onItemSelect: (item: ContentItem) => void;
  onSelectAnchorRoom: (preview: AnchorRoomPreview) => void;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (item: ContentItem) => void;
  watchedIds: Set<string>;
  /** Upcoming releases for the foot-of-page CalendarStrip. Optional. */
  upcoming?: UpcomingRelease[];
  /** Callback when the user taps a calendar entry. */
  onSelectUpcoming?: (item: UpcomingRelease) => void;
}

const MOOD_CHIPS = ['Slow burn', 'Comfort', 'Edge of seat', 'Cerebral', 'Funny', 'Romance'] as const;

// Hardcoded fingerprint chips — placeholder until the taste-v2 surface
// API exposes a "top dimensions" projection. Each label is a real
// fingerprint axis from the taste-v2 docs; they'll come from a real
// computation in the follow-up.
const FINGERPRINT_CHIPS = ['Slow burn', 'Drama', '2010s', 'Critic-acclaimed'];

function getGreeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'GOOD MORNING';
  if (h >= 12 && h < 17) return 'GOOD AFTERNOON';
  if (h >= 17 && h < 22) return 'GOOD EVENING';
  return 'LATE NIGHT';
}

function ChipPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'span';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className="shrink-0 px-3 py-1.5"
      style={{
        background: active ? 'var(--primary)' : 'var(--surface-tint)',
        color: active ? '#fff' : 'var(--fg-soft)',
        borderRadius: 'var(--r-pill)',
        fontFamily: 'var(--font-ui)',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '0.01em',
        transition: 'background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out)',
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * CoverStoryMoodRoom — 1 featured (full-bleed lead) + 3 supporting
 * (mosaic) titles drawn from a single AnchorRoomPreview's thumbnails.
 * Per docs/v3-design/redesign-plan.md ForYouPage row + design-system §5.
 */
function CoverStoryMoodRoom({
  room,
  onSelectItem,
  onSelectRoom,
  bookmarkedIds,
  onToggleBookmark,
  userServices,
  watchedIds,
}: {
  room: AnchorRoomPreview;
  onSelectItem: (item: ContentItem) => void;
  onSelectRoom: (room: AnchorRoomPreview) => void;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (item: ContentItem) => void;
  userServices: ServiceId[];
  watchedIds: Set<string>;
}) {
  const featured = room.thumbnails[0];
  const supporting = room.thumbnails.slice(1, 4);
  if (!featured) return null;

  const title = room.llmLabel?.label ?? `If you love ${room.anchorTitle}.`;

  return (
    <section className="mb-8">
      <div className="editorial">
        <SectionHead
          kicker="COVER-STORY MOOD"
          title={title}
          standfirst={`${room.titleCount} titles tuned to this thread.`}
          right={
            <button
              type="button"
              onClick={() => onSelectRoom(room)}
              className="text-primary"
              style={{ fontSize: 'var(--t-meta)', fontWeight: 500 }}
            >
              See room →
            </button>
          }
        />
        <div className="mb-3">
          <ContentCard
            item={featured}
            variant="lead"
            onSelect={onSelectItem}
            bookmarked={bookmarkedIds.has(featured.id)}
            onToggleBookmark={onToggleBookmark}
            userServices={userServices}
            watched={watchedIds.has(featured.id)}
          />
        </div>
        {supporting.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {supporting.map((item) => (
              <ContentCard
                key={item.id}
                item={item}
                variant="mosaic"
                onSelect={onSelectItem}
                bookmarked={bookmarkedIds.has(item.id)}
                onToggleBookmark={onToggleBookmark}
                userServices={userServices}
                watched={watchedIds.has(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function ForYouPage({
  providerIds,
  connectedServiceIds,
  sharedFilters,
  filterWatched,
  filterLanguage,
  onItemSelect,
  onSelectAnchorRoom,
  bookmarkedIds,
  onToggleBookmark,
  watchedIds,
  upcoming,
  onSelectUpcoming,
}: ForYouPageProps) {
  const content = useForYouContent(providerIds, sharedFilters);
  const anchorRooms = useAnchorMoodRooms(
    providerIds,
    sharedFilters,
    content.pool,
    content.sliders,
    content.prebuiltAnchorRooms,
  );
  const [showSliderTray, setShowSliderTray] = useState(false);
  const [activeMood, setActiveMood] = useState<string | null>(null);

  const applyFilters = useCallback(
    (items: ContentItem[]) => filterLanguage(filterWatched(items)),
    [filterLanguage, filterWatched],
  );

  const handleSlidersChange = useCallback(
    (newSliders: SliderState) => content.rerank(newSliders),
    [content],
  );

  const recs = useMemo(() => applyFilters(content.recommendedForYou), [applyFilters, content.recommendedForYou]);
  const topPick = recs[0];

  // Mood-refined "In your mood" row. Without a real taste-v2 mood filter
  // the chip is currently a no-op; the row still re-titles to reflect
  // the active mood so the UX reads correctly.
  const inYourMood = recs.slice(topPick ? 1 : 0);

  const coverStoryRoom = anchorRooms.rooms[0] ?? null;

  const continueExploring = useMemo(() => applyFilters(content.hiddenGems), [applyFilters, content.hiddenGems]);
  const watchlistPreview = useMemo(
    () => applyFilters(content.fromYourWatchlist).slice(0, 12),
    [applyFilters, content.fromYourWatchlist],
  );
  const outsideUsual = useMemo(
    () => applyFilters(content.outsideYourUsual),
    [applyFilters, content.outsideYourUsual],
  );

  // Quick watch — items with runtime <= 30 across the available pools.
  const quickWatch = useMemo(() => {
    const seen = new Set<string>();
    const all: ContentItem[] = [
      ...content.recommendedForYou,
      ...content.hiddenGems,
      ...content.outsideYourUsual,
    ];
    return applyFilters(all).filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return typeof it.runtime === 'number' && it.runtime > 0 && it.runtime <= 30;
    });
  }, [applyFilters, content.recommendedForYou, content.hiddenGems, content.outsideYourUsual]);

  const isEmpty =
    content.recommendedForYou.length === 0 &&
    content.hiddenGems.length === 0 &&
    content.outsideYourUsual.length === 0 &&
    content.fromYourWatchlist.length === 0;

  if (content.loading) {
    return (
      <div className="px-0 pt-2">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="px-0 pt-2">
        <p className="editorial text-center py-12" style={{ color: 'var(--fg-soft)', fontSize: 'var(--t-body)' }}>
          Complete onboarding to see personalised recommendations here.
        </p>
      </div>
    );
  }

  return (
    <div className="px-0 pt-2">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        {/* §5.1 — Greeting + top pick */}
        {topPick && (
          <div className="editorial mb-8 mt-2">
            <MagazineHero
              item={topPick}
              kicker={`${getGreeting()} · YOUR PICK FOR TONIGHT`}
              standfirst={
                [topPick.year, topPick.genre].filter(Boolean).join(' · ') || undefined
              }
              userServices={connectedServiceIds}
              onSelect={onItemSelect}
            />
          </div>
        )}

        {/* §5.2 — Taste fingerprint */}
        <div className="editorial mb-8">
          <div className="flex items-center justify-between mb-2">
            <Kicker>YOUR TASTE</Kicker>
            {content.sliders && (
              <button
                type="button"
                onClick={() => setShowSliderTray(true)}
                className="inline-flex items-center gap-1.5"
                style={{
                  color: 'var(--fg-soft)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 500,
                }}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Tune</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {FINGERPRINT_CHIPS.map((chip) => (
              <ChipPill key={chip}>{chip}</ChipPill>
            ))}
          </div>
        </div>

        {/* §5.3 — Mood chip refiner */}
        <div className="mb-3">
          <div className="editorial mb-2">
            <Kicker>REFINE YOUR MOOD</Kicker>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 pb-1">
            {MOOD_CHIPS.map((chip) => (
              <ChipPill
                key={chip}
                active={activeMood === chip}
                onClick={() => setActiveMood(activeMood === chip ? null : chip)}
              >
                {chip}
              </ChipPill>
            ))}
          </div>
        </div>

        {/* §5.4 — In your mood */}
        {inYourMood.length > 0 && (
          <ContentRow
            kicker="IN YOUR MOOD"
            title={
              activeMood
                ? `Tuned to ${activeMood.toLowerCase()}.`
                : 'Picked for you tonight.'
            }
            standfirst={
              activeMood
                ? undefined
                : 'A first cut from your taste profile, with the chart pulled in.'
            }
            sectionKey="foryou-in-mood"
            sourceSurface="for_you"
            items={inYourMood}
            onItemSelect={onItemSelect}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={onToggleBookmark}
            userServices={connectedServiceIds}
            watchedIds={watchedIds}
          />
        )}

        {/* §5.5 — Cover-story mood room (1 featured + 3 supporting) */}
        {coverStoryRoom && (
          <CoverStoryMoodRoom
            room={coverStoryRoom}
            onSelectItem={onItemSelect}
            onSelectRoom={onSelectAnchorRoom}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={onToggleBookmark}
            userServices={connectedServiceIds}
            watchedIds={watchedIds}
          />
        )}

        {/* §5.6 — Continue exploring */}
        {continueExploring.length > 0 && (
          <ContentRow
            kicker="KEEP GOING"
            title="Continue exploring."
            sectionKey="foryou-continue"
            sourceSurface="for_you"
            items={continueExploring}
            onItemSelect={onItemSelect}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={onToggleBookmark}
            userServices={connectedServiceIds}
            watchedIds={watchedIds}
          />
        )}

        {/* §5.7 — Watchlist preview */}
        {watchlistPreview.length > 0 && (
          <ContentRow
            kicker="ON YOUR WATCHLIST"
            title="From your list."
            standfirst="Pick up where you left off."
            sectionKey="foryou-watchlist"
            sourceSurface="for_you"
            items={watchlistPreview}
            onItemSelect={onItemSelect}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={onToggleBookmark}
            userServices={connectedServiceIds}
            watchedIds={watchedIds}
          />
        )}

        {/* §5.8 — Outside your usual */}
        {outsideUsual.length > 0 && (
          <ContentRow
            kicker="OUTSIDE YOUR USUAL"
            title="A nudge sideways."
            standfirst="Off-pattern picks the algorithm thinks you'll like anyway."
            sectionKey="foryou-outside"
            sourceSurface="for_you"
            items={outsideUsual}
            onItemSelect={onItemSelect}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={onToggleBookmark}
            userServices={connectedServiceIds}
            watchedIds={watchedIds}
          />
        )}

        {/* §5.9 — Quick watch */}
        {quickWatch.length > 0 && (
          <ContentRow
            kicker="QUICK WATCH"
            title="Under thirty minutes."
            sectionKey="foryou-quick"
            sourceSurface="for_you"
            items={quickWatch}
            onItemSelect={onItemSelect}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={onToggleBookmark}
            userServices={connectedServiceIds}
            watchedIds={watchedIds}
          />
        )}

        {/* §5.10 — Calendar strip */}
        {upcoming && upcoming.length > 0 && onSelectUpcoming && (
          <CalendarStrip
            items={upcoming}
            kicker="ON THE CALENDAR"
            title="Coming up."
            standfirst="The next two weeks across your stack."
            onSelect={onSelectUpcoming}
          />
        )}
      </motion.div>

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
