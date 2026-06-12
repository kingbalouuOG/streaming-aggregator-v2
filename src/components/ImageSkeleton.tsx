import React, { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useIntersectionObserver } from "../hooks/useIntersectionObserver";

interface ImageSkeletonProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /**
   * PLAT-1: above-the-fold images (hero carousel, first visible row)
   * skip the viewport gate and load immediately. Everything else waits
   * until it's within ~600px of the viewport — Home eager-loaded ~80
   * posters before this; now it loads the visible dozen.
   */
  priority?: boolean;
}

/**
 * TMDb rendition swap for the LQIP blur-up: any /t/p/<size>/ URL gets a
 * w92 twin (~2–4 kB) shown blurred while the full rendition loads.
 * Non-TMDb URLs (and already-tiny w92 requests) get no LQIP.
 */
function lqipFor(src: string): string | null {
  const m = src.match(/\/t\/p\/(w\d+|original)\//);
  if (!m || m[1] === "w92") return null;
  return src.replace(`/t/p/${m[1]}/`, "/t/p/w92/");
}

/**
 * Progressive image with shimmer skeleton, viewport-gated loading and a
 * single-element LQIP blur-up (PLAT-1).
 *
 * The blur-up is a SRC SWAP on one in-flow <img>, not an absolutely-
 * positioned layer: the first device pass caught the layered version
 * escaping containers whose ancestors weren't position:relative (a w92
 * poster blown up across the whole search-suggestions panel). One
 * element in normal flow cannot escape anything — the img starts as the
 * blurred w92, the full rendition preloads via Image(), and the src
 * swaps with the blur transitioning off.
 */
export function ImageSkeleton({ src, alt, className = "", style, priority = false }: ImageSkeletonProps) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [fullReady, setFullReady] = useState(false);
  const [displayLoaded, setDisplayLoaded] = useState(false);
  const [, setError] = useState(false);

  // Viewport gate. The observer attaches to the shimmer box — it exists
  // exactly while the image hasn't rendered, which is exactly when we
  // need observation. triggerOnce keeps the gate latched open.
  const { ref: inViewRef, isVisible } = useIntersectionObserver({
    rootMargin: "600px 0px",
    triggerOnce: true,
  });
  const shouldLoad = priority || isVisible;

  const lqipSrc = useMemo(() => (src ? lqipFor(src) : null), [src]);

  // If src is empty/falsy, skip shimmer and show placeholder immediately
  // (an <img src=""> never fires onLoad/onError — the documented gotcha).
  useEffect(() => {
    if (!src) {
      setError(true);
      setDisplayLoaded(true);
    }
  }, [src]);

  // Reset per src (recycled cards swap src on the same mounted element).
  useEffect(() => {
    setDisplaySrc(null);
    setFullReady(false);
    setDisplayLoaded(false);
    setError(false);
  }, [src]);

  // Once in (near-)view: show the LQIP immediately if one exists, and
  // preload the full rendition off-DOM; swap src when it's decoded.
  useEffect(() => {
    if (!shouldLoad || !src) return;

    let cancelled = false;
    setDisplaySrc((prev) => prev ?? lqipSrc ?? src);

    if (lqipSrc) {
      const full = new Image();
      full.onload = () => {
        if (cancelled) return;
        setFullReady(true);
        setDisplaySrc(src);
      };
      full.onerror = () => {
        if (cancelled) return;
        // Full rendition failed — keep the LQIP rather than going blank.
        setFullReady(true);
      };
      full.src = src;
    } else {
      setFullReady(true);
    }

    return () => { cancelled = true; };
  }, [shouldLoad, src, lqipSrc]);

  const handleLoad = useCallback(() => setDisplayLoaded(true), []);
  const handleError = useCallback(() => {
    setError(true);
    setDisplayLoaded(true);
  }, []);

  const blurred = displaySrc !== null && displaySrc !== src && !fullReady;

  return (
    <>
      {/* Shimmer skeleton — exits once the (LQIP or full) img has painted */}
      <AnimatePresence>
        {!displayLoaded ? (
          <motion.div
            ref={inViewRef}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`absolute inset-0 z-[1] ${className}`}
            style={style}
          >
            <div className="w-full h-full bg-secondary/80 overflow-hidden">
              <div
                className="w-full h-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, var(--shimmer-color) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s ease-in-out infinite",
                }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Single in-flow image: starts as the blurred w92, swaps src to
          the preloaded full rendition. Skipped while src is empty. */}
      {src && displaySrc ? (
        <motion.img
          src={displaySrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          className={className}
          style={{
            ...style,
            // UX-1: brightness clamp rides the blur phase - a BRIGHT
            // backdrop's LQIP at hero size read as a white flash against
            // the dark theme (screen-recording frames, 8.4s). Transitions
            // off together with the blur when the sharp rendition lands.
            filter: blurred ? "blur(10px) brightness(0.5)" : "none",
            transition: "filter 0.45s ease-out",
          }}
          onLoad={handleLoad}
          onError={handleError}
          initial={{ opacity: 0 }}
          animate={{ opacity: displayLoaded ? 1 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      ) : null}
    </>
  );
}
