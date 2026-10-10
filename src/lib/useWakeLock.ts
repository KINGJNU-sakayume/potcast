import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };

/**
 * Keeps the screen on while `enabled` (Screen Wake Lock API). The lock drops
 * whenever the page is hidden, so it is requested again on return. Returns
 * whether the browser offers it at all.
 */
export function useWakeLock(enabled: boolean): boolean {
  const supported = typeof navigator !== 'undefined' && Boolean((navigator as WakeLockNavigator).wakeLock);
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!enabled || !wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await wakeLock.request('screen');
        if (cancelled) void next.release();
        else sentinel = next;
      } catch {
        // Refused (battery saver, an embedded frame): the screen just follows its normal timeout.
      }
    };
    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);

  return supported;
}
