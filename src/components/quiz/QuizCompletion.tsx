import { motion } from "motion/react";
import { Check } from "lucide-react";

interface QuizCompletionProps {
  topGenres: string[];
  onComplete: () => void;
}

export function QuizCompletion({ topGenres, onComplete }: QuizCompletionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.0, 0.0, 0.2, 1] }}
      className="flex flex-col items-center h-full px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3rem)" }}
    >
      {/* Checkmark icon */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 15,
          delay: 0.2,
        }}
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 shadow-lg shadow-primary/30"
        style={{ background: "linear-gradient(to bottom right, #4ade80, var(--primary))" }}
      >
        <Check className="w-10 h-10 text-white" strokeWidth={3} />
      </motion.div>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-foreground text-[26px] text-center mb-4"
        style={{ fontWeight: 700 }}
      >
        Your taste profile is ready!
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-muted-foreground text-[14px] text-center max-w-[280px] mb-5"
      >
        We'll use this to personalise your recommendations
      </motion.p>

      {/* Top genre badges */}
      {topGenres.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-2"
          style={{ marginBottom: 48 }}
        >
          <span className="text-muted-foreground text-[13px] mr-1">You love:</span>
          {topGenres.map((genre, i) => (
            <motion.span
              key={genre}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: 0.4 + i * 0.1,
                ease: [0.0, 0.0, 0.2, 1],
              }}
              className="px-3 py-1 rounded-full bg-primary/15 text-primary text-[12px]"
              style={{ fontWeight: 600 }}
            >
              {genre}
            </motion.span>
          ))}
        </motion.div>
      )}

      {/* Start exploring button */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        whileHover={{ scale: 1.02, backgroundColor: "#d14d1a" }}
        whileTap={{ scale: 0.98 }}
        onClick={onComplete}
        className="w-full max-w-[320px] py-3.5 rounded-2xl bg-primary text-white text-[15px] shadow-lg shadow-primary/25"
        style={{ fontWeight: 600 }}
      >
        Start exploring
      </motion.button>
    </motion.div>
  );
}
