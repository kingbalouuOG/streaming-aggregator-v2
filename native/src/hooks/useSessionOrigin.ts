import { useSyncExternalStore } from 'react';

import {
  getSessionOrigin,
  subscribeSessionOrigin,
  type SessionOrigin,
} from '@/lib/instrumentation/sessionOrigin';

// The in-memory push origin of this session (Growth S4). Re-renders when a
// push tap sets it, the "Tell someone" banner is dismissed, or the session
// rolls over after the app sat in the background.
export function useSessionOrigin(): SessionOrigin | null {
  return useSyncExternalStore(subscribeSessionOrigin, getSessionOrigin);
}
