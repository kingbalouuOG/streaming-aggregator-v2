import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import storage from '@/lib/storage';
import { useAuth } from '@/providers/auth';

// One-time timed feedback prompt. Accumulates foreground time across sessions
// (banked on background, ticked while active) and, once it crosses ~5 minutes
// of cumulative signed-in use, opens the FeedbackSheet a single time. The
// "shown" flag persists in MMKV so it never auto-fires again — manual
// feedback (Profile → Send feedback) stays available afterward.

const THRESHOLD_MS = 5 * 60 * 1000;
const TICK_MS = 15 * 1000;
const SHOWN_KEY = 'fb_prompt_shown';
const FG_MS_KEY = 'fb_fg_ms';

export function useFeedbackPrompt() {
  const { session } = useAuth();
  const signedIn = !!session?.user;
  const [visible, setVisible] = useState(false);

  // Assume "already shown" until storage says otherwise — prevents a
  // premature fire in the window before the persisted flag loads.
  const shownRef = useRef(true);
  const cumulativeRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [shown, ms] = await Promise.all([storage.getItem(SHOWN_KEY), storage.getItem(FG_MS_KEY)]);
      if (!mounted) return;
      shownRef.current = shown === '1';
      cumulativeRef.current = ms ? Number(ms) || 0 : 0;
      loadedRef.current = true;
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) {
      segmentStartRef.current = null;
      return;
    }

    const accumulate = () => {
      if (segmentStartRef.current != null) {
        cumulativeRef.current += Date.now() - segmentStartRef.current;
        segmentStartRef.current = Date.now();
      }
    };

    const maybeTrigger = () => {
      if (!loadedRef.current || shownRef.current) return;
      accumulate();
      if (cumulativeRef.current >= THRESHOLD_MS) {
        shownRef.current = true;
        storage.setItem(SHOWN_KEY, '1');
        storage.setItem(FG_MS_KEY, String(cumulativeRef.current));
        setVisible(true);
      }
    };

    // Begin counting the current foreground segment.
    segmentStartRef.current = Date.now();
    const interval = setInterval(maybeTrigger, TICK_MS);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        segmentStartRef.current = Date.now();
      } else {
        // Background / inactive — bank the elapsed segment to disk.
        accumulate();
        segmentStartRef.current = null;
        storage.setItem(FG_MS_KEY, String(cumulativeRef.current));
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
      accumulate();
      storage.setItem(FG_MS_KEY, String(cumulativeRef.current));
    };
  }, [signedIn]);

  return { visible, dismiss: () => setVisible(false) };
}
