import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { AppServicesContext } from './app/appContext';
import type { AppServices } from './app/services';
import { SessionRoot } from './app/SessionRoot';

/**
 * Hash routing keeps deep links and refreshes working on GitHub Pages; the
 * Spotify redirect URI stays the app root.
 */
export function App({ services }: { services: AppServices }) {
  return (
    <AppServicesContext.Provider value={services}>
      <QueryClientProvider client={services.queryClient}>
        <HashRouter>
          <SessionRoot />
        </HashRouter>
      </QueryClientProvider>
    </AppServicesContext.Provider>
  );
}
