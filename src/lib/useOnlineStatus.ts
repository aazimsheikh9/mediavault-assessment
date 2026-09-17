import { useEffect, useState } from 'react';

/**
 * Tracks connectivity via the browser's online/offline events.
 *
 * Returns `true` while online. Callers use it to show an offline banner and to
 * trigger recovery (refetch) on reconnect. `navigator.onLine` is not perfectly
 * reliable across browsers, but combined with the events it is the standard
 * signal and enough to stop hammering a dead connection and to recover from it.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
