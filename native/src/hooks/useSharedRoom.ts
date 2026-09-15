import { useQuery } from '@tanstack/react-query';

import { fetchSharedRoom, SharedRoomNotFoundError } from '@/sharedRoomApi';

// A shared room snapshot (Growth G0-4). The titles never change; only
// their availability does, so a 10-minute stale time is plenty. A 404 is
// final — no retries for a room that does not exist.
export function useSharedRoom(id: string | undefined) {
  return useQuery({
    queryKey: ['native', 'sharedRoom', id ?? ''],
    queryFn: () => fetchSharedRoom(id ?? ''),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    retry: (count, error) => !(error instanceof SharedRoomNotFoundError) && count < 2,
  });
}
