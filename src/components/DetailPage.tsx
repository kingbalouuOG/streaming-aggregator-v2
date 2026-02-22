import React, { useState, useEffect } from "react";
import { ArrowLeft, Bookmark, Star, Loader2, ThumbsUp, ThumbsDown, Plus, Eye, Check, CheckCircle2, Undo2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { TickIcon } from "./icons";
import { motion } from "motion/react";
import { ServiceBadge } from "./ServiceBadge";
import { ContentItem } from "./ContentCard";
import { ImageSkeleton } from "./ImageSkeleton";
import type { ServiceId } from "./platformLogos";
import { serviceLabels as platformServiceLabels } from "./platformLogos";
import { useContentDetail } from "@/hooks/useContentDetail";
import type { DetailData, RentalOption } from "@/lib/adapters/detailAdapter";
import { classifyProviders } from "@/lib/utils/providerClassifier";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import rottenTomatoesLogo from "@/assets/rotten-tomatoes-logo.png";

export type { DetailData };

const serviceLabels = platformServiceLabels;

const languageCountryCodes: Record<string, string> = {
  English: "gb",
  Japanese: "jp",
  Korean: "kr",
  Spanish: "es",
  French: "fr",
  German: "de",
  Hindi: "in",
  Italian: "it",
  Turkish: "tr",
  Danish: "dk",
  Norwegian: "no",
  Swedish: "se",
  Chinese: "cn",
  Portuguese: "pt",
  Thai: "th",
  Polish: "pl",
  Dutch: "nl",
  Russian: "ru",
  Arabic: "sa",
};

interface DetailPageProps {
  itemId: string;
  itemTitle?: string;
  itemImage?: string;
  onBack: () => void;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  onItemSelect?: (item: ContentItem) => void;
  bookmarkedIds?: Set<string>;
  onToggleBookmarkItem?: (item: ContentItem) => void;
  connectedServices?: number[];
  userServices?: ServiceId[];
  watchedIds?: Set<string>;
  onMoveToWatched?: (id: string) => void;
  onMoveToWantToWatch?: (id: string) => void;
  userRating?: 'up' | 'down' | null;
  onRate?: (id: string, rating: 'up' | 'down' | null) => void;
}

export function DetailPage({ itemId, itemTitle, itemImage, onBack, bookmarked = false, onToggleBookmark, onItemSelect, bookmarkedIds, onToggleBookmarkItem, connectedServices, userServices, watchedIds, onMoveToWatched, onMoveToWantToWatch, userRating, onRate }: DetailPageProps) {
  const { detail, similar, loading, error } = useContentDetail(itemId, connectedServices);
  const isWatched = watchedIds?.has(itemId) ?? false;

  // Loading state
  if (loading || !detail) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="relative w-full aspect-[4/3] shrink-0 bg-secondary animate-pulse">
          {itemImage && (
            <img src={itemImage} alt={itemTitle || ''} className="w-full h-full object-cover opacity-30" />
          )}
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
          <div className="h-7 w-48 bg-secondary rounded animate-pulse mb-2" />
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
      {/* Hero image */}
      <div className="relative w-full aspect-[4/3] shrink-0">
        <ImageSkeleton
          src={detail.heroImage}
          alt={detail.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

        <button
          onClick={onBack}
          className="absolute left-4 w-9 h-9 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/60 transition-colors"
          style={{ top: "max(1rem, env(safe-area-inset-top, 1rem))" }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Status badge (non-interactive) */}
        {(isWatched || bookmarked) && (
          <div
            className={`absolute right-4 w-8 h-8 rounded-lg flex items-center justify-center ${
              isWatched
                ? "bg-emerald-500/90 text-white"
                : "bg-primary/90 text-white"
            }`}
            style={{ top: "max(1rem, env(safe-area-inset-top, 1rem))" }}
          >
            {isWatched ? (
              <Check className="w-4 h-4" />
            ) : (
              <Bookmark className="w-4 h-4 fill-current" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-5 pb-8 -mt-4 relative z-10">
        <h1 className="text-foreground text-[24px] mb-1" style={{ fontWeight: 700, lineHeight: 1.2 }}>
          {detail.title}
        </h1>

        <p className="text-muted-foreground text-[13px] mb-3">
          {detail.year} <span className="mx-1.5">&middot;</span> {detail.contentRating}
          {detail.runtime && <><span className="mx-1.5">&middot;</span> {detail.runtime}</>}
          {detail.seasons && <><span className="mx-1.5">&middot;</span> {detail.seasons} Season{detail.seasons !== 1 ? 's' : ''}</>}
          {detail.language && (
            <>
              <span className="mx-1.5">&middot;</span>
              <span className="inline-flex items-center gap-1">
                {languageCountryCodes[detail.language] && (
                  <span className={`fi fi-${languageCountryCodes[detail.language]}`} style={{ width: '16px', height: '12px', borderRadius: '2px', display: 'inline-block', backgroundSize: 'cover' }} />
                )}
                {detail.language}
              </span>
            </>
          )}
        </p>

        {/* Rating badges + thumbs */}
        <div className="flex items-center justify-between gap-2.5 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2.5 py-1.5">
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              <span className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
                {detail.imdbRating.toFixed(1)}
              </span>
              <span className="text-muted-foreground text-[11px]">IMDb</span>
            </div>

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

          {/* Thumbs rating buttons — only when watched */}
          {watchedIds?.has(itemId) && onRate && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5">
                <motion.button
                  onClick={() => onRate(itemId, userRating === 'up' ? null : 'up')}
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
                  onClick={() => onRate(itemId, userRating === 'down' ? null : 'down')}
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
              </div>
            </div>
          )}
        </div>

        {/* Dual action buttons */}
        <div className="flex gap-2.5 mb-4">
          {/* Left button */}
          {isWatched ? (
            <motion.button
              onClick={() => onMoveToWantToWatch?.(itemId)}
              whileTap={{ scale: 0.96 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary/50 border text-muted-foreground transition-colors"
              style={{ borderColor: "var(--check-border-2)" }}
            >
              <Undo2 className="w-4 h-4" />
              <span className="text-[14px]" style={{ fontWeight: 500 }}>Watchlist</span>
            </motion.button>
          ) : bookmarked ? (
            <motion.button
              onClick={() => onToggleBookmark?.()}
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
              onClick={() => onToggleBookmark?.()}
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
              onClick={() => onMoveToWatched?.(itemId)}
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
              onClick={() => onMoveToWatched?.(itemId)}
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
        {isWatched && onRate && !userRating && (
          <motion.div
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
          </motion.div>
        )}

        {/* Genre tags */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {detail.genres.map((genre) => (
            <span key={genre} className="px-3 py-1 rounded-full bg-secondary text-muted-foreground text-[12px]">
              {genre}
            </span>
          ))}
        </div>

        {/* Description */}
        <p className="text-foreground/80 text-[14px] leading-relaxed mb-6">
          {detail.description}
        </p>

        {/* Where to Watch — 3-tier layout */}
        <WhereToWatch detail={detail} userServices={userServices} />

        {/* Cast */}
        {detail.cast.length > 0 && (
          <div className="mb-6">
            <h3 className="text-foreground text-[15px] mb-3" style={{ fontWeight: 600 }}>
              Cast
            </h3>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-foreground text-[15px]" style={{ fontWeight: 600 }}>
                More Like This
              </h3>
              <span className="text-muted-foreground text-[11px]">
                {similar.length} titles
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-2">
              {similar.map((rec, index) => (
                <SimilarCard
                  key={rec.id}
                  item={rec}
                  index={index}
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
        <h3 className="text-foreground text-[15px] mb-2.5" style={{ fontWeight: 600 }}>
          Where to Watch
        </h3>
        <p className="text-muted-foreground text-[13px]">
          Not currently available to stream in the UK.
        </p>
        <p className="text-muted-foreground/60 text-[12px] mt-1">
          Check back later — availability changes frequently.
        </p>
      </div>
    );
  }

  if (!hasAny) return null;

  return (
    <div className="mb-6">
      <h3 className="text-foreground text-[15px] mb-2.5" style={{ fontWeight: 600 }}>
        Where to Watch
      </h3>

      {/* Tier 1: On Your Services — orange glow */}
      {tier1.length > 0 && (
        <div className="mb-3">
          <p className="text-muted-foreground text-[11px] tracking-wide mb-2" style={{ fontWeight: 600 }}>
            On Your Services
          </p>
          <div className="flex flex-wrap gap-2">
            {tier1.map((service) => (
              <span
                key={service}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-secondary text-foreground text-[13px]"
                style={{
                  fontWeight: 600,
                  border: '1.5px solid #e85d25',
                  boxShadow: '0 0 0 2px rgba(232, 93, 37, 0.08), 0 0 12px rgba(232, 93, 37, 0.15)',
                }}
              >
                <ServiceBadge service={service} size="sm" />
                Watch on {serviceLabels[service]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tier 2: Also Available On / Available On — neutral chips */}
      {tier2.length > 0 && (
        <div className="mb-3">
          <p className="text-muted-foreground text-[11px] tracking-wide mb-2" style={{ fontWeight: 600 }}>
            {tier1.length > 0 ? 'Also Available On' : 'Available On'}
          </p>
          <div className="flex flex-wrap gap-2">
            {tier2.map((service) => (
              <span
                key={service}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-muted-foreground text-[13px]"
                style={{
                  fontWeight: 500,
                  border: '1px solid var(--border-subtle)',
                  minHeight: '44px',
                }}
              >
                <ServiceBadge service={service} size="sm" />
                {serviceLabels[service]}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground/60 text-[12px] mt-1.5">
            Not connected to your account
          </p>
        </div>
      )}

      {/* Tier 3: Rent or Buy — price list */}
      {tier3.length > 0 && (
        <RentBuyList options={tier3} />
      )}
    </div>
  );
}

// ── Rent/Buy list with "Show more" toggle ──────────────

function RentBuyList({ options }: { options: RentalOption[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? options : options.slice(0, 3);

  return (
    <div>
      <p className="text-muted-foreground text-[11px] tracking-wide mb-2" style={{ fontWeight: 600 }}>
        Rent or Buy
      </p>
      <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {visible.map((option, i) => (
          <div
            key={`${option.serviceKey}-${option.type}-${i}`}
            className="flex items-center justify-between py-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2.5">
              <ServiceBadge service={option.serviceKey} size="sm" />
              <span className="text-foreground text-[14px]" style={{ fontWeight: 500 }}>
                {option.service}
              </span>
            </div>
            <span className="text-[13px]" style={{ fontWeight: 500, color: '#e85d25' }}>
              {option.price === 'Rent' || option.price === 'Buy'
                ? `${option.type === 'rent' ? 'Rent' : 'Buy'}`
                : `${option.type === 'rent' ? 'Rent from' : 'Buy from'} ${option.price}`
              }
            </span>
          </div>
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

// ── Similar Card with service lazy-loading ──────────────
function SimilarCard({ item, index, onSelect, bookmarked, onToggleBookmark, userServices, watched }: {
  item: ContentItem;
  index: number;
  onSelect?: (item: ContentItem) => void;
  bookmarked?: boolean;
  onToggleBookmark?: (item: ContentItem) => void;
  userServices?: ServiceId[];
  watched?: boolean;
}) {
  const [allServices, setAllServices] = useState<ServiceId[]>(item.services);

  useEffect(() => {
    if (item.services.length > 0) {
      setAllServices(item.services);
      return;
    }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setAllServices);
  }, [item.id, item.services]);

  const services = userServices?.length
    ? allServices.filter((s) => userServices.includes(s))
    : allServices;

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: "spring", damping: 22, stiffness: 300 }}
      className="relative group shrink-0 w-[165px] h-[240px] rounded-xl overflow-hidden cursor-pointer"
      onClick={() => onSelect?.(item)}
    >
      <ImageSkeleton src={item.image} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />

      {item.matchPercentage != null && item.matchPercentage > 0 && (
        <div className="absolute top-2.5 left-2.5 bg-emerald-600 text-white text-[12px] px-3 py-1 rounded-full shadow-lg" style={{ fontWeight: 700 }}>
          {item.matchPercentage}% Match
        </div>
      )}

      {watched ? (
        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
          <TickIcon className="w-3.5 h-3.5 text-white" />
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleBookmark?.(item); }}
          className={`absolute top-2.5 right-2.5 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${
            bookmarked
              ? "bg-primary text-white"
              : "bg-black/40 backdrop-blur-sm text-white/70 hover:text-white"
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-current" : ""}`} />
        </button>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-center gap-1 mb-1">
          {services.slice(0, 3).map((s) => (
            <ServiceBadge key={s} service={s} size="sm" />
          ))}
        </div>
        {item.rating && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-yellow-400 text-[11px]">&#9733;</span>
            <span className="text-white/80 text-[11px]">{item.rating.toFixed(1)}</span>
          </div>
        )}
        <h4 className="text-white text-[13px] leading-tight mb-0.5" style={{ fontWeight: 600 }}>
          {item.title}
        </h4>
        {item.year && <span className="text-white/45 text-[11px]">{item.year}</span>}
      </div>
    </motion.div>
  );
}
