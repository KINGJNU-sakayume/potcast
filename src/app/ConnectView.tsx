import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { SPOTIFY_SCOPES } from '../spotify/scopes';
import { useAppServices, useAuthState } from './appContext';
import { useSessionControls } from './sessionControls';

/** The rail without a session: the same frame as the app, nothing to navigate yet. */
export function MinimalShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <aside className="rail" aria-label="ARC Music">
        <span className="logo" aria-hidden="true">
          <Logo size={40} />
        </span>
      </aside>
      <main className="workspace">
        <section className="stage" id="main">
          <div className="view active">{children}</div>
        </section>
      </main>
    </div>
  );
}

/**
 * Signed-out state: connect Spotify, open the preview archive, or — when the
 * build has no client ID — the setup steps. Also covers an expired
 * authorization and opening the app at a different origin than the
 * registered redirect URI.
 */
export function ConnectView() {
  const { config, auth } = useAppServices();
  const authState = useAuthState();
  const controls = useSessionControls();
  const location = useLocation();

  useEffect(() => {
    document.title = 'Connect Spotify · ARC Music';
  }, []);

  const redirectOrigin = (() => {
    try {
      return new URL(config.redirectUri).origin;
    } catch {
      return null;
    }
  })();
  const wrongOrigin = Boolean(auth && redirectOrigin && redirectOrigin !== window.location.origin);
  const returnTo = location.pathname === '/' ? '/now-playing' : `${location.pathname}${location.search}`;
  const expired = authState.status === 'expired';

  return (
    <MinimalShell>
      <div className="state-page connect-page">
        <div className="label">{expired ? 'Authorization expired' : 'Now playing'}</div>
        <h1>{!auth ? 'Spotify isn’t configured' : expired ? 'Reconnect Spotify' : 'Connect Spotify'}</h1>
        <p>
          {expired && authState.status === 'expired'
            ? authState.message
            : 'ARC Music reads your Spotify library and plays in this browser or on any of your Spotify devices. Timed lyrics follow the real playback position; the notes are ARC’s own.'}
        </p>

        {wrongOrigin && redirectOrigin && (
          <p className="connect-warning" role="status">
            Spotify returns you to <code>{redirectOrigin}</code>, and the session is stored per address.{' '}
            <a className="linkish" href={`${redirectOrigin}${config.basePath}`}>
              Open ARC there
            </a>{' '}
            before connecting.
          </p>
        )}

        <div className="state-actions">
          {auth && (
            <button type="button" className="plain-action primary" onClick={() => void auth.beginLogin(returnTo)}>
              {expired ? 'Reconnect Spotify' : 'Connect Spotify'}
            </button>
          )}
          {config.previewEnabled && (
            <button type="button" className="plain-action" onClick={controls.enterPreview}>
              Preview without Spotify
            </button>
          )}
        </div>

        <div className="connect-facts">
          {!auth ? (
            <ol>
              <li>Create an app at developer.spotify.com/dashboard with the Web API and Web Playback SDK.</li>
              <li>
                Register this exact Redirect URI: <code>{config.redirectUri}</code>
              </li>
              <li>
                {import.meta.env.DEV ? (
                  <>
                    Put its Client ID in <code>.env.local</code> as <code>VITE_SPOTIFY_CLIENT_ID</code> and restart the dev server.
                  </>
                ) : (
                  <>
                    Build with its Client ID as <code>VITE_SPOTIFY_CLIENT_ID</code> — on GitHub Pages, a repository variable — then
                    deploy again.
                  </>
                )}
              </li>
            </ol>
          ) : (
            <ol>
              <li>Browser playback needs Spotify Premium and a browser with protected-media (DRM) support.</li>
              <li>Authorization uses PKCE; no client secret exists in this app. Tokens stay in this browser until you disconnect.</li>
              <li>
                Redirect URI in use: <code>{config.redirectUri}</code>
              </li>
            </ol>
          )}
          <details>
            <summary>Permissions requested ({SPOTIFY_SCOPES.length})</summary>
            <ul>
              {SPOTIFY_SCOPES.map(({ scope, reason }) => (
                <li key={scope}>
                  <code>{scope}</code> <span>{reason}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </MinimalShell>
  );
}
