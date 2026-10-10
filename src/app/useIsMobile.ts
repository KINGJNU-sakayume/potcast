import { useSyncExternalStore } from 'react';

/**
 * The phone layout: a narrow window, or a touch screen turned sideways (an
 * iPhone in landscape is wider than the breakpoint but only ~390px tall).
 * Everything wider keeps the desktop shell unchanged.
 */
export const MOBILE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 520px)';

function mediaQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_QUERY) : null;
}

function subscribe(listener: () => void): () => void {
  const query = mediaQuery();
  if (!query) return () => undefined;
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

const getSnapshot = () => mediaQuery()?.matches ?? false;
const getServerSnapshot = () => false;

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** A phone or tablet browser, where Spotify's Web Playback SDK does not run. */
export function isHandheldBrowser(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}
