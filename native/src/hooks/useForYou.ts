import { useQuery } from '@tanstack/react-query';

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

export function useForYou() {
  const { data: services } = useUserServices();
  return useQuery({
    queryKey: ['native', 'foryou', services?.join(',') ?? ''],
    queryFn: () => fetchForYou(services ?? []),
    enabled: !!services,
    staleTime: 10 * 60 * 1000,
  });
}
