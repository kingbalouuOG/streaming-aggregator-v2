import { useQuery } from '@tanstack/react-query';

import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { ContentItem, ServiceId } from '@/lib/types/content';
import { getCachedServices } from '@/lib/utils/serviceCache';

// A title's services for badge rendering. Uses item.services when already
// populated (per-service chart rows carry it), otherwise lazily resolves via
// TMDb watch/providers (serviceCache — in-memory cached, dedup'd, Hermes-safe).
// Cards paint immediately and badges fill in when resolved — the web's lazy
// availability pattern. The TMDb adapters set services: [], so without this
// every search / popular / calendar card would show no badges.
export function useItemServices(item: ContentItem, max = 3): ServiceId[] {
  const has = item.services.length > 0;
  const { tmdbId, mediaType } = parseContentItemId(item.id);
  const { data } = useQuery({
    queryKey: ['native', 'itemServices', mediaType, tmdbId],
    queryFn: () => getCachedServices(String(tmdbId), mediaType, max),
    enabled: !has && tmdbId > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
  return has ? item.services : (data ?? []);
}
