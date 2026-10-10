import { createContext, useContext } from 'react';

/** Overlays owned by the app shell: search, the queue and settings, and (desktop) Focus Mode. */
export interface ShellControls {
  openSearch: () => void;
  openQueue: () => void;
  toggleSettings: () => void;
  /** Desktop only: full-screen cover, lyrics and progress. */
  toggleFocus?: () => void;
  focusMode?: boolean;
}

export const ShellContext = createContext<ShellControls>({
  openSearch: () => undefined,
  openQueue: () => undefined,
  toggleSettings: () => undefined,
});

export function useShell(): ShellControls {
  return useContext(ShellContext);
}
