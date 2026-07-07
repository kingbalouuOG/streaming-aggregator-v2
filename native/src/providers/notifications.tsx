import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, type ReactNode } from 'react';

import { clearPushToken, ensureAndroidChannel, registerPushToken } from '@/notifications/push';
import { useAuth } from '@/providers/auth';

// Notifications lifecycle (H0 Stream B). Sits inside the navigation tree so
// notification taps can route via expo-router. Responsibilities:
//   - foreground display behaviour (handler, set once at module scope)
//   - Android channel
//   - token register on sign-in / app start (silent — the value-moment
//     PROMPT lives in the watchlist flow, not here)
//   - token clear on sign-out
//   - tap → deep-link to the title detail page (warm + cold start)
//
// The consent PROMPT is deliberately NOT here — it fires at the first value
// moment (WatchlistActions → maybePromptForPush), per the privacy-forward
// "ask after value, not at launch" rule.

// Show a banner even when the app is foregrounded (SDK 56 shape:
// shouldShowBanner/shouldShowList, not the deprecated shouldShowAlert).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Convert a videx:// deep link from the push payload into an expo-router path. */
function routeFromData(data: unknown): void {
  const url = (data as { url?: string } | undefined)?.url;
  if (!url || typeof url !== 'string') return;
  // videx://detail/movie-123 → /detail/movie-123 ; videx://watchlist → /watchlist
  const path = url.startsWith('videx://') ? `/${url.slice('videx://'.length)}` : url;
  if (!path.startsWith('/')) return;
  try {
    router.push(path as never);
  } catch (err) {
    console.warn('[notifications] route failed for', path, (err as Error).message);
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const prevUserId = useRef<string | null>(null);
  const handledColdStart = useRef(false);

  // Android channel once.
  useEffect(() => {
    void ensureAndroidChannel();
  }, []);

  // Token lifecycle across auth transitions.
  useEffect(() => {
    const prev = prevUserId.current;
    if (userId && userId !== prev) {
      // Signed in (or already signed in on mount) → refresh this device's token.
      void registerPushToken(userId);
    } else if (!userId && prev) {
      // Signed out → drop this device's token + local prompt bookkeeping.
      void clearPushToken();
    }
    prevUserId.current = userId;
  }, [userId]);

  // Tap handling: cold start (once) + warm foreground/background taps.
  useEffect(() => {
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) routeFromData(response.notification.request.content.data);
        })
        .catch(() => {});
    }

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromData(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  return <>{children}</>;
}
