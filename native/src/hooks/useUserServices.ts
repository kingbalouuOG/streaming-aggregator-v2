import { useQuery } from '@tanstack/react-query';

import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { getUserPreferences } from '@/lib/storage/userPreferences';
import type { ServiceId } from '@/lib/types/content';

// The signed-in user's connected services (NATIVE-3 W7), loaded from the
// onboarding-saved preferences. Retires the hardcoded DEV_SERVICES set
// that Home/For You used before onboarding existed. Falls back to a
// sensible default UK stack if prefs are somehow empty so the feed never
// blanks.
const FALLBACK_SERVICES: ServiceId[] = ['netflix', 'prime', 'disney', 'apple', 'itvx', 'bbc'];

async function fetchUserServices(): Promise<ServiceId[]> {
  const prefs = await getUserPreferences();
  const ids = (prefs?.platforms ?? [])
    .filter((p) => p.selected !== false)
    .map((p) => providerIdToServiceId(p.id))
    .filter(Boolean) as ServiceId[];
  return ids.length > 0 ? ids : FALLBACK_SERVICES;
}

export function useUserServices() {
  return useQuery({
    queryKey: ['native', 'userServices'],
    queryFn: fetchUserServices,
    staleTime: 5 * 60 * 1000,
  });
}
