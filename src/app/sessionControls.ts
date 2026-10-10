import { createContext, useContext } from 'react';

export interface SessionControls {
  enterPreview(): void;
  exitPreview(): void;
  signOut(): void;
}

export const SessionControlsContext = createContext<SessionControls>({
  enterPreview: () => undefined,
  exitPreview: () => undefined,
  signOut: () => undefined,
});

export function useSessionControls(): SessionControls {
  return useContext(SessionControlsContext);
}
