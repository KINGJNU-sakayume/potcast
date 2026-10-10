import { createContext, useContext } from 'react';
import type { Session } from './session';

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside a session provider');
  return session;
}

export function useOptionalSession(): Session | null {
  return useContext(SessionContext);
}
