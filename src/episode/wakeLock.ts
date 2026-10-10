import { useEffect } from 'react';

/** The part of the Screen Wake Lock API used here. */
interface WakeLockLike {
  request(type: 'screen'): Promise<{ release(): Promise<void> }>;
}

function touchDevice(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Keeps a phone's screen on while an episode plays. An episode is performed
 * by this page — it starts and stops the music and the hosts line by line —
 * and a phone that locks its screen suspends the page in the middle of it.
 * A computer keeps running the page with its display asleep, so it is left
 * to sleep as it likes.
 *
 * The browser drops the lock whenever the page is hidden; it is asked for
 * again when the page comes back.
 */
export function useScreenAwake(active: boolean): void {
  useEffect(() => {
    const wakeLock = typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock : undefined;
    if (!active || !wakeLock || !touchDevice()) return;
    let lock: { release(): Promise<void> } | null = null;
    let over = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      wakeLock.request('screen').then(
        (held) => {
          if (over) void held.release().catch(() => undefined);
          else lock = held;
        },
        // Refused (battery saver, an old browser): the episode still plays for as long as the screen is on.
        () => undefined,
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      over = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
