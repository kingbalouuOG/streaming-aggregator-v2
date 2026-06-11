import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { ArrowLeft, Bookmark, Star, Loader2, ThumbsUp, ThumbsDown, Plus, Eye, EyeOff, Check, CheckCircle2, Undo2, AlertCircle, ChevronDown, ChevronUp, MessageSquare, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { ServiceBadge } from "./ServiceBadge";
import { SectionHead } from "./SectionHead";
import { ContentCard } from "./ContentCard";
import { ImageSkeleton } from "./ImageSkeleton";
import type { ServiceId } from "./platformLogos";
import { serviceLabels as platformServiceLabels } from "./platformLogos";
import { useContentDetail } from "@/hooks/useContentDetail";
import type { DetailData, RentalOption, ServiceLink } from "@/lib/adapters/detailAdapter";
import { getDeepLink } from "@/lib/deepLinks";
import { openDeepLink } from "@/lib/openDeepLink";
import { classifyProviders } from "@/lib/utils/providerClassifier";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import { startDwell, exitDwell, setLastAction, getCurrentDwellSeconds } from "@/lib/instrumentation/dwellTimer";
import { markNotInterested } from "@/lib/storage/interactions";
import { useAppStore } from "@/lib/store/appStore";
import rottenTomatoesLogo from "@/assets/rotten-tomatoes-logo.png";
import { ReportSheet } from "./ReportSheet";

export type { DetailData };

const serviceLabels = platformServiceLabels;

const languageFlags: Record<string, string> = {
  English: "\uD83C\uDDEC\uD83C\uDDE7",
  Japanese: "\uD83C\uDDEF\uD83C\uDDF5",
  Korean: "\uD83C\uDDF0\uD83C\uDDF7",
  Spanish: "\uD83C\uDDEA\uD83C\uDDF8",
  French: "\uD83C\uDDEB\uD83C\uDDF7",
  German: "\uD83C\uDDE9\uD83C\uDDEA",
  Hindi: "\uD83C\uDDEE\uD83C\uDDF3",
  Italian: "\uD83C\uDDEE\uD83C\uDDF9",
  Turkish: "\uD83C\uDDF9\uD83C\uDDF7",
  Danish: "\uD83C\uDDE9\uD83C\uDDF0",
  Norwegian: "\uD83C\uDDF3\uD83C\uDDF4",
  Swedish: "\uD83C\uDDF8\uD83C\uDDEA",
  Chinese: "\uD83C\uDDE8\uD83C\uDDF3",
  Portuguese: "\uD83C\uDDF5\uD83C\uDDF9",
  Thai: "\uD83C\uDDF9\uD83C\uDDED",
  Polish: "\uD83C\uDDF5\uD83C\uDDF1",
  Dutch: "\uD83C\uDDF3\uD83C\uDDF1",
  Russian: "\uD83C\uDDF7\uD83C\uDDFA",
  Arabic: "\uD83C\uDDF8\uD83C\uDDE6",
};

interface DetailPageProps {
  itemId: string;
  itemTitle?: string;
  itemImage?: string;
  onBack: () => void;
  /** Toggles the CURRENT item (App closes over its selectedItem so the
   *  full ContentItem — genreIds, services, type — feeds taste
   *  tracking; the page only knows id/title/image). */
  onToggleBookmark?: () => void;
}

export function DetailPage({ itemId, itemTitle, itemImage, onBack, onToggleBookmark }: DetailPageProps) {
  // PLAT-1: app-level state + stable action callbacks from the store
  // (App is the writer; this page is a reader).
  const bookmarkedIds = useAppStore((s) => s.bookmarkedIds);
  const watchedIds = useAppStore((s) => s.watchedIds);
  const userServices = useAppStore((s) => s.userServices);
  const connectedServices = useAppStore((s) => s.providerIds);
  const ratings = useAppStore((s) => s.ratings);
  const onItemSelect = useAppStore((s) => s.actions.onItemSelect);
  const onToggleBookmarkItem = useAppStore((s) => s.actions.onToggleBookmark);
  const onMoveToWatched = useAppStore((s) => s.actions.onMoveToWatched);
  const onMoveToWantToWatch = useAppStore((s) => s.actions.onMoveToWantToWatch);
  const onRate = useAppStore((s) => s.actions.onRate);
  const bookmarked = bookmarkedIds.has(itemId);
  const userRating = ratings[itemId] || null;

  const { detail, similar, loading, error } = useContentDetail(itemId, connectedServices);
  const isWatched = watchedIds.has(itemId);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [descOverflows, setDescOverflows] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  // Dwell timer lifecycle (IN-001 / Task 8). Starts when the detail
  // page mounts and fires a dwell_event on unmount with the most
  // recent action set via setLastAction(), defaulting to
  // 'back_to_previous' if the user just backed out. The cleanup
  // function is called on unmount regardless of cause (back button,
  // tab change, app close).
  useEffect(() => {
    const { tmdbId, mediaType } = parseContentItemId(itemId);
    startDwell(tmdbId, mediaType);
    return () => {
      // exitDwell is idempotent — if an action path (deep link click,
      // not_interested button) already exited, this is a no-op.
      exitDwell();
    };
  }, [itemId]);

  // Not Interested handler (Task 9b / IN-007).
  //
  // Sequence is deliberate:
  //   1. exitDwell emits dwell_event with exit_reason='not_interested'
  //      while the user is still logically on the page.
  //   2. await markNotInterested writes the not_interested row AND
  //      invalidates the getDismissedIds session cache, so the v1 rec
  //      engine filters this title on next refresh. We await rather
  //      than fire-and-forget because Joe explicitly wants the title
  //      to disappear on next refresh — fire-and-forget would race
  //      the cache invalidation against the post-navigation rec load.
  //   3. onBack triggers unmount; the cleanup effect's exitDwell is
  //      a no-op because we already exited.
  const handleNotInterested = async () => {
    const { tmdbId, mediaType } = parseContentItemId(itemId);
    exitDwell('not_interested');
    try {
      await markNotInterested(tmdbId, mediaType);
    } catch (err) {
      console.error('[DetailPage] markNotInterested failed:', err);
    }
    onBack();
  };

  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el || descExpanded) return;
    // Temporarily remove clamp to measure natural height (no flash — runs before paint)
    const savedDisplay = el.style.display;
    const savedOverflow = el.style.overflow;
    const savedClamp = el.style.webkitLineClamp;
    const savedOrient = el.style.webkitBoxOrient;
    el.style.display = 'block';
    el.style.overflow = 'visible';
    el.style.webkitLineClamp = 'unset';
    el.style.webkitBoxOrient = '';
    const naturalHeight = el.scrollHeight;
    // Restore
    el.style.display = savedDisplay;
    el.style.overflow = savedOverflow;
    el.style.webkitLineClamp = savedClamp;
    el.style.webkitBoxOrient = savedOrient;
    setDescOverflows(naturalHeight > el.clientHeight + 1);
  });

  // Loading state — show known data from card immediately, skeleton for enriched content
  if (loading || !detail) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="relative w-full aspect-[4/3] shrink-0 bg-secondary">
          {itemImage ? <ImageSkeleton src={itemImage} alt={itemTitle || ''} className="w-full h-full object-cover" priority /> : null}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <button
            onClick={onBack}
            className="absolute left-4 w-9 h-9 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/90"
            style={{ top: "max(1rem, env(safe-area-inset-top, 1rem))" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pb-8 -mt-4 relative z-10">
          {itemTitle ? (
            <h1 className="text-foreground text-[22px] leading-tight mb-2" style={{ fontWeight: 800 }}>{itemTitle}</h1>
          ) : (
            <div className="h-7 w-48 bg-secondary rounded animate-pulse mb-2" />
          )}
          <div className="h-4 w-24 bg-secondary rounded animate-pulse mb-4" />
          <div className="flex gap-2 mb-4">
            <div className="h-8 w-20 bg-secondary rounded-lg animate-pulse" />
            <div className="h-8 w-20 bg-secondary rounded-lg animate-pulse" />
          </div>
          <div className="space-y-2 mb-6">
            <div className="h-4 w-full bg-secondary rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-secondary rounded animate-pulse" />
          </div>
          <div className="flex items-center justify-center pt-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-foreground text-[16px] mb-1" style={{ fontWeight: 600 }}>
          Something went wrong
        </p>
        <p className="text-muted-foreground text-[13px] mb-4">{error}</p>
        <button onClick={onBack} className="text-primary text-[14px]" style={{ fontWeight: 600 }}>Go back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Editorial hero — full-bleed image with Fraunces title overlay */}
      <div className="relative w-full aspect-[4/5] shrink-0">
        <ImageSkeleton
          src={detail.heroImage}
          alt={detail.title}
          className="absolute inset-0 w-full h-full object-cover"
          priority
        />
        {/* Bottom gradient — reads the title block */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.55) 35%, rgba(10,10,15,0) 65%)",
          }}
        />

        <button
          onClick={onBack}
          className="absolute left-4 w-9 h-9 flex items-center justify-center"
          style={{
            top: "max(1rem, env(safe-area-inset-top, 1rem))",
            borderRadius: "var(--r-md)",
            background: "rgba(20, 20, 28, 0.5)",
            backdropFilter: "blur(8px) saturate(160%)",
            WebkitBackdropFilter: "blur(8px) saturate(160%)",
            color: "#fff",
          }}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Status badge (non-interactive) */}
        {(isWatched || bookmarked) ? <div
            className="absolute right-4 w-8 h-8 flex items-center justify-center"
            style={{
              top: "max(1rem, env(safe-area-inset-top, 1rem))",
              borderRadius: "var(--r-md)",
              background: isWatched ? "var(--success)" : "var(--primary)",
              color: "#fff",
            }}
            aria-label={isWatched ? "Watched" : "Bookmarked"}
          >
            {isWatched ? (
              <Check className="w-4 h-4" />
            ) : (
              <Bookmark className="w-4 h-4 fill-current" />
            )}
          </div> : null}

        {/* Title block — overlaid bottom of hero */}
        <h1
          className="absolute left-5 right-5 bottom-5"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            fontWeight: 800,
            fontVariationSettings: '"opsz" 96',
            letterSpacing: "-0.02em",
            color: "#fff",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          {detail.title}
        </h1>
      </div>

      {/* Content */}
      <div className="px-5 pb-8 pt-5 relative z-10">
        <p className="text-muted-foreground text-[13px] mb-3">
          {detail.year} <span className="mx-1.5">&middot;</span> {detail.contentRating}
          {detail.runtime ? <><span className="mx-1.5">&middot;</span> {detail.runtime}</> : null}
          {detail.seasons ? <><span className="mx-1.5">&middot;</span> {detail.seasons} Season{detail.seasons !== 1 ? 's' : ''}</> : null}
          {detail.language ? <>
              <span className="mx-1.5">&middot;</span>
              <span className="inline-flex items-center gap-1">
                {languageFlags[detail.language] ? <span style={{ fontSize: '14px', lineHeight: 1 }}>{languageFlags[detail.language]}</span> : null}
                {detail.language}
              </span>
            </> : null}
        </p>

        {/* Rating badges + thumbs */}
        <div className="flex items-center justify-between gap-2.5 mb-4">
          <div className="flex items-center gap-2.5">
            {detail.imdbRating > 0 && (
              <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2.5 py-1.5">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                <span className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
                  {detail.imdbRating.toFixed(1)}
                </span>
                <span className="text-muted-foreground text-[11px]">IMDb</span>
              </div>
            )}

            {detail.rottenTomatoes > 0 && (
              <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2.5 py-1.5">
                <img src={rottenTomatoesLogo} alt="RT" className="w-4 h-4" />
                <span className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
                  {detail.rottenTomatoes}%
                </span>
                <span className="text-muted-foreground text-[11px]">RT</span>
              </div>
            )}
          </div>

          {/* Thumbs rating buttons — always visible */}
          <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                <motion.button
                  onClick={() => {
                    setLastAction('thumbs_up');
                    onRate(itemId, userRating === 'up' ? null : 'up');
                  }}
                  whileTap={{ scale: 0.8 }}
                  animate={userRating === 'up' ? { scale: [1, 1.2, 1] } : undefined}
                  transition={{ duration: 0.3 }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                    userRating === 'up'
                      ? "text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                  style={userRating === 'up' ? { backgroundColor: 'var(--success)' } : undefined}
                >
                  <ThumbsUp className={`w-3.5 h-3.5 ${userRating === 'up' ? 'fill-current' : ''}`} />
                </motion.button>
                <motion.button
                  onClick={() => {
                    setLastAction('thumbs_down');
                    onRate(itemId, userRating === 'down' ? null : 'down');
                  }}
                  whileTap={{ scale: 0.8 }}
                  animate={userRating === 'down' ? { scale: [1, 1.2, 1] } : undefined}
                  transition={{ duration: 0.3 }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                    userRating === 'down'
                      ? "text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                  style={userRating === 'down' ? { backgroundColor: 'var(--danger)' } : undefined}
                >
                  <ThumbsDown className={`w-3.5 h-3.5 ${userRating === 'down' ? 'fill-current' : ''}`} />
                </motion.button>
                {/* Not Interested — discovery rejection (Task 9b / IN-007).
                    Secondary to thumbs up/down; writes a not_interested row
                    and removes the title from recs on next refresh. */}
                <motion.button
                  onClick={handleNotInterested}
                  whileTap={{ scale: 0.8 }}
                  aria-label="Not interested"
                  title="Not interested"
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 bg-secondary text-muted-foreground hover:text-foreground"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </div>
        </div>

        {/* Dual action buttons */}
        <div className="flex gap-2.5 mb-4">
          {/* Left button */}
          {isWatched ? (
            <motion.button
              onClick={() => {
                setLastAction('added_to_watchlist');
                onMoveToWantToWatch?.(itemId);
              }}
              whileTap={{ scale: 0.96 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary/50 border text-muted-foreground transition-colors"
              style={{ borderColor: "var(--check-border-2)" }}
            >
              <Undo2 className="w-4 h-4" />
              <span className="text-[14px]" style={{ fontWeight: 500 }}>Watchlist</span>
            </motion.button>
          ) : bookmarked ? (
            <motion.button
              onClick={() => {
                setLastAction('added_to_watchlist');
                onToggleBookmark?.();
              }}
              whileTap={{ scale: 0.96 }}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white"
            >
              <motion.span
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 15, stiffness: 300 }}
              >
                <Check className="w-4 h-4" />
              </motion.span>
              <span className="text-[14px]" style={{ fontWeight: 600 }}>In Watchlist</span>
            </motion.button>
          ) : (
            <motion.button
              onClick={() => {
                setLastAction('added_to_watchlist');
                onToggleBookmark?.();
              }}
              whileTap={{ scale: 0.96 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary/50 border text-foreground transition-colors"
              style={{ borderColor: "var(--check-border-2)" }}
            >
              <Plus className="w-4 h-4" />
              <span className="text-[14px]" style={{ fontWeight: 500 }}>Add to Watchlist</span>
            </motion.button>
          )}

          {/* Right button */}
          {isWatched ? (
            <motion.button
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white cursor-default"
            >
              <motion.span
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 15, stiffness: 300 }}
              >
                <CheckCircle2 className="w-4 h-4" />
              </motion.span>
              <span className="text-[14px]" style={{ fontWeight: 600 }}>Watched</span>
            </motion.button>
          ) : bookmarked ? (
            <motion.button
              onClick={() => {
                setLastAction('marked_watched');
                onMoveToWatched?.(itemId);
              }}
              whileTap={{ scale: 0.96 }}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white"
            >
              <Eye className="w-4 h-4" />
              <span className="text-[14px]" style={{ fontWeight: 600 }}>Mark as Watched</span>
            </motion.button>
          ) : (
            <motion.button
              onClick={() => {
                setLastAction('marked_watched');
                onMoveToWatched?.(itemId);
              }}
              whileTap={{ scale: 0.96 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary/50 border text-foreground transition-colors"
              style={{ borderColor: "var(--check-border-2)" }}
            >
              <Eye className="w-4 h-4" />
              <span className="text-[14px]" style={{ fontWeight: 500 }}>Mark as Watched</span>
            </motion.button>
          )}
        </div>

        {/* Rating prompt — watched but not yet rated */}
        {isWatched && !userRating ? <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-3 p-3 rounded-xl border mb-4"
            style={{ borderColor: "color-mix(in srgb, var(--success) 25%, transparent)", background: "color-mix(in srgb, var(--success) 12%, transparent)" }}
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
              <ThumbsUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
                Rate this title
              </p>
              <p className="text-muted-foreground text-[11px] flex items-center gap-1 flex-wrap">
                Use <ThumbsUp className="w-3 h-3 inline text-muted-foreground" /> or <ThumbsDown className="w-3 h-3 inline text-muted-foreground" /> above to improve recommendations
              </p>
            </div>
          </motion.div> : null}

        {/* Genre tags */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {detail.genres.map((genre) => (
            <span key={genre} className="px-3 py-1 rounded-full bg-secondary text-muted-foreground text-[12px]">
              {genre}
            </span>
          ))}
        </div>

        {/* Description */}
        <p
          ref={descRef}
          className="text-foreground/80 text-[14px] leading-relaxed"
          style={!descExpanded ? {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
            WebkitLineClamp: 3,
            overflow: 'hidden',
          } : undefined}
        >
          {detail.description}
        </p>
        {(descOverflows || descExpanded) ? <button
            onClick={() => setDescExpanded(!descExpanded)}
            className="text-primary text-[13px] mt-1 mb-6"
            style={{ fontWeight: 500 }}
          >
            {descExpanded ? 'Show less' : 'Show more'}
          </button> : null}
        {!descOverflows && !descExpanded && <div className="mb-6" />}

        {/* Where to Watch — 3-tier layout with deep linking */}
        <WhereToWatch detail={detail} userServices={userServices} />

        {/* Report availability */}
        {detail.allServices.length > 0 && (
          <button
            onClick={() => !hasReported && setReportSheetOpen(true)}
            className="flex items-center gap-1.5 mb-6 -mt-3"
            style={{ cursor: hasReported ? "default" : "pointer" }}
          >
            {hasReported ? (
              <>
                <Check className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-muted-foreground/60 text-[12px]">
                  Report submitted — thanks for helping us improve!
                </span>
              </>
            ) : (
              <>
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-muted-foreground/60 text-[12px]">
                  Services wrong? Report here to help us update
                </span>
              </>
            )}
          </button>
        )}

        <ReportSheet
          isOpen={reportSheetOpen}
          onClose={() => setReportSheetOpen(false)}
          tmdbId={parseContentItemId(detail.id).tmdbId}
          mediaType={detail.mediaType}
          services={detail.allServices}
          onReported={() => {
            setHasReported(true);
            setReportSheetOpen(false);
          }}
        />

        {/* Cast */}
        {detail.cast.length > 0 && (
          <div className="mb-6">
            <SectionHead kicker="ON SCREEN" title="Cast." />
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-2">
              {detail.cast.map((member, i) => (
                <div key={i} className="flex flex-col items-center shrink-0 w-[76px]">
                  <div className="w-[68px] h-[68px] rounded-2xl overflow-hidden mb-2 bg-secondary">
                    {member.image ? (
                      <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[20px]">
                        {member.name[0]}
                      </div>
                    )}
                  </div>
                  <span className="text-foreground text-[11px] text-center leading-tight" style={{ fontWeight: 600 }}>
                    {member.name}
                  </span>
                  <span className="text-muted-foreground text-[10px] text-center leading-tight mt-0.5">
                    {member.character}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* More Like This */}
        {similar.length > 0 && (
          <div className="mt-2">
            <SectionHead
              kicker="THE NEXT THREAD"
              title="More like this."
              right={
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--fg-faint)" }}>
                  {similar.length} titles
                </span>
              }
            />
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-2">
              {similar.map((rec) => (
                <ContentCard
                  key={rec.id}
                  item={rec}
                  variant="default"
                  onSelect={onItemSelect}
                  bookmarked={bookmarkedIds?.has(rec.id)}
                  onToggleBookmark={onToggleBookmarkItem}
                  userServices={userServices}
                  watched={watchedIds?.has(rec.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Where to Watch — 3-tier availability ──────────────

function WhereToWatch({ detail, userServices }: { detail: DetailData; userServices?: ServiceId[] }) {
  const { tier1, tier2, tier3 } = classifyProviders(
    detail.allServices,
    detail.rentalOptions,
    userServices || []
  );

  const hasAny = tier1.length > 0 || tier2.length > 0 || tier3.length > 0;
  if (!hasAny && detail.allServices.length === 0 && detail.rentalOptions.length === 0) {
    return (
      <div className="mb-6">
        <SectionHead kicker="WHERE TO WATCH" title="Not on your stack." />
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--t-body)",
            fontWeight: 400,
            color: "var(--fg-soft)",
            lineHeight: 1.45,
            margin: 0,
          }}
        >
          Not currently available to stream in the UK — check back later, availability changes frequently.
        </p>
      </div>
    );
  }

  if (!hasAny) return null;

  const handleServiceTap = async (service: ServiceId) => {
    const link = detail.serviceLinks[service];
    const deepLink = getDeepLink(service, link?.url || null, detail.title, detail.year);
    const { tmdbId } = parseContentItemId(detail.id);
    const dwellSecondsBeforeClick = getCurrentDwellSeconds();
    try {
      await openDeepLink(deepLink.url, {
        contentId: tmdbId,
        mediaType: detail.mediaType,
        serviceId: service,
        dwellSecondsBeforeClick,
        linkType: deepLink.type,
      });
    } finally {
      // Idempotent — dwell timer's 10-second safety net also catches
      // a thrown-and-swallowed path, but calling here is the fast path.
      exitDwell('deep_link_click');
    }
  };

  return (
    <div className="mb-6">
      <SectionHead kicker="WHERE TO WATCH" title="On your stack." />

      {/* Vertical stack — each tier is a column of full-width rows.
          Tier 1 carries the primary tint; tier 2 sits in the muted
          surface-tint; tier 3 (rent/buy) keeps the existing
          price-list component. */}

      {tier1.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {tier1.map((service) => (
            <button
              key={service}
              type="button"
              onClick={() => handleServiceTap(service)}
              className="w-full flex items-center gap-3 px-4 py-3 active:scale-[0.99] transition-transform"
              style={{
                background: "var(--primary-soft)",
                border: "1px solid var(--primary-edge)",
                borderRadius: "var(--r-card)",
                color: "var(--fg)",
                fontFamily: "var(--font-ui)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <ServiceBadge service={service} size="md" />
              <span className="flex-1 text-left">Watch on {serviceLabels[service]}</span>
              <ExternalLink className="w-4 h-4" style={{ color: "var(--primary)" }} />
            </button>
          ))}
        </div>
      )}

      {tier2.length > 0 && (
        <div className="mb-3">
          <p
            className="mb-2"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1.6px",
              color: "var(--fg-faint)",
            }}
          >
            {tier1.length > 0 ? "Also available on" : "Available on"}
          </p>
          <div className="flex flex-col gap-2">
            {tier2.map((service) => (
              <button
                key={service}
                type="button"
                onClick={() => handleServiceTap(service)}
                className="w-full flex items-center gap-3 px-4 py-3 active:scale-[0.99] transition-transform"
                style={{
                  background: "var(--surface-elev)",
                  border: "0.5px solid var(--hairline)",
                  borderRadius: "var(--r-card)",
                  color: "var(--fg-soft)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  fontWeight: 500,
                  minHeight: 52,
                }}
              >
                <ServiceBadge service={service} size="md" />
                <span className="flex-1 text-left">{serviceLabels[service]}</span>
                <ExternalLink className="w-4 h-4" style={{ color: "var(--fg-faint)" }} />
              </button>
            ))}
          </div>
          <p
            className="mt-2"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--fg-faint)",
            }}
          >
            Not connected to your account.
          </p>
        </div>
      )}

      {tier3.length > 0 && (
        <RentBuyList
          options={tier3}
          title={detail.title}
          year={detail.year}
          serviceLinks={detail.serviceLinks}
          contentId={parseContentItemId(detail.id).tmdbId}
          mediaType={detail.mediaType}
        />
      )}
    </div>
  );
}

// ── Rent/Buy list with "Show more" toggle ──────────────

function RentBuyList({ options, title, year, serviceLinks, contentId, mediaType }: {
  options: RentalOption[];
  title?: string;
  year?: number;
  serviceLinks?: Record<string, ServiceLink>;
  contentId: number;
  mediaType: 'movie' | 'tv';
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? options : options.slice(0, 3);

  const handleRentBuyTap = async (option: RentalOption) => {
    const saLink = option.deepLinkUrl || serviceLinks?.[option.serviceKey]?.url || null;
    const deepLink = getDeepLink(option.serviceKey, saLink, title || '', year);
    const dwellSecondsBeforeClick = getCurrentDwellSeconds();
    try {
      await openDeepLink(deepLink.url, {
        contentId,
        mediaType,
        serviceId: option.serviceKey,
        dwellSecondsBeforeClick,
        linkType: deepLink.type,
      });
    } finally {
      exitDwell('deep_link_click');
    }
  };

  return (
    <div>
      <p className="text-muted-foreground text-[11px] tracking-wide mb-2" style={{ fontWeight: 600 }}>
        Rent or Buy
      </p>
      <div className="flex flex-col gap-2">
        {visible.map((option, i) => (
          <button
            key={`${option.serviceKey}-${option.type}-${i}`}
            onClick={() => handleRentBuyTap(option)}
            className="flex items-center justify-between bg-secondary rounded-xl px-3.5 py-3 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-2.5">
              <ServiceBadge service={option.serviceKey} size="sm" />
              <span className="text-foreground text-[14px]" style={{ fontWeight: 500 }}>
                {serviceLabels[option.serviceKey] || option.service}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px]" style={{ fontWeight: 500, color: '#e85d25' }}>
                {option.price.startsWith('£')
                  ? `${option.type === 'rent' ? 'Rent from' : 'Buy from'} ${option.price}`
                  : option.price
                }
              </span>
              <ExternalLink className="w-3 h-3 opacity-40" />
            </div>
          </button>
        ))}
      </div>
      {options.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 text-[12px] mt-1.5"
          style={{ fontWeight: 600, color: '#e85d25' }}
        >
          {showAll ? (
            <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>Show {options.length - 3} more <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}
    </div>
  );
}

