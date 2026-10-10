import { monotonicNow } from './playbackClock';

export interface Ticker {
  subscribe(listener: () => void): () => void;
  /** Time of the latest tick — stable between ticks (safe for useSyncExternalStore). */
  getSnapshot(): number;
}

/**
 * A shared interval that only runs while something subscribes. Hooks
 * subscribe only while playback is advancing, so a paused player costs nothing.
 */
export function createTicker(intervalMs: number, now: () => number = monotonicNow): Ticker {
  let current = now();
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  const tick = () => {
    current = now();
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (timer === null) {
        current = now();
        timer = setInterval(tick, intervalMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    getSnapshot: () => current,
  };
}

/** 10 Hz: lyric line boundaries. */
export const lyricTicker = createTicker(100);
/** 4 Hz: time labels. */
export const clockTicker = createTicker(250);
