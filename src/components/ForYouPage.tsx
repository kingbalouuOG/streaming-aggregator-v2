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
 * Taste fingerprint sliders are wired to live engine state
 * (content.sliders → rerank on commit). Still stubbed: the
 * "ratings · updated" metadata line (hardcoded copy) and the mood
 * refiner (no-op, behind MOOD_REFINER_ENABLED — parking-lot IN-V3-003).
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { TasteSlider } from './TasteSlider';
import { ContentRow } from './ContentRow';
import { NumberedChart } from './NumberedChart';
import { SectionHead } from './SectionHead';
import { Kicker } from './Kicker';
import { SparkleIcon } from './icons';
import { GenreIconTile, MOOD_GLYPH_NAMES } from './genreIcons';
import { MagazineHero } from './MagazineHero';
import { CalendarList } from './CalendarList';
import { WideCard } from './WideCard';
import { MoodRoomCard, FeaturedMoodRoomCard } from './MoodRoomCard';
import { useAppStore } from "@/lib/store/appStore";
import { useAuth } from './AuthContext';
import { useForYouContent } from '@/hooks/useForYouContent';
import { useAnchorMoodRooms, type AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';
import type { FilterSets } from '@/lib/recommendations-v2/hardFilters';
import type { ContentItem } from './ContentCard';
import type { SliderState } from '@/lib/taste-v2/types';
import type { UpcomingRelease } from '@/hooks/useUpcoming';

interface ForYouPageProps {
  // PLAT-1 Workstream E: providerIds / connectedServiceIds /
  // bookmarkedIds / watchedIds and the item-select + bookmark actions
  // now come from the app store; only App-local wiring stays as props.
  sharedFilters: FilterSets | null;
  filterWatched: (items: ContentItem[]) => ContentItem[];
  filterLanguage: (items: ContentItem[]) => ContentItem[];
  onSelectAnchorRoom: (preview: AnchorRoomPreview) => void;
  /** Upcoming releases for the foot-of-page CalendarList. Optional. */
  upcoming?: UpcomingRelease[];
  /** Callback when the user taps a calendar entry. */
  onSelectUpcoming?: (item: UpcomingRelease) => void;
}

const MOOD_CHIPS = ['Slow burn', 'Comfort', 'Edge of seat', 'Cerebral', 'Funny', 'Romance'] as const;

/**
 * Hide the "Refine by feeling" UI until the real taste-v2 wiring lands
 * (parking-lot IN-V3-003). Flip to `true` once the data layer ships.
 */
const MOOD_REFINER_ENABLED = false;

/** Display name + subtitle per mood. Glyph comes from `MOOD_GLYPH_NAMES`. */
const MOOD_GLYPHS: Record<(typeof MOOD_CHIPS)[number], { title: string; subtitle: string }> = {
  'Slow burn':    { title: 'Wind down',   subtitle: 'Calm & slow' },
  'Comfort':      { title: 'Cosy night',  subtitle: 'Soft & easy' },
  'Edge of seat': { title: 'Pulse-up',    subtitle: 'High energy' },
  'Cerebral':     { title: 'Cerebral',    subtitle: 'Brain teaser' },
  'Funny':        { title: 'Funny',       subtitle: 'Belly laugh' },
  'Romance':      { title: 'Romance',     subtitle: 'Heart swell' },
};

function getGreeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'GOOD MORNING';
  if (h >= 12 && h < 17) return 'GOOD AFTERNOON';
  if (h >= 17 && h < 22) return 'GOOD EVENING';
  return 'LATE NIGHT';
}

/**
 * Relative "saved X ago" label for a watchlist item — mirrors the
 * WatchlistPage helper so the For You preview reads consistently.
 */
function savedAgo(addedAt?: number): string | undefined {
  if (!addedAt) return undefined;
  const minutes = Math.max(1, Math.floor((Date.now() - addedAt) / 60_000));
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Saved ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Saved yesterday';
  if (days < 7) return `Saved ${days} days ago`;
  if (days < 14) return 'Saved last week';
  if (days < 30) return `Saved ${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Saved ${months}mo ago`;
  return `Saved ${Math.floor(months / 12)}y ago`;
}

