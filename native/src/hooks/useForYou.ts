import { keepPreviousData, useIsRestoring, useQuery } from '@tanstack/react-query';

import { useUserServices } from '@/hooks/useUserServices';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { tryRenderForYouWorker, type WorkerRenderPayload } from '@/lib/recommendations-v2/edgeRender';
import type { ServiceId } from '@/lib/types/content';

// Native For You (NATIVE-2 W5c). Renders via the videx-api Worker only
// (tryRenderForYouWorker); the localStorage-bound client fallback
// pipeline is deliberately NOT ported - on native a Worker miss shows a
// retry state rather than running an unsupported fallback.
//
// tryRenderForYouWorker resolves to null ONLY when the Worker path
// doesn't apply (no proxy configured, no access token / signed out); the
// screen treats null as "not ready". A transport/server failure THROWS
// (WorkerRenderError), which we let propagate so this query retries
// (retry:2) and then flips to isError — the screen shows its retry state.
// Crucially the throw keeps a transient Worker blip OUT of the query
// cache/disk persister, so a cold start can't restore a bogus empty feed
// (pre-launch review 2026-07-12). A user with no taste profile yet gets a
// 200 empty payload, not null, so onboarding-in-progress renders the
// empty state, not the error state. NATIVE-3 W7: scored against the
// user's onboarding-saved services (useUserServices).

async function fetchForYou(services: ServiceId[]): Promise<WorkerRenderPayload | null> {
  const providerIds = serviceIdsToProviderIds(services);
  return tryRenderForYouWorker(providerIds);
}

/**
 * B6 — stale-while-revalidate.
 *
 * The persisted MMKV cache has always held the last payload; the app just
 * never preferred it on launch. Two things stopped it painting:
 *
 *  1. While PersistQueryClientProvider restores, queries are PAUSED —
 *     `isFetching` is false, so `isLoading` is false, and `data` is still
 *     undefined. The screen's `if (!data)` branch therefore ran, showing
 *     the failure state for a moment on every cold start. The same held
 *     before `useUserServices` resolved, since `enabled` was false.
 *     "Nothing yet" was being rendered as "something broke".
 *
 *  2. The query key embeds the service list, so the moment services
 *     resolve the key CHANGES — and the new key has no in-memory data,
 *     dropping the screen back to empty even when the old key was showing
 *     content.
 *
 * `isBootstrapping` distinguishes "no data yet" from "this failed", and
 * keepPreviousData carries the previous key's payload across the switch.
 * Revalidation is unchanged — a stale entry still refetches in the
 * background, it just does so behind visible content.
 */
export function useForYou() {
  const { data: services } = useUserServices();
  const isRestoring = useIsRestoring();

  const query = useQuery({
    queryKey: ['native', 'foryou', services?.join(',') ?? ''],
    queryFn: () => fetchForYou(services ?? []),
    enabled: !!services,
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    /** True while the cache is still restoring or services have not
     *  resolved — i.e. we genuinely have nothing to show yet. Screens must
     *  branch on this BEFORE testing `data`, or a cold start renders the
     *  failure state for a frame. */
    isBootstrapping: isRestoring || !services,
  };
}
