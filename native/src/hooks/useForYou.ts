import { useQuery } from '@tanstack/react-query';

import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { tryRenderForYouWorker, type WorkerRenderPayload } from '@/lib/recommendations-v2/edgeRender';
import type { ServiceId } from '@/lib/types/content';

// Native For You (NATIVE-2 W5c). Renders via the videx-api Worker only
// (tryRenderForYouWorker); the localStorage-bound client fallback
// pipeline is deliberately NOT ported — on native a Worker miss shows a
// retry state rather than running an unsupported fallback.
//
// Returns null when: no proxy configured, no access token (signed out),
// the user has no taste profile yet (Worker 4xx — onboarding is
// NATIVE-3), or the Worker errors. The screen treats null as "not ready".
//
// TODO(NATIVE-3): replace DEV_SERVICES with the user's saved service
// preferences once onboarding + prefs exist natively.
const DEV_SERVICES: ServiceId[] = ['netflix', 'prime', 'disney', 'apple', 'itvx', 'bbc'];

async function fetchForYou(): Promise<WorkerRenderPayload | null> {
  const providerIds = serviceIdsToProviderIds(DEV_SERVICES);
  return tryRenderForYouWorker(providerIds);
}

export function useForYou() {
  return useQuery({
    queryKey: ['native', 'foryou'],
    queryFn: fetchForYou,
    staleTime: 10 * 60 * 1000,
  });
}
