import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import {
  MIN_REFRESH_MS,
  REFRESH_CUE_COPY,
  REFRESH_CUE_MS,
  holdAtLeast,
  refreshOutcome,
  type RefreshOutcome,
} from '@/lib/utils/pullToRefresh';

// Shared pull-to-refresh state for the feed tabs (IN-UX-002). Pairs with
// RefreshableScrollView, which draws it. See src/lib/utils/pullToRefresh.ts
// for why the spinner has a floor and why the cue compares titles.

export interface RefreshCue {
  outcome: RefreshOutcome;
  message: string;
  /** Changes per refresh, so a repeat outcome re-runs its entrance. */
  key: number;
}

export interface PullToRefresh {
  /** True while the refetch runs, including the minimum hold. */
  refreshing: boolean;
  /** What the last refresh found; null once the cue has timed out. */
  cue: RefreshCue | null;
  onRefresh: () => Promise<void>;
}

interface Options<T> {
  data: T | undefined;
  /** A react-query `refetch`; it resolves with the result rather than throwing. */
  refetch: () => Promise<{ data: T | undefined; isError: boolean }>;
  /** The titles `data` puts on screen. Keep it referentially stable. */
  signature: (data: T | undefined) => string;
}

export function usePullToRefresh<T>({ data, refetch, signature }: Options<T>): PullToRefresh {
  const [refreshing, setRefreshing] = useState(false);
  const [cue, setCue] = useState<RefreshCue | null>(null);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const inFlight = useRef(false);
  const mounted = useRef(true);
  const cueTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(cueTimer.current);
    };
  }, []);

  const onRefresh = useCallback(async () => {
    // The error-screen retry button and the pull can both call this.
    if (inFlight.current) return;
    inFlight.current = true;

    clearTimeout(cueTimer.current);
    setCue(null);
    setRefreshing(true);

    const before = signature(dataRef.current);
    let outcome: RefreshOutcome;
    try {
      const result = await holdAtLeast(refetch(), MIN_REFRESH_MS);
      outcome = refreshOutcome({ failed: result.isError, before, after: signature(result.data) });
    } catch {
      outcome = 'failed';
    } finally {
      inFlight.current = false;
    }

    if (!mounted.current) return;
    const message = REFRESH_CUE_COPY[outcome];
    // One render: on iOS the cue keeps the control held open, so flipping
    // `refreshing` first would let it spring shut and reopen.
    setRefreshing(false);
    setCue({ outcome, message, key: Date.now() });
    AccessibilityInfo.announceForAccessibility(message);
    cueTimer.current = setTimeout(() => {
      if (mounted.current) setCue(null);
    }, REFRESH_CUE_MS);
  }, [refetch, signature]);

  return { refreshing, cue, onRefresh };
}
