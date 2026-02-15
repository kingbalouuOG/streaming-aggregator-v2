import { useEffect } from "react";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

interface QuizInterstitialProps {
  onComplete: () => void;
}

export function QuizInterstitial({ onComplete }: QuizInterstitialProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2300); // 0.4s fade in + 1.5s hold + 0.4s fade out
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
      className="flex flex-col items-center justify-center h-full px-6"
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.15 }}
        className="w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center mb-6"
      >
        <Sparkles className="w-10 h-10 text-primary" />
      </motion.div>

      {/* Message */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-foreground text-[18px] text-center"
        style={{ fontWeight: 600 }}
      >
        Great start — let's dig a bit deeper
      </motion.p>
    </motion.div>
  );
}
