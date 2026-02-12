import { useState, useCallback, useRef } from 'react';

interface UseIntersectionObserverOptions {
  rootMargin?: string;
  threshold?: number;
  triggerOnce?: boolean;
}

export function useIntersectionObserver(options?: UseIntersectionObserverOptions) {
  const { rootMargin = '200px 0px', threshold = 0, triggerOnce = true } = options || {};
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      // Clean up previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (triggerOnce && observerRef.current) {
              observerRef.current.disconnect();
              observerRef.current = null;
            }
          } else if (!triggerOnce) {
            setIsVisible(false);
          }
        },
        { rootMargin, threshold }
      );

      observerRef.current.observe(node);
    },
    [rootMargin, threshold, triggerOnce]
  );

  return { ref, isVisible };
}
