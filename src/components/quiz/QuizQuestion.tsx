import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft } from "lucide-react";
import type { QuizPair, QuizOption } from "@/lib/taste/quizConfig";

const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w342";

interface QuizQuestionProps {
  pair: QuizPair;
  questionNumber: number;
  totalQuestions: number;
  onChoose: (choice: 'A' | 'B' | 'neither' | 'skip') => void;
  onBack?: () => void;
  showBack: boolean;
  /** Poster URLs resolved by parent (keyed by tmdbId) */
  posterUrls?: Record<number, string>;
}

export function QuizQuestion({
  pair,
  questionNumber,
  totalQuestions,
  onChoose,
  onBack,
  showBack,
  posterUrls,
}: QuizQuestionProps) {
  const [selected, setSelected] = useState<'A' | 'B' | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const handleSelect = useCallback((choice: 'A' | 'B') => {
    if (transitioning) return;
    setSelected(choice);
    setTransitioning(true);
    // Hold selection animation for 300ms, then advance
    setTimeout(() => {
      onChoose(choice);
      setSelected(null);
      setTransitioning(false);
    }, 400);
  }, [onChoose, transitioning]);

  const handleSkipOrNeither = useCallback((choice: 'skip' | 'neither') => {
    if (transitioning) return;
    onChoose(choice);
  }, [onChoose, transitioning]);

  return (
    <div className="flex flex-col h-full">
      {/* Header: Back + Progress dots + Counter */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-3">
        {/* Back button */}
        <div className="w-8">
          <AnimatePresence>
            {showBack && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: [0.0, 0.0, 0.2, 1] }}
                onClick={onBack}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-1.5">
          {Array.from({ length: totalQuestions }).map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: questionNumber - 1 >= i ? "100%" : "0%" }}
                transition={{ duration: 0.5, ease: "easeInOut", delay: questionNumber - 1 >= i ? i * 0.05 : 0 }}
              />
            </div>
          ))}
        </div>

        {/* Counter */}
        <span className="text-muted-foreground text-[12px] tabular-nums w-8 text-right" style={{ fontWeight: 500 }}>
          {questionNumber}/{totalQuestions}
        </span>
      </div>

      {/* Poster pair area */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="flex gap-4 w-full max-w-[360px]">
          <PosterCard
            option={pair.optionA}
            side="A"
            selected={selected}
            onSelect={() => handleSelect('A')}
            posterUrl={posterUrls?.[pair.optionA.tmdbId]}
          />
          <PosterCard
            option={pair.optionB}
            side="B"
            selected={selected}
            onSelect={() => handleSelect('B')}
            posterUrl={posterUrls?.[pair.optionB.tmdbId]}
          />
        </div>
      </div>

      {/* Skip / Neither buttons */}
      <div className="flex items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleSkipOrNeither('skip')}
          disabled={transitioning}
          className="flex-1 py-3 rounded-xl bg-secondary/60 text-foreground text-[14px] transition-colors"
          style={{ fontWeight: 600 }}
        >
          Skip
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => handleSkipOrNeither('neither')}
          disabled={transitioning}
          className="flex-1 py-3 rounded-xl bg-secondary/60 text-foreground text-[14px] transition-colors"
          style={{ fontWeight: 600 }}
        >
          Neither
        </motion.button>
      </div>
    </div>
  );
}

// ── Poster Card sub-component ───────────────────────────────────

function PosterCard({
  option,
  side,
  selected,
  onSelect,
  posterUrl,
}: {
  option: QuizOption;
  side: 'A' | 'B';
  selected: 'A' | 'B' | null;
  onSelect: () => void;
  posterUrl?: string;
}) {
  const isSelected = selected === side;
  const isUnselected = selected !== null && !isSelected;
  const [imgError, setImgError] = useState(false);

  const src = posterUrl
    ? `${TMDB_POSTER_BASE}${posterUrl}`
    : undefined;

  return (
    <motion.button
      onClick={onSelect}
      whileHover={selected === null ? { scale: 1.02 } : undefined}
      whileTap={selected === null ? { scale: 0.98 } : undefined}
      animate={{
        scale: isSelected ? 1.05 : isUnselected ? 0.95 : 1,
        opacity: isUnselected ? 0.4 : 1,
      }}
      transition={{ duration: 0.2, ease: [0.4, 0.0, 0.2, 1] }}
      className="flex-1 flex flex-col items-center"
      style={{ transformOrigin: "center" }}
    >
      {/* Poster image */}
      <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-secondary mb-2.5 shadow-lg">
        {src && !imgError ? (
          <img
            src={src}
            alt={option.title}
            className="w-full h-full object-cover"
            loading="eager"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-secondary/60 p-3">
            <span className="text-foreground text-[16px] text-center leading-tight" style={{ fontWeight: 600 }}>
              {option.title}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <h3
        className="text-foreground text-[14px] text-center leading-tight mb-0.5"
        style={{ fontWeight: 600 }}
      >
        {option.title}
      </h3>

      {/* Year */}
      <p className="text-muted-foreground text-[12px] text-center mb-1">
        {option.year}
      </p>

      {/* Descriptor */}
      <p className="text-muted-foreground/70 text-[11px] text-center leading-snug">
        {option.descriptor}
      </p>
    </motion.button>
  );
}
