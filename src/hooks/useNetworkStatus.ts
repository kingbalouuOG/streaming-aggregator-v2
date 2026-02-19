import { useState, useEffect, useCallback } from 'react';
import { Network } from '@capacitor/network';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  const recheck = useCallback(async () => {
    const status = await Network.getStatus();
    setIsOnline(status.connected);
  }, []);

  useEffect(() => {
    // Check initial status
    recheck();

    // Listen for changes (works on both web and native)
    const listener = Network.addListener('networkStatusChange', (status) => {
      setIsOnline(status.connected);
    });

    return () => { listener.then((l) => l.remove()); };
  }, []);

  return { isOnline, recheck };
}
