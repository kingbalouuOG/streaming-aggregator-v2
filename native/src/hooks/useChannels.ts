import { useQuery } from '@tanstack/react-query';

import { getChannelRegistry, getUserChannels } from '@/lib/storage/serviceChannels';

// Add-on channel entitlements (IN-SC-004). The registry is curated data
// that changes without a release, so it is read rather than bundled; it
// moves slowly, hence the long staleTime.

export function useChannelRegistry() {
  return useQuery({
    queryKey: ['native', 'channelRegistry'],
    queryFn: getChannelRegistry,
    staleTime: 6 * 60 * 60 * 1000,
  });
}

/**
 * The signed-in user's non-standalone channels. One retry only: For You and
 * Home wait for this to settle before rendering, and a read that keeps
 * failing should fall through to "no channels" quickly, not stall the feed.
 */
export function useUserChannels() {
  return useQuery({
    queryKey: ['native', 'userChannels'],
    queryFn: getUserChannels,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
