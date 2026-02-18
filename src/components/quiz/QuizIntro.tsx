import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

interface QuizIntroProps {
  onStart: () => void;
  onSkip: () => void;
  showSkip: boolean;
}

export function QuizIntro({ onStart, onSkip, showSkip }: QuizIntroProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.0, 0.0, 0.2, 1] }}
      className="flex flex-col items-center h-full px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3rem)" }}
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
        className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center mb-5 shadow-lg shadow-primary/30"
      >
        <Sparkles className="w-10 h-10 text-white" />
      </motion.div>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-foreground text-[26px] text-center mb-4"
        style={{ fontWeight: 700 }}
      >
        Let's learn your taste
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-muted-foreground text-[14px] text-center max-w-[280px]"
        style={{ marginBottom: 56 }}
      >
        Pick your favourites and we'll personalise your recommendations
      </motion.p>

      {/* Start button */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onStart}
        className="w-full max-w-[320px] flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-primary text-white text-[15px] shadow-lg shadow-primary/25"
        style={{ fontWeight: 600 }}
      >
        <Sparkles className="w-4.5 h-4.5" />
        Let's go
      </motion.button>

      {/* Skip button */}
      {showSkip && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSkip}
          className="w-full max-w-[320px] mt-3 py-3 rounded-2xl bg-secondary text-foreground text-[15px] transition-colors"
          style={{ fontWeight: 600 }}
        >
          Skip for now
        </motion.button>
      )}
    </motion.div>
  );
}
