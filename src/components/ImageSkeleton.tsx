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

export function ImageSkeleton({ src, alt, className = "", style, priority = false }: ImageSkeletonProps) {
  const [loaded, setLoaded] = useState(false);
  const [lqipLoaded, setLqipLoaded] = useState(false);
  const [, setError] = useState(false);

  // Viewport gate (PLAT-1). The observer attaches to the shimmer box —
  // it exists exactly while the image hasn't loaded, which is exactly
  // when we need observation. triggerOnce keeps shouldLoad latched.
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
      setLoaded(true);
    }
  }, [src]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => {
    setError(true);
    setLoaded(true);
  }, []);
  const handleLqipLoad = useCallback(() => setLqipLoaded(true), []);

  return (
    <>
      {/* Shimmer skeleton — hides once EITHER the blur-up or the full
          image is ready */}
      <AnimatePresence>
        {!loaded && !lqipLoaded ? (
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

      {/* LQIP blur-up — absolute twin under the real image while it loads */}
      {shouldLoad && lqipSrc && !loaded ? (
        <img
          src={lqipSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onLoad={handleLqipLoad}
          className={`absolute inset-0 ${className}`}
          style={{ ...style, filter: "blur(12px)", transform: "scale(1.06)" }}
        />
      ) : null}

      {/* Actual image — only requested once in (near-)view; skip if src
          is empty to avoid loading the current page */}
      {src && shouldLoad ? (
        <motion.img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          className={className}
          style={style}
          onLoad={handleLoad}
          onError={handleError}
          initial={{ opacity: 0 }}
          animate={{ opacity: loaded ? 1 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      ) : null}
    </>
  );
}
