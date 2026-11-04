import { createContext, useContext } from 'react';

/** Overlays owned by the app shell: search, the queue and settings, and (desktop) Focus Mode. */
export interface ShellControls {
  openSearch: () => void;
  openQueue: () => void;
  toggleSettings: () => void;
  /** Opens settings (never closes them): after a Life Hub sign-in comes back. */
  openSettings: () => void;
  /** Desktop only: full-screen cover, lyrics and progress. */
  toggleFocus?: () => void;
  focusMode?: boolean;
}

export const ShellContext = createContext<ShellControls>({
  openSearch: () => undefined,
  openQueue: () => undefined,
  toggleSettings: () => undefined,
  openSettings: () => undefined,
});

export function useShell(): ShellControls {
  return useContext(ShellContext);
}
