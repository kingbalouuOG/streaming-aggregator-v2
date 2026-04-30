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
            className="relative w-full max-w-md rounded-t-3xl max-h-[90vh] flex flex-col"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "var(--drag-handle)" }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 pt-1">
              <h2 className="text-foreground text-[20px]" style={{ fontWeight: 700 }}>
                Tune Your Recommendations
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Slider content — touch-action ensures slider drag isn't intercepted */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 no-scrollbar safe-bottom" style={{ touchAction: 'pan-y' }}>
              <p className="text-muted-foreground text-[13px] mb-5">
                Changes take effect immediately.
              </p>

              {!loaded ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {SLIDER_CONFIG.map(({ key, left, right }) => (
                    <div key={key}>
                      <div className="flex justify-between text-[12px] text-muted-foreground" style={{ marginBottom: '0.375rem' }}>
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
                      <p className="text-center text-[11px] text-primary" style={{ fontWeight: 500, marginTop: '0.25rem' }}>
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
