import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

interface ImageSkeletonProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

export function ImageSkeleton({ src, alt, className = "", style }: ImageSkeletonProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // If src is empty/falsy, skip shimmer and show placeholder immediately
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

  return (
    <>
      {/* Shimmer skeleton */}
      <AnimatePresence>
        {!loaded && (
          <motion.div
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
        )}
      </AnimatePresence>

      {/* Actual image (skip if src is empty to avoid loading current page) */}
      {src && (
        <motion.img
          src={src}
          alt={alt}
          className={className}
          style={style}
          onLoad={handleLoad}
          onError={handleError}
          initial={{ opacity: 0 }}
          animate={{ opacity: loaded ? 1 : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      )}
    </>
  );
}