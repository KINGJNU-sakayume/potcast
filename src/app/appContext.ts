import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AuthState } from '../auth/authService';
import type { AppServices } from './services';

export const AppServicesContext = createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error('useAppServices must be used inside <AppServicesContext.Provider>');
  return services;
}

export function useAppConfig() {
  return useAppServices().config;
}

const noopSubscribe = () => () => undefined;
const signedOut: AuthState = { status: 'signed-out' };
const getSignedOut = () => signedOut;

/** Current Spotify authorization state; `signed-out` when Spotify is not configured. */
export function useAuthState(): AuthState {
  const { auth } = useAppServices();
  return useSyncExternalStore(auth ? auth.subscribe : noopSubscribe, auth ? auth.getSnapshot : getSignedOut);
}