/**
 * Approximate the "across N of M services" stat for the featured
 * mood room — counts unique services across the room's thumbnails
 * (the only signal we have client-side without a separate query).
 */
function buildRoomStats(room: AnchorRoomPreview, totalServices: number): string {
  const services = new Set<string>();
  room.thumbnails.forEach((t) => t.services.forEach((s) => services.add(s)));
  const count = services.size;
  const fitLabel = "Strong fit";
  const acrossLabel =
    count > 0 && totalServices > 0
      ? `Across ${count} of ${totalServices} services`
      : null;
  return [fitLabel, `${room.titleCount} titles`, acrossLabel]
    .filter(Boolean)
    .join(" · ");
}

/**
 * CoverStoryMoodRoom — featured anchor room + a 2×2 grid of more
 * rooms below. Per the Phase-4 review: featured uses the
 * FeaturedMoodRoomCard treatment (atmosphere-tinted frame, fanned
 * thumbnails, italic quote, bullet stats, "Enter the room →" pill);
 * the grid uses MoodRoomCards in the same atmosphere-tile family.
 */
function CoverStoryMoodRoom({
  rooms,
  onSelectRoom,
  totalServiceCount,
}: {
  rooms: AnchorRoomPreview[];
  onSelectRoom: (room: AnchorRoomPreview) => void;
  totalServiceCount: number;
}) {
  if (rooms.length === 0) return null;

  const featured = rooms[0];
  const more = rooms.slice(1, 5);
  if (!featured.thumbnails.length) return null;

  const featuredLabel = featured.llmLabel?.label ?? `If you love ${featured.anchorTitle}`;
  const featuredQuote = featured.llmLabel?.description ?? undefined;

  return (
    <section className="mb-8">
      <div className="editorial mb-3">
        <SectionHead
          kicker="THIS WEEK'S FEATURED ROOM"
          title="Where you keep returning."
          standfirst="The room your watch history suggests as your strongest fit, refreshed weekly."
        />
      </div>
      <div className="editorial">
        <FeaturedMoodRoomCard
          id={featured.id}
          label={featuredLabel}
          titleCount={featured.titleCount}
          quote={featuredQuote}
          stats={buildRoomStats(featured, totalServiceCount)}
          thumbnails={featured.thumbnails}
          onSelect={() => onSelectRoom(featured)}
        />
      </div>

      {more.length > 0 && (
        <>
          <div className="editorial mt-8 mb-3">
            <SectionHead
              kicker={`${more.length === 1 ? "ONE" : more.length === 2 ? "TWO" : more.length === 3 ? "THREE" : "FOUR"} MORE ROOM${more.length === 1 ? "" : "S"}`}
              title="Your other taste neighbourhoods."
              right={
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "1.6px",
                    color: "var(--fg-soft)",
                  }}
                >
                  ALL ROOMS →
                </span>
              }
            />
          </div>
          <div className="editorial">
            <div className="grid grid-cols-2 gap-3">
              {more.map((room) => (
                <MoodRoomCard
                  key={room.id}
                  id={room.id}
                  label={room.llmLabel?.label ?? `If you love ${room.anchorTitle}`}
                  titleCount={room.titleCount}
                  thumbnails={room.thumbnails}
                  onSelect={() => onSelectRoom(room)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function ForYouPage({
  sharedFilters,
  filterWatched,
  filterLanguage,
  onSelectAnchorRoom,
  upcoming,
  onSelectUpcoming,
}: ForYouPageProps) {
  const { username } = useAuth();
  // App-level state/actions via the store (PLAT-1 Workstream E). Local
  // names match the old props so every internal usage is untouched.
  const providerIds = useAppStore((s) => s.providerIds);
  const connectedServiceIds = useAppStore((s) => s.userServices);
  const bookmarkedIds = useAppStore((s) => s.bookmarkedIds);
  const watchedIds = useAppStore((s) => s.watchedIds);
  const onItemSelect = useAppStore((s) => s.actions.onItemSelect);
  const onToggleBookmark = useAppStore((s) => s.actions.onToggleBookmark);
  const content = useForYouContent(providerIds, sharedFilters);
  const anchorRooms = useAnchorMoodRooms(
    providerIds,
    sharedFilters,
    content.pool,
    content.sliders,
    content.prebuiltAnchorRooms,
  );
  const [activeMood, setActiveMood] = useState<string | null>(null);

  // Inline taste-fingerprint editing. Locked by default — tap the lock
  // icon to unlock; sliders become draggable. Auto-relocks 5s after
  // the last interaction so the surface doesn't sit exposed if the
  // user wanders. Drafts are local during a drag; on pointer-release
  // we commit via `content.rerank` which updates the engine's slider
  // state and re-scores the cached pool.
  const [slidersUnlocked, setSlidersUnlocked] = useState(false);
  const [draftSliders, setDraftSliders] = useState<Partial<SliderState>>({});
  const lockTimerRef = useRef<number | null>(null);
  // Mirror of draftSliders so handleSliderCommit can read the latest
  // in-flight drafts without listing draftSliders as a dep (which would
  // rebuild the callback every drag tick).
  const draftSlidersRef = useRef(draftSliders);
  draftSlidersRef.current = draftSliders;

  const cancelLockTimer = useCallback(() => {
    if (lockTimerRef.current !== null) {
      window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
  }, []);

  const armLockTimer = useCallback(() => {
    cancelLockTimer();
    lockTimerRef.current = window.setTimeout(() => {
      setSlidersUnlocked(false);
      setDraftSliders({});
      lockTimerRef.current = null;
    }, 5000);
  }, [cancelLockTimer]);

  useEffect(() => () => cancelLockTimer(), [cancelLockTimer]);

  // Pointer down on any slider — kill the relock timer outright so it
  // cannot fire while a thumb is held (even if the user pauses mid-drag
  // without moving). It is re-armed on commit. This is the fix for the
  // "held the slider for 5s, it relocked and threw the edit away" bug.
  const handleSliderDragStart = useCallback(() => {
    cancelLockTimer();
  }, [cancelLockTimer]);

  const handleSliderDraft = useCallback(
    (key: keyof SliderState, value: number) => {
      setDraftSliders((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSliderCommit = useCallback(
    (key: keyof SliderState, value: number) => {
      if (!content.sliders) return;
      // Merge against any OTHER still-in-flight drafts (concurrent
      // multi-touch on a second slider) so a second commit reading a
      // pre-merge content.sliders snapshot can't clobber the first.
      content.rerank({ ...content.sliders, ...draftSlidersRef.current, [key]: value });
      setDraftSliders((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      armLockTimer();
    },
    // Deliberately narrow: content.rerank is a stable useCallback and
    // content.sliders only changes on commit. Depending on the whole
    // `content` object would rebuild this every render (it re-identifies
    // each load/rerank) for no behavioural gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content.sliders, content.rerank, armLockTimer],
  );

  const handleLockToggle = useCallback(() => {
    setSlidersUnlocked((wasUnlocked) => {
      if (wasUnlocked) {
        cancelLockTimer();
        setDraftSliders({});
        return false;
      }
      armLockTimer();
      return true;
    });
  }, [armLockTimer, cancelLockTimer]);

  const applyFilters = useCallback(
    (items: ContentItem[]) => filterLanguage(filterWatched(items)),
    [filterLanguage, filterWatched],
  );


  const recs = useMemo(() => applyFilters(content.recommendedForYou), [applyFilters, content.recommendedForYou]);
  const topPick = recs[0];

  // Mood-refined "In your mood" row. Without a real taste-v2 mood filter
  // the chip is currently a no-op; the row still re-titles to reflect
  // the active mood so the UX reads correctly.
  const inYourMood = recs.slice(topPick ? 1 : 0);

  const moodRooms = anchorRooms.rooms;

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
    // PLAT-1 polish: structured skeleton of the actual §5 anatomy
    // (greeting → hero → fingerprint card → two rows) instead of a
    // spinner — first composition takes seconds (PLAT-3 moves it
    // server-side); until then the page should read as "composing",
    // not "stuck".
    return (
      <div className="px-0 pt-2" aria-busy="true" aria-label="Composing your page">
        <div className="px-5 mb-4">
          <div className="h-3 w-28 rounded bg-secondary/80 animate-pulse mb-3" />
          <div className="h-8 w-3/4 rounded bg-secondary/80 animate-pulse" />
        </div>
        <div className="px-5 mb-6">
          <div className="w-full aspect-[4/5] rounded-2xl bg-secondary/80 animate-pulse" />
        </div>
        <div className="px-5 mb-8">
          <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
        </div>
        {[0, 1].map((row) => (
          <div key={row} className="mb-8">
            <div className="px-5 mb-3">
              <div className="h-3 w-24 rounded bg-secondary/70 animate-pulse mb-2" />
              <div className="h-6 w-1/2 rounded bg-secondary/70 animate-pulse" />
            </div>
            <div className="flex gap-3 px-5 overflow-hidden">
              {[0, 1, 2].map((i) => (
                <div key={i} className="shrink-0 w-[160px]">
                  <div className="w-[160px] aspect-[5/7] rounded-xl bg-secondary/80 animate-pulse" />
                  <div className="h-3 w-24 rounded bg-secondary/60 animate-pulse mt-2" />
                </div>
              ))}
            </div>
          </div>
        ))}
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
        {/* B2 — Page header above the hero. The kicker carries the
            greeting + day; the Fraunces title is the editorial standfirst
            ("Edited for you."). Display name is hardcoded for now and
            will be threaded from the auth profile in a follow-up. */}
        <div className="editorial mb-4 mt-2">
          <Kicker>{`FOR ${(username ?? 'YOU').toUpperCase()} · ${getGreeting()}`}</Kicker>
          <h1
            className="mt-1"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--t-headline)',
              fontWeight: 700,
              fontVariationSettings: '"opsz" 48',
              letterSpacing: '-0.015em',
              color: 'var(--fg)',
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            Edited for you.
          </h1>
        </div>

        {/* §5.1 — Greeting + top pick */}
        {topPick ? <div className="editorial mb-8">
            <MagazineHero
              item={topPick}
              kicker="TONIGHT'S PICK"
              standfirst={topPick.overview}
              userServices={connectedServiceIds}
              onSelect={onItemSelect}
              statusPill={
                topPick.matchPercentage != null
                  ? `✨ ${topPick.matchPercentage}% match`
                  : undefined
              }
              bookmarked={bookmarkedIds.has(topPick.id)}
              onToggleBookmark={onToggleBookmark}
              onMoreInfo={onItemSelect}
              runtime={topPick.runtime}
              inYourPlan={
                connectedServiceIds.length > 0 &&
                topPick.services.some((s) => connectedServiceIds.includes(s))
              }
            />
          </div> : null}

        {/* §5.2 — Taste fingerprint card. Header (icon + title +
            metadata + Tune) and a 2-column grid of sliders.
            "327 ratings · updated this morning" is hardcoded — taste-v2
            surface to provide the real signal in a follow-up. */}
        <div
          className="mx-5 mb-8 p-4"
          style={{
            background: 'var(--surface-elev)',
            border: '0.5px solid var(--hairline)',
            borderRadius: 'var(--r-card)',
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 min-w-0">
              <span
                aria-hidden
                className="shrink-0 inline-flex items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--r-md)',
                  background: 'color-mix(in srgb, var(--primary) 20%, transparent)',
                  color: 'var(--primary)',
                }}
              >
                <SparkleIcon className="w-5 h-5" />
              </span>
              <div className="flex flex-col min-w-0">
                <h2
                  className="line-clamp-1"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 18,
                    fontWeight: 700,
                    fontVariationSettings: '"opsz" 36',
                    letterSpacing: '-0.01em',
                    color: 'var(--fg)',
                    lineHeight: 1.2,
                    margin: 0,
                  }}
                >
                  Your taste fingerprint
                </h2>
                <span
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--fg-soft)',
                    marginTop: 2,
                  }}
                >
                  327 ratings · updated this morning
                </span>
              </div>
            </div>
            {content.sliders ? <button
                type="button"
                onClick={handleLockToggle}
                aria-label={slidersUnlocked ? 'Lock taste sliders' : 'Unlock taste sliders to edit'}
                aria-pressed={slidersUnlocked}
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 transition-colors"
                style={{
                  background: slidersUnlocked
                    ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                    : 'var(--surface-tint)',
                  color: slidersUnlocked ? 'var(--primary)' : 'var(--fg-soft)',
                  border: slidersUnlocked
                    ? '1px solid color-mix(in srgb, var(--primary) 50%, transparent)'
                    : '1px solid transparent',
                  borderRadius: 'var(--r-pill)',
                }}
              >
                {slidersUnlocked
                  ? <LockOpen className="w-4 h-4" />
                  : <Lock className="w-4 h-4" />}
              </button> : null}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {([
              { key: 'catalogueAge', left: 'NEW',     right: 'CLASSIC',    label: 'Catalogue age' },
              { key: 'comfortZone',  left: 'COSY',    right: 'SURPRISE',   label: 'Comfort zone' },
              // contentMix is 0 = films, 1 = TV (taste-v2 types.ts) —
              // FILM must sit at the low end. The original TV-left axis
              // mirrored both the readout AND the write: dragging "TV"
              // to max wrote contentMix≈0, which the pipeline reads as
              // 80% films (the device-test bug, 2026-06-10).
              { key: 'contentMix',   left: 'FILM',    right: 'TV',         label: 'Content mix' },
              { key: 'variety',      left: 'FOCUSED', right: 'VARIETY',    label: 'Focus' },
            ] as const).map(({ key, left, right, label }) => {
              // Drafts override the engine's value while the user is
              // actively dragging; otherwise we read the committed
              // engine state. Falling back to 0.5 keeps the thumb
              // centred until taste-v2 finishes loading.
              const liveValue =
                draftSliders[key] ?? content.sliders?.[key] ?? 0.5;
              return (
                <TasteSlider
                  key={key}
                  value={liveValue}
                  editable={slidersUnlocked}
                  onDragStart={handleSliderDragStart}
                  onChange={(v) => handleSliderDraft(key, v)}
                  onCommit={(v) => handleSliderCommit(key, v)}
                  left={left}
                  right={right}
                  label={label}
                />
              );
            })}
          </div>
        </div>

        {/* §5.3 — Mood refiner. Hidden until the real taste-v2 wiring
            lands (see parking-lot IN-V3-003); the UI is finished but the
            buttons currently only re-title the row beneath, which reads
            as broken. Re-enable by flipping `MOOD_REFINER_ENABLED`. */}
        {MOOD_REFINER_ENABLED && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 px-5">
            <Kicker>REFINE BY FEELING</Kicker>
            <button
              type="button"
              onClick={() => setActiveMood(null)}
              disabled={!activeMood}
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 12,
                fontWeight: 500,
                color: activeMood ? 'var(--fg-soft)' : 'var(--fg-faint)',
                cursor: activeMood ? 'pointer' : 'default',
              }}
            >
              {`Clear · ${activeMood ? '1' : '0'} active`}
            </button>
          </div>
          <div
            className="flex gap-2 overflow-x-auto no-scrollbar px-5 pb-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {MOOD_CHIPS.map((chip) => {
              const glyph = MOOD_GLYPHS[chip];
              const active = activeMood === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setActiveMood(active ? null : chip)}
                  className="shrink-0 flex items-center gap-3 px-3 py-3 text-left"
                  style={{
                    width: 200,
                    background: active
                      ? 'color-mix(in srgb, #10b981 14%, var(--surface-elev))'
                      : 'var(--surface-elev)',
                    border: active
                      ? '1px solid #10b981'
                      : '0.5px solid var(--hairline)',
                    borderRadius: 'var(--r-md)',
                    color: 'var(--fg)',
                    transition:
                      'background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out)',
                  }}
                  aria-pressed={active ? 'true' : 'false'}
                  aria-label={glyph.title}
                >
                  <GenreIconTile glyph={MOOD_GLYPH_NAMES[chip]} size={36} />
                  <span className="flex flex-col min-w-0">
                    <span
                      className="line-clamp-1"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 16,
                        fontWeight: 700,
                        fontVariationSettings: '"opsz" 24',
                        letterSpacing: '-0.01em',
                        lineHeight: 1.2,
                        color: 'var(--fg)',
                      }}
                    >
                      {glyph.title}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--fg-soft)',
                        marginTop: 2,
                      }}
                    >
                      {glyph.subtitle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {activeMood ? <div className="mt-3 px-5">
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                  color: 'var(--primary)',
                  border: '0.5px solid color-mix(in srgb, var(--primary) 45%, transparent)',
                  borderRadius: 'var(--r-pill)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {MOOD_GLYPHS[activeMood as (typeof MOOD_CHIPS)[number]].title}
                <span style={{ color: 'var(--fg-soft)' }}>·</span>
                {`${inYourMood.length} IN YOUR STACK`}
              </span>
            </div> : null}
        </div>
        )}

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

        {/* §5.5 — Cover-story featured room + 5-more grid */}
        {moodRooms.length > 0 && (
          <CoverStoryMoodRoom
            rooms={moodRooms}
            onSelectRoom={onSelectAnchorRoom}
            totalServiceCount={connectedServiceIds.length}
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

        {/* Because you watched … — one row per watched anchor. The
            kicker references the anchor; the title invites the lean-in. */}
        {content.becauseYouWatched.map((row) => (
          <ContentRow
            key={`byw-${row.anchor.id}`}
            kicker={`BECAUSE YOU WATCHED ${row.anchor.title.toUpperCase()}`}
            title="More like this."
            sectionKey={`foryou-byw-${row.anchor.id}`}
            sourceSurface="for_you"
            items={applyFilters(row.items)}
            onItemSelect={onItemSelect}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={onToggleBookmark}
            userServices={connectedServiceIds}
            watchedIds={watchedIds}
          />
        ))}

        {/* §5.7 — Watchlist preview. Reuses the chart-style row anatomy
            (thumb + title + meta + Play tile) without rank numerals.
            Renders only as many rows as the user has saved — `limit`
            caps it at 5 but the section auto-shrinks for shorter lists.
            Meta line shows service · "Saved X ago". */}
        {watchlistPreview.length > 0 && (
          <NumberedChart
            kicker="YOUR SHELF"
            title="From your watchlist"
            standfirst="Saved for later — pick one back up."
            items={watchlistPreview}
            limit={5}
            numbered={false}
            userServices={connectedServiceIds}
            onSelect={onItemSelect}
            subtitleFor={(it) => savedAgo(it.addedAt)}
          />
        )}

        {/* §5.8 — Outside your usual */}
        {outsideUsual.length > 0 && (
          <section className="mb-8">
            <div className="editorial mb-3">
              <SectionHead
                kicker="OUTSIDE YOUR USUAL"
                title="A nudge sideways."
                standfirst="Off-pattern picks the algorithm thinks you'll like anyway."
              />
            </div>
            <div
              className="flex gap-4 overflow-x-auto no-scrollbar px-5 pb-1"
              style={{ scrollbarWidth: 'none' }}
            >
              {outsideUsual.map((item) => (
                <WideCard
                  key={item.id}
                  item={item}
                  userServices={connectedServiceIds}
                  onSelect={onItemSelect}
                />
              ))}
            </div>
          </section>
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

        {/* §5.10 — Calendar list */}
        {upcoming && upcoming.length > 0 && onSelectUpcoming ? <CalendarList
            items={upcoming}
            kicker="ON THE CALENDAR"
            title="Coming up."
            standfirst="The next two weeks across your stack."
            onSelect={onSelectUpcoming}
          /> : null}
      </motion.div>
    </div>
  );
}
