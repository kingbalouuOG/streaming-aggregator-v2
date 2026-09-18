import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, type ReactNode } from 'react';

import { sendGrowthEvent } from '@/attribution';
import { setSessionOrigin } from '@/lib/instrumentation/sessionOrigin';
import { pushOpen, pushOriginType, pushRoute, str, type PushPayload } from '@/lib/notifications/pushTap';
import { clearPushToken, ensureAndroidChannel, registerPushToken } from '@/notifications/push';
import { useAuth } from '@/providers/auth';

// Notifications lifecycle (H0 Stream B). Sits inside the navigation tree so
// notification taps can route via expo-router. Responsibilities:
//   - foreground display behaviour (handler, set once at module scope)
//   - Android channel
//   - token register on sign-in / app start (silent — the automatic ask
//     lives on For You, not here)
//   - token clear on sign-out
//   - tap → deep-link to the title detail page, the watchlist, or (for a
//     household nudge, G2 H4) the shared list (warm + cold start)
//   - tap → notification_opened growth event and a push session origin
//     (Growth S4: push CTR by delivery_id, src=push shares, "Tell someone";
//     push_id and metadata.kind since G2 H4). The pure half is
//     src/lib/notifications/pushTap.ts.
//
// The consent PROMPT is deliberately NOT here. Rule (IN-GR-034, Joe
// 2026-09-17): ask after onboarding, never at cold launch, with an in-app
// explainer first. For You mounts PushExplainerHost once its feed has loaded
// and any pending shared link has been shown; "Turn on" shows the OS prompt,
// "Not now" is remembered and never re-asked automatically (Profile →
// Notifications stays the way in). Once per install and account:
// clearPushToken resets the record on sign-out.

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

/**
 * Record the open and mark the session as push-originated before routing, so
 * the detail page it lands on can show "Tell someone". Pushes sent before the
 * S4 function deploy carry only url and type: delivery_id is null then and
 * the moment has no service to name, so it does not show.
 */
function recordPushOpen(payload: PushPayload, url: string): void {
  try {
    const { object, deliveryId, metadata } = pushOpen(payload, url);
    sendGrowthEvent({
      name: 'notification_opened',
      object,
      deliveryId,
      via: 'push',
      src: 'push',
      metadata,
    });
    setSessionOrigin({
      origin: 'push',
      object,
      type: pushOriginType(str(payload.type)),
      serviceId: str(payload.service_id),
      expiresOn: str(payload.expires_on),
      at: Date.now(),
    });
  } catch {
    // Telemetry never blocks the tap.
  }
}

/**
 * Convert a videx:// deep link from the push payload into an expo-router path.
 * Routes with router.push, so +native-intent (system links only) is bypassed;
 * object links resolve through parseInboundLink (pushRoute), so
 * videx://list/{id} lands on /list/{id} and videx://watchlist on /watchlist.
 */
function routeFromData(data: unknown): void {
  const payload = (data ?? {}) as PushPayload;
  const url = str(payload.url);
  if (!url) return;
  const path = pushRoute(url);
  if (!path) return;
  try {
    router.push(path as never);
  } catch (err) {
    // Not opened: no notification_opened row, no push session (sweep F6).
    console.warn('[notifications] route failed for', path, (err as Error).message);
    return;
  }
  recordPushOpen(payload, url);
}

// The cold-start response can also reach the listener; handle each tap once,
// then clear it so a later launch cannot replay the route, the
// notification_opened event and the push session origin.
let lastHandledTap: string | null = null;

function handleTap(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as PushPayload | undefined;
  const id = response.notification.request.identifier || str(data?.delivery_id);
  if (id && id === lastHandledTap) return;
  lastHandledTap = id;
  routeFromData(response.notification.request.content.data);
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Best-effort.
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
          if (response) handleTap(response);
        })
        .catch(() => {});
    }

    const sub = Notifications.addNotificationResponseReceivedListener(handleTap);
    return () => sub.remove();
  }, []);

  return <>{children}</>;
}
