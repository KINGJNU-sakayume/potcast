import { useCallback, useEffect, useMemo, useSyncExternalStore, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../app/sessionContext';
import { findActiveLineIndex, firstLineAfter } from '../lyrics/lyricSync';
import type { TimedLyricLine } from '../lyrics/types';
import { monotonicNow, positionAt } from './playbackClock';
import { clockTicker, lyricTicker } from './ticker';
import type { PlayRequest, PlayerState } from './types';

const noopSubscribe = () => () => undefined;

/** Reads from the session's PlayerStore. The selector must return stored references or primitives. */
export function usePlayerSelector<T>(selector: (state: PlayerState) => T): T {
  const { store } = useSession();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

export function usePlayerSnapshot() {
  return usePlayerSelector((state) => state.snapshot);
}

function useIsAdvancing(): boolean {
  return usePlayerSelector((s) => Boolean(s.snapshot.track) && !s.snapshot.paused && !s.snapshot.buffering);
}

/** Current position for time labels (4 Hz while playing, static while paused). */
export function usePlaybackPosition(): number {
  const snapshot = usePlayerSnapshot();
  const advancing = useIsAdvancing();
  const now = useSyncExternalStore(advancing ? clockTicker.subscribe : noopSubscribe, clockTicker.getSnapshot);
  return positionAt(snapshot, advancing ? now : snapshot.sampledAt);
}

export interface LyricCursor {
  /** Active line, or -1 before the first line and inside instrumental gaps. */
  activeIndex: number;
  /** First upcoming line. */
  nextIndex: number;
}

/**
 * Lyric position derived from the central playback clock (never an
 * independent timer). The snapshot is a primitive key, so the component
 * re-renders only when the cursor moves to another line.
 */
export function useLyricCursor(lines: readonly TimedLyricLine[] | null): LyricCursor {
  const { store } = useSession();
  const advancing = useIsAdvancing();
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribeStore = store.subscribe(listener);
      const unsubscribeTicker = advancing ? lyricTicker.subscribe(listener) : () => undefined;
      return () => {
        unsubscribeStore();
        unsubscribeTicker();
      };
    },
    [store, advancing],
  );
  const getSnapshot = useCallback(() => {
    if (!lines || lines.length === 0) return '-1:0';
    const { snapshot } = store.getState();
    const position = positionAt(snapshot, advancing ? lyricTicker.getSnapshot() : snapshot.sampledAt);
    const activeIndex = findActiveLineIndex(lines, position);
    const nextIndex = activeIndex >= 0 ? activeIndex + 1 : firstLineAfter(lines, position);
    return `${activeIndex}:${nextIndex}`;
  }, [store, lines, advancing]);
  const key = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => {
    const [activeIndex = -1, nextIndex = 0] = key.split(':').map(Number);
    return { activeIndex, nextIndex };
  }, [key]);
}

/**
 * Writes the playback fraction into a CSS custom property on every animation
 * frame while playing — smooth progress without React re-renders.
 */
export function useProgressProperty(ref: RefObject<HTMLElement | null>, property = '--progress'): void {
  const { store } = useSession();
  useEffect(() => {
    let frame = 0;
    const render = () => {
      cancelAnimationFrame(frame);
      const { snapshot } = store.getState();
      const fraction = snapshot.durationMs > 0 ? positionAt(snapshot, monotonicNow()) / snapshot.durationMs : 0;
      ref.current?.style.setProperty(property, fraction.toFixed(5));
      if (snapshot.track && !snapshot.paused && !snapshot.buffering) frame = requestAnimationFrame(render);
    };
    render();
    const unsubscribe = store.subscribe(render);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [store, ref, property]);
}

/**
 * Starts playback from a click. `activateAudio` runs synchronously inside the
 * gesture so browsers allow the Web Playback SDK to produce sound.
 */
export function usePlay() {
  const { engine } = useSession();
  const navigate = useNavigate();
  return useCallback(
    (request: PlayRequest, options: { openNowPlaying?: boolean } = {}) => {
      engine.activateAudio();
      void engine.play(request);
      if (options.openNowPlaying) navigate('/now-playing');
    },
    [engine, navigate],
  );
}

export function useEngine() {
  return useSession().engine;
}
