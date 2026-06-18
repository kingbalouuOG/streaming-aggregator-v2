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
// Returns null when: no proxy configured, no access token (signed out),
// the user has no taste profile yet, or the Worker errors. The screen
// treats null as "not ready". NATIVE-3 W7: scored against the user's
// onboarding-saved services (useUserServices).

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
