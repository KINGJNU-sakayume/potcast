import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpotifyAuthError, type SpotifyAuth } from '../auth/authService';
import { useAppServices } from './appContext';
import { MinimalShell } from './ConnectView';

/** Spotify returns to the registered root URI with the result in the query string. */
export function isAuthCallback(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('code') || params.has('error');
}

// The authorization code is single-use; React StrictMode runs effects twice.
const completions = new Map<string, Promise<{ returnTo: string }>>();

function completeOnce(auth: SpotifyAuth, search: string) {
  let pending = completions.get(search);
  if (!pending) {
    pending = auth.completeLogin(search);
    completions.set(search, pending);
  }
  return pending;
}

/** Drops `?code=…&state=…` from the address so a reload never replays the single-use code. */
function stripCallbackQuery(): void {
  window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}`);
}

/** Exchanges the authorization code (PKCE) and returns to where the listener started. */
export function AuthCallbackView({ onDone }: { onDone: () => void }) {
  const { auth } = useAppServices();
  const navigate = useNavigate();
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!auth) {
      stripCallbackQuery();
      return;
    }
    let cancelled = false;
    const search = window.location.search;
    completeOnce(auth, search)
      .then(({ returnTo }) => {
        if (cancelled) return;
        stripCallbackQuery();
        // The routes live in the hash; return to the one the listener started from.
        navigate(returnTo.startsWith('/') ? returnTo : '/now-playing', { replace: true });
        onDone();
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        stripCallbackQuery();
        navigate('/now-playing', { replace: true });
        setError(reason instanceof Error ? reason : new Error('Authorization failed.'));
      });
    return () => {
      cancelled = true;
    };
  }, [auth, navigate, onDone]);

  const cancelled = error instanceof SpotifyAuthError && error.kind === 'access-denied';

  return (
    <MinimalShell>
      <div className="state-page" data-tone={error && !cancelled ? 'alert' : 'neutral'}>
        <div className="label">Spotify authorization</div>
        {!auth || error ? (
          <>
            <h1>{!auth ? 'Spotify isn’t configured' : cancelled ? 'Authorization was cancelled' : 'Authorization failed'}</h1>
            <p>
              {!auth
                ? 'Set VITE_SPOTIFY_CLIENT_ID at build time before connecting.'
                : cancelled
                  ? 'Nothing was shared with ARC Music.'
                  : error?.message}
            </p>
            <div className="state-actions">
              <button type="button" className="plain-action primary" onClick={onDone}>
                Back to ARC Music
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Connecting…</h1>
            <p role="status">Completing Spotify authorization.</p>
          </>
        )}
      </div>
    </MinimalShell>
  );
}
