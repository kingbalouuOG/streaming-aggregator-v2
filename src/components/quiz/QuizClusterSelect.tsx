import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { TASTE_CLUSTERS, MIN_CLUSTERS, MAX_CLUSTERS } from "@/lib/taste/tasteClusters";

interface QuizClusterSelectProps {
  initialClusters: string[];
  onConfirm: (clusterIds: string[]) => void;
  onBack: () => void;
}

export function QuizClusterSelect({ initialClusters, onConfirm, onBack }: QuizClusterSelectProps) {
  const [selected, setSelected] = useState<string[]>(initialClusters);
  const atLimit = selected.length >= MAX_CLUSTERS;
  const canConfirm = selected.length >= MIN_CLUSTERS;

  const toggle = (clusterId: string) => {
    setSelected((prev) => {
      if (prev.includes(clusterId)) return prev.filter((c) => c !== clusterId);
      if (prev.length >= MAX_CLUSTERS) return prev;
      return [...prev, clusterId];
    });
  };

  const clear = () => setSelected([]);

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: [0.0, 0.0, 0.2, 1] }}
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-6">
        {/* Section header */}
        <div className="pt-2 pb-5">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-2"
          >
            <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-foreground text-[20px]" style={{ fontWeight: 700 }}>
                  Update Your Taste
                </h2>
                <AnimatePresence>
                  {selected.length > 0 && (
                    <motion.span
                      key={selected.length}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      className="bg-primary text-white text-[12px] px-2 py-0.5 rounded-full tabular-nums"
                      style={{ fontWeight: 600 }}
                    >
                      {selected.length}/{MAX_CLUSTERS}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-muted-foreground text-[13px]">
                Pick 3–5 that match your vibe
              </p>
            </div>
          </motion.div>
        </div>

        {/* Cluster grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {TASTE_CLUSTERS.map((cluster, idx) => {
            const isSelected = selected.includes(cluster.id);
            const isDisabled = atLimit && !isSelected;
            return (
              <motion.button
                key={cluster.id}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{
                  opacity: isDisabled ? 0.4 : 1,
                  scale: isDisabled ? 0.98 : 1,
                }}
                transition={{ delay: 0.03 * idx, type: "spring", damping: 20, stiffness: 300 }}
                whileTap={!isDisabled ? { scale: 0.94 } : undefined}
                onClick={() => !isDisabled && toggle(cluster.id)}
                className={`relative flex items-center gap-3 pl-3 pr-8 py-3 rounded-2xl border text-left transition-all duration-250 ${
                  isSelected
                    ? "border-primary/50 bg-primary/10"
                    : isDisabled
                      ? "bg-secondary/20 cursor-not-allowed"
                      : "bg-secondary/40 hover:bg-secondary/60"
                }`}
                style={{ borderColor: isSelected ? undefined : "var(--border-subtle)" }}
              >
                <span className={`text-[22px] shrink-0 transition-transform duration-200 ${isSelected ? "scale-115" : ""}`}>
                  {cluster.emoji}
                </span>
                <div className="flex flex-col items-start min-w-0 flex-1 pr-4">
                  <span
                    className={`text-[13px] leading-tight transition-colors duration-200 ${
                      isSelected ? "text-foreground" : "text-muted-foreground"
                    }`}
                    style={{ fontWeight: isSelected ? 600 : 500 }}
                  >
                    {cluster.name}
                  </span>
                </div>

                {/* Check mark */}
                <div
                  className={`absolute top-2 right-2 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                    isSelected
                      ? "border-primary bg-primary"
                      : "bg-transparent"
                  }`}
                  style={{ borderColor: isSelected ? undefined : "var(--check-border-2)" }}
                >
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: "spring", damping: 15, stiffness: 400 }}
                      >
                        <Check className="w-2.5 h-2.5 text-white" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Max selection message */}
        <AnimatePresence>
          {atLimit && (
            <motion.p
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3, ease: [0.0, 0.0, 0.2, 1] }}
              className="text-primary text-[12px] text-center mt-3"
            >
              Maximum {MAX_CLUSTERS} selected — deselect one to choose another
            </motion.p>
          )}
        </AnimatePresence>

        {/* Clear selections */}
        <AnimatePresence>
          {selected.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 text-center"
            >
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={clear}
                className="text-muted-foreground text-[13px] hover:text-foreground transition-colors"
              >
                Clear selections
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        {canConfirm && (
          <p className="text-muted-foreground text-[12px] text-center mb-2">
            {selected.length} of {MAX_CLUSTERS} selected
          </p>
        )}
        {!canConfirm && (
          <p className="text-muted-foreground text-[12px] text-center mb-2">
            Pick at least {MIN_CLUSTERS} that match your vibe
          </p>
        )}
        <motion.button
          onClick={() => onConfirm(selected)}
          disabled={!canConfirm}
          whileTap={canConfirm ? { scale: 0.97 } : undefined}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[15px] transition-all duration-300 ${
            canConfirm
              ? "bg-primary text-white shadow-lg shadow-primary/25"
              : "bg-secondary text-muted-foreground cursor-not-allowed"
          }`}
          style={{ fontWeight: 600 }}
        >
          Continue to Quiz
          <ArrowRight className="w-4.5 h-4.5" />
        </motion.button>
      </div>
    </div>
  );
}
