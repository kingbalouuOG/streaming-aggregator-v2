/**
 * TasteQuiz — Orchestrator Component
 *
 * State machine: intro → question(1-5) → interstitial → question(6-10) → completion
 *
 * On mount: selects fixed (3) + genre-responsive (2) pairs.
 * After Q5: computes interim vector, selects 5 adaptive pairs.
 * After Q10: computes final vector, shows completion screen.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TasteVector } from '@/lib/taste/tasteVector';
import { computeClusterSeedVector, getTopGenreKeysFromClusters } from '@/lib/taste/tasteClusters';
import type { QuizPair } from '@/lib/taste/quizConfig';
import { getFixedPairs, selectGenreResponsivePairs, selectAdaptivePairs } from '@/lib/taste/quizConfig';
import { computeQuizVector, getTopGenreNames } from '@/lib/taste/quizScoring';
import { getMostAmbiguousDimensions } from '@/lib/taste/quizScoring';
import type { QuizAnswer } from '@/lib/storage/tasteProfile';
import { QuizIntro } from './QuizIntro';
import { QuizQuestion } from './QuizQuestion';
import { QuizInterstitial } from './QuizInterstitial';
import { QuizCompletion } from './QuizCompletion';
import { QuizClusterSelect } from './QuizClusterSelect';
import { logOnboardingEvent } from '@/lib/analytics/logger';
import { ONBOARDING_EVENTS } from '@/lib/analytics/events';

// ── Types ────────────────────────────────────────────────────────

type QuizStage =
  | { type: 'cluster-select' }
  | { type: 'intro' }
  | { type: 'question'; index: number }       // 0-based (0..9)
  | { type: 'interstitial' }
  | { type: 'completion'; topGenres: string[] };

interface TasteQuizProps {
  onComplete: (answers: QuizAnswer[], vector: TasteVector) => void;
  onSkip: () => void;
  showSkip: boolean;
  userClusters: string[];
  showClusterSelect?: boolean;
  onClustersUpdated?: (clusters: string[]) => void;
}

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TOTAL_QUESTIONS = 10;

// ── Component ────────────────────────────────────────────────────

export function TasteQuiz({ onComplete, onSkip, showSkip, userClusters, showClusterSelect, onClustersUpdated }: TasteQuizProps) {
  const [stage, setStage] = useState<QuizStage>(showClusterSelect ? { type: 'cluster-select' } : { type: 'intro' });
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward

  // Local clusters: start from userClusters, can be updated by cluster-select stage
  const [localClusters, setLocalClusters] = useState<string[]>(userClusters);

  // Pairs: first 5 (fixed+genre-responsive) selected on mount, last 5 (adaptive) after Q5
  const [phase1Pairs, setPhase1Pairs] = useState<QuizPair[]>([]);
  const [phase2Pairs, setPhase2Pairs] = useState<QuizPair[]>([]);

  // Poster paths resolved from TMDb (keyed by tmdbId)
  const [posterUrls, setPosterUrls] = useState<Record<number, string>>({});

  const quizStartRef = useRef(0);

  // Base vector from cluster selections
  const baseVector = useMemo(() => computeClusterSeedVector(localClusters), [localClusters.join(',')]);

  // ── Initialize phase 1 pairs (fixed + genre-responsive) ──
  useEffect(() => {
    const fixed = getFixedPairs();
    const fixedIds = fixed.map((p) => p.id);
    const topGenreKeys = getTopGenreKeysFromClusters(localClusters, 3);
    const genreResponsive = selectGenreResponsivePairs(topGenreKeys, fixedIds);
    const pairs = [...fixed, ...genreResponsive];
    setPhase1Pairs(pairs);

    // Fetch posters for phase 1 pairs
    fetchPosters(pairs);
  }, [localClusters.join(',')]);

  // ── Fetch poster paths from TMDb ──
  const fetchPosters = useCallback(async (pairs: QuizPair[]) => {
    if (!TMDB_API_KEY) return;

    // Collect unique tmdbIds with media types
    const toFetch: { id: number; mediaType: 'movie' | 'tv' }[] = [];
    const seen = new Set<number>();
    for (const pair of pairs) {
      for (const option of [pair.optionA, pair.optionB]) {
        if (!seen.has(option.tmdbId) && !posterUrls[option.tmdbId]) {
          seen.add(option.tmdbId);
          toFetch.push({ id: option.tmdbId, mediaType: option.mediaType });
        }
      }
    }

    // Fetch in parallel (fire-and-forget per item)
    const results: Record<number, string> = {};
    await Promise.allSettled(
      toFetch.map(async ({ id, mediaType }) => {
        try {
          const res = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&language=en-GB`
          );
          if (!res.ok) return;
          const data = await res.json();
          if (data.poster_path) {
            results[id] = data.poster_path;
          }
        } catch {
          // Silently fail — poster will show text fallback
        }
      })
    );

    if (Object.keys(results).length > 0) {
      setPosterUrls((prev) => ({ ...prev, ...results }));
    }
  }, [posterUrls]);

  // ── All pairs in order ──
  const allPairs = useMemo(() => [...phase1Pairs, ...phase2Pairs], [phase1Pairs, phase2Pairs]);

  // ── Get current pair ──
  const currentPair = stage.type === 'question' ? allPairs[stage.index] : null;

  // ── Handle answer choice ──
  const handleChoose = useCallback((choice: QuizAnswer['chosenOption']) => {
    if (stage.type !== 'question') return;
    const qIndex = stage.index;
    const pair = allPairs[qIndex];
    if (!pair) return;

    const answer: QuizAnswer = {
      pairId: pair.id,
      chosenOption: choice,
      phase: pair.phase,
      timestamp: new Date().toISOString(),
    };

    const newAnswers = [...answers.slice(0, qIndex), answer];
    setAnswers(newAnswers);
    setDirection(1);

    // After Q5 (index 4): show interstitial, then select adaptive pairs
    if (qIndex === 4) {
      // Compute interim vector from first 5 answers
      const interimVector = computeQuizVector(baseVector, newAnswers, phase1Pairs);
      const usedPairIds = new Set(phase1Pairs.map((p) => p.id));
      const adaptive = selectAdaptivePairs(interimVector, usedPairIds);
      setPhase2Pairs(adaptive);

      // Fetch posters for adaptive pairs
      fetchPosters(adaptive);

      setStage({ type: 'interstitial' });
      return;
    }

    // After Q10 (index 9): show completion
    if (qIndex === 9) {
      void logOnboardingEvent(ONBOARDING_EVENTS.QUIZ_COMPLETED, {
        duration_seconds: Math.round((Date.now() - quizStartRef.current) / 1000),
      });
      const finalVector = computeQuizVector(baseVector, newAnswers, allPairs);
      const topGenres = getTopGenreNames(finalVector, 3);
      setStage({ type: 'completion', topGenres });
      return;
    }

    // Otherwise: next question
    setStage({ type: 'question', index: qIndex + 1 });
  }, [stage, allPairs, answers, baseVector, phase1Pairs, fetchPosters]);

  // ── Handle back navigation ──
  const handleBack = useCallback(() => {
    if (stage.type !== 'question' || stage.index === 0) return;
    setDirection(-1);
    setStage({ type: 'question', index: stage.index - 1 });
  }, [stage]);

  // ── Handle interstitial complete ──
  const handleInterstitialComplete = useCallback(() => {
    setDirection(1);
    setStage({ type: 'question', index: 5 });
  }, []);

  // ── Handle completion ──
  const handleComplete = useCallback(() => {
    const finalVector = computeQuizVector(baseVector, answers, allPairs);
    onComplete(answers, finalVector);
  }, [baseVector, answers, allPairs, onComplete]);

  // ── Render ──
  return (
    <div className="size-full bg-background">
      <AnimatePresence mode="wait" custom={direction}>
        {stage.type === 'cluster-select' && (
          <motion.div
            key="cluster-select"
            className="size-full"
          >
            <QuizClusterSelect
              initialClusters={localClusters}
              onConfirm={(clusters) => {
                setLocalClusters(clusters);
                onClustersUpdated?.(clusters);
                setDirection(1);
                setStage({ type: 'intro' });
              }}
              onBack={onSkip}
            />
          </motion.div>
        )}

        {stage.type === 'intro' && (
          <motion.div
            key="intro"
            className="size-full"
          >
            <QuizIntro
              onStart={() => {
                quizStartRef.current = Date.now();
                void logOnboardingEvent(ONBOARDING_EVENTS.QUIZ_STARTED, {});
                setDirection(1);
                setStage({ type: 'question', index: 0 });
              }}
              onSkip={onSkip}
              showSkip={showSkip}
            />
          </motion.div>
        )}

        {stage.type === 'question' && currentPair && (
          <motion.div
            key={`question-${stage.index}`}
            custom={direction}
            initial={{ x: direction > 0 ? 200 : -200, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction < 0 ? 200 : -200, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
            className="size-full"
          >
            <QuizQuestion
              pair={currentPair}
              questionNumber={stage.index + 1}
              totalQuestions={TOTAL_QUESTIONS}
              onChoose={handleChoose}
              onBack={handleBack}
              showBack={stage.index > 0}
              posterUrls={posterUrls}
            />
          </motion.div>
        )}

        {stage.type === 'interstitial' && (
          <motion.div
            key="interstitial"
            className="size-full"
          >
            <QuizInterstitial onComplete={handleInterstitialComplete} />
          </motion.div>
        )}

        {stage.type === 'completion' && (
          <motion.div
            key="completion"
            className="size-full"
          >
            <QuizCompletion
              topGenres={stage.topGenres}
              onComplete={handleComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
