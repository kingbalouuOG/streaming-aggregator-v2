/**
 * SliderTray — bottom-sheet slider tray for the For You surface.
 *
 * Reuses the FilterSheet bottom-sheet pattern (motion.div, backdrop, spring animation).
 * Contains the same 4 sliders as ProfilePage > Tune Recommendations.
 * Reads/writes via getSliderState() / saveSliderState() (shared state with Profile).
 * On slider release: debounced save (500ms) + immediate rerank() callback.
 * Haptic feedback: @capacitor/haptics ImpactStyle.Light on threshold crossing.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { getSliderState, saveSliderState } from '@/lib/taste-v2/tasteProfileV2';
import { DEFAULT_SLIDERS, type SliderState } from '@/lib/taste-v2/types';
import { invalidateV2ProfileCache } from '@/lib/taste-v2/tasteProfileV2';

const SLIDER_CONFIG = [
  { key: 'catalogueAge' as const, left: 'New releases', right: 'Best match regardless of age' },
  { key: 'comfortZone' as const, left: 'Stick with what I like', right: 'Surprise me' },
  { key: 'contentMix' as const, left: 'Focus on films', right: 'Focus on TV series' },
  { key: 'variety' as const, left: 'Finish what I start', right: 'Try lots of things' },
];

interface SliderTrayProps {
  isOpen: boolean;
  onClose: () => void;
  onSlidersChange: (sliders: SliderState) => void;
  initialSliders?: SliderState | null;
}

export function SliderTray({ isOpen, onClose, onSlidersChange, initialSliders }: SliderTrayProps) {
  const [sliders, setSliders] = useState<SliderState>(initialSliders ?? { ...DEFAULT_SLIDERS });
  const [loaded, setLoaded] = useState(!!initialSliders);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rerankTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLabelsRef = useRef<Record<string, string>>({});

  // Load slider state from DB on mount (if not provided via props)
  useEffect(() => {
    if (initialSliders) {
      setSliders(initialSliders);
      setLoaded(true);
      return;
    }
    getSliderState().then(s => {
      setSliders(s);
      setLoaded(true);
    });
  }, [initialSliders]);

  // Haptic feedback on threshold crossing
  const fireHapticIfThresholdCrossed = useCallback((key: string, value: number) => {
    const newLabel = getSliderLabel(key as keyof SliderState, value);
    const prevLabel = prevLabelsRef.current[key];
    if (prevLabel && prevLabel !== newLabel) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
    prevLabelsRef.current[key] = newLabel;
  }, []);

  const updateSlider = useCallback((key: keyof SliderState, value: number) => {
    fireHapticIfThresholdCrossed(key, value);

    setSliders(prev => {
      const updated = { ...prev, [key]: value };

      // Debounced re-rank (150ms) — keeps slider drag smooth
      if (rerankTimeoutRef.current) clearTimeout(rerankTimeoutRef.current);
      rerankTimeoutRef.current = setTimeout(() => {
        onSlidersChange(updated);
      }, 300);

      // Debounced save to Supabase (500ms)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveSliderState(updated).then(() => {
          invalidateV2ProfileCache();
        }).catch(err =>
          console.error('[SliderTray] save failed:', err)
        );
      }, 500);

      return updated;
    });
  }, [onSlidersChange, fireHapticIfThresholdCrossed]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (rerankTimeoutRef.current) clearTimeout(rerankTimeoutRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: "var(--backdrop)" }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full max-w-md max-h-[90vh] flex flex-col"
            style={{
              background: "var(--surface-elev)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              boxShadow: "var(--shadow-sheet)",
            }}
          >
            {/* Grabber pill — design-system §4 sheet anatomy */}
            <div className="flex justify-center pt-2 pb-1">
              <span
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: "var(--r-pill)",
                  background: "var(--hairline)",
                }}
              />
            </div>

            {/* Header — kicker + Fraunces title */}
            <div className="flex items-start justify-between px-5 pt-2 pb-4">
              <div>
                <span className="t-kicker">TUNE</span>
                <h2
                  className="mt-1"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "var(--t-title)",
                    fontWeight: 700,
                    fontVariationSettings: '"opsz" 36',
                    letterSpacing: "-0.01em",
                    color: "var(--fg)",
                    lineHeight: 1.15,
                    margin: 0,
                  }}
                >
                  Recommendations.
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 inline-flex items-center justify-center transition-colors"
                style={{ color: "var(--fg-soft)" }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Slider content — touch-action ensures slider drag isn't intercepted */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 no-scrollbar safe-bottom" style={{ touchAction: 'pan-y' }}>
              <p
                className="mb-5"
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--t-body)",
                  fontWeight: 400,
                  color: "var(--fg-soft)",
                  lineHeight: 1.45,
                }}
              >
                Changes take effect immediately.
              </p>

              {!loaded ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="h-16 animate-pulse"
                      style={{ borderRadius: "var(--r-card)", background: "var(--surface-tint)" }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {SLIDER_CONFIG.map(({ key, left, right }) => (
                    <div key={key}>
                      <div
                        className="flex justify-between"
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          fontWeight: 500,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: "var(--fg-faint)",
                          marginBottom: 8,
                        }}
                      >
                        <span>{left}</span>
                        <span className="text-right">{right}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(sliders[key] * 100)}
                        onChange={e => updateSlider(key, parseInt(e.target.value, 10) / 100)}
                        className="videx-slider"
                        style={{ ['--slider-fill' as any]: `${Math.round(sliders[key] * 100)}%` }}
                      />
                      <p
                        className="text-center"
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          color: "var(--primary)",
                          marginTop: 6,
                        }}
                      >
                        {getSliderLabel(key, sliders[key])}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Helpers ──

function softLower(s: string): string {
  if (s.length === 0) return s;
  return s[0].toLowerCase() + s.slice(1);
}

function getSliderLabel(key: keyof SliderState, value: number): string {
  const defaultVal = key === 'comfortZone' ? DEFAULT_SLIDERS.comfortZone : 0.5;
  const cfg = SLIDER_CONFIG.find(s => s.key === key);
  if (!cfg) return '';
  if (Math.abs(value - defaultVal) < 0.04) return 'Balanced';
  if (value < 0.25) return `Strongly prefer ${softLower(cfg.left)}`;
  if (value < 0.5) return `Slightly prefer ${softLower(cfg.left)}`;
  if (value < 0.75) return `Slightly prefer ${softLower(cfg.right)}`;
  return `Strongly prefer ${softLower(cfg.right)}`;
}
