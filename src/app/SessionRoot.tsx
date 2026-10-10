import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { SessionMode } from '../catalogue/CatalogueSource';
import { AlbumPage } from '../pages/AlbumPage';
import { ArchivePage } from '../pages/ArchivePage';
import { ArtistPage } from '../pages/ArtistPage';
import { LibraryPage } from '../pages/LibraryPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { NowPlayingPage } from '../pages/NowPlayingPage';
import { MobileArchivePage } from '../pages/mobile/MobileArchivePage';
import { MobileLibraryPage } from '../pages/mobile/MobileLibraryPage';
import { MobileNowPlayingPage } from '../pages/mobile/MobileNowPlayingPage';
import { MobileSearchPage } from '../pages/mobile/MobileSearchPage';
import { AppShell } from './AppShell';
import { useAppServices, useAuthState } from './appContext';
import { AuthCallbackView, isAuthCallback } from './AuthCallback';
import { ConnectView } from './ConnectView';
import { DesktopSearchRoute, Responsive } from './Responsive';
import {
  createPreviewSession,
  createSpotifySession,
  isPreviewRequested,
  retainEngine,
  setPreviewRequested,
  type Session,
} from './session';
import { SessionContext } from './sessionContext';
import { SessionControlsContext, type SessionControls } from './sessionControls';

function SessionScope({ session }: { session: Session }) {
  return (
    <SessionContext.Provider value={session}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/now-playing" replace />} />
          <Route path="now-playing" element={<Responsive desktop={<NowPlayingPage />} mobile={<MobileNowPlayingPage />} />} />
          <Route path="library" element={<Responsive desktop={<LibraryPage />} mobile={<MobileLibraryPage />} />} />
          <Route path="search" element={<Responsive desktop={<DesktopSearchRoute />} mobile={<MobileSearchPage />} />} />
          <Route path="archive" element={<Responsive desktop={<ArchivePage />} mobile={<MobileArchivePage />} />} />
          <Route path="artist/:artistId" element={<ArtistPage />} />
          <Route path="album/:albumId" element={<AlbumPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SessionContext.Provider>
  );
}

/**
 * Chooses the session: Spotify when authorized, the offline preview when the
 * listener asked for it, otherwise the connect state. One PlayerStore per
 * session survives every route change. Spotify redirects back to the app
 * root with `?code=…`, which is completed here before any route renders.
 */
export function SessionRoot() {
  const services = useAppServices();
  const auth = useAuthState();
  const [callback, setCallback] = useState(() => isAuthCallback(window.location.search));
  const [previewRequested, setPreview] = useState(() => services.config.previewEnabled && isPreviewRequested());

  const mode: SessionMode | null = auth.status === 'signed-in' ? 'spotify' : previewRequested ? 'preview' : null;

  const session = useMemo(
    () => (mode === 'spotify' ? createSpotifySession(services) : mode === 'preview' ? createPreviewSession(services) : null),
    [mode, services],
  );

  useEffect(() => (session ? retainEngine(session.engine) : undefined), [session]);

  // `?preview` in the URL starts the preview; remember it for reloads in this tab.
  useEffect(() => {
    if (previewRequested) setPreviewRequested(true);
  }, [previewRequested]);

  const finishCallback = useCallback(() => setCallback(false), []);

  const controls = useMemo<SessionControls>(
    () => ({
      enterPreview: () => {
        setPreviewRequested(true);
        setPreview(true);
      },
      exitPreview: () => {
        setPreviewRequested(false);
        setPreview(false);
        services.queryClient.removeQueries({ queryKey: ['preview'] });
      },
      signOut: () => {
        services.auth?.logout();
        services.queryClient.removeQueries({ queryKey: ['spotify'] });
      },
    }),
    [services],
  );

  let content;
  if (callback) content = <AuthCallbackView onDone={finishCallback} />;
  else if (session) content = <SessionScope session={session} />;
  else content = <ConnectView />;

  return <SessionControlsContext.Provider value={controls}>{content}</SessionControlsContext.Provider>;
}
