import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { PENDING_KEY, SESSION_KEY } from '../auth/tokenStore';
import { REQUIRED_SCOPES } from '../spotify/scopes';
import { readConfig } from './config';
import { createAppServices } from './services';

const emptyPage = { items: [], offset: 0, limit: 20, total: 0, next: null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A stand-in for accounts.spotify.com and the Web API. */
function spotifyFetch(input: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.host === 'accounts.spotify.com') {
    return Promise.resolve(
      json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'refresh', scope: REQUIRED_SCOPES.join(' ') }),
    );
  }
  if (url.pathname === '/v1/me') return Promise.resolve(json({ id: 'listener', display_name: 'Wo Jin', uri: 'spotify:user:listener' }));
  if (url.pathname === '/v1/me/player') return Promise.resolve(new Response(null, { status: 204 }));
  if (url.pathname === '/v1/me/following') return Promise.resolve(json({ artists: { items: [], total: 0, next: null, cursors: {} } }));
  if (url.pathname === '/v1/me/player/recently-played') return Promise.resolve(json({ items: [], next: null, cursors: null }));
  return Promise.resolve(json(emptyPage));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Spotify authorization callback', () => {
  it('completes PKCE at the root redirect URI and returns to the hash route the listener started from', async () => {
    const fetchMock = vi.fn(spotifyFetch);
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ verifier: 'v'.repeat(64), state: 'expected-state', redirectUri: 'http://localhost:3000/', returnTo: '/library', createdAt: Date.now() }),
    );
    window.history.replaceState({}, '', '/?code=auth-code&state=expected-state');

    const services = createAppServices(readConfig({ BASE_URL: '/', VITE_SPOTIFY_CLIENT_ID: 'client' }, 'http://localhost:3000'));
    render(<App services={services} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Your Spotify library')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/library'));
    expect(window.location.search).toBe('');

    const tokenCall = fetchMock.mock.calls.find(([input]) => String(input).startsWith('https://accounts.spotify.com/api/token'));
    const body = new URLSearchParams(String(tokenCall?.[1]?.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('redirect_uri')).toBe('http://localhost:3000/');
    expect(body.get('code_verifier')).toBe('v'.repeat(64));
    expect(body.has('client_secret')).toBe(false);
    expect(window.localStorage.getItem(SESSION_KEY)).toContain('access');
    await waitFor(() => expect(screen.getByLabelText('Signed in as Wo Jin')).toHaveTextContent('WJ'));
  });

  it('rejects a callback whose state does not match', async () => {
    vi.stubGlobal('fetch', vi.fn(spotifyFetch));
    window.sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ verifier: 'v'.repeat(64), state: 'expected-state', redirectUri: 'http://localhost:3000/', returnTo: '/library', createdAt: Date.now() }),
    );
    window.history.replaceState({}, '', '/?code=auth-code&state=forged');

    const services = createAppServices(readConfig({ BASE_URL: '/', VITE_SPOTIFY_CLIENT_ID: 'client' }, 'http://localhost:3000'));
    render(<App services={services} />);

    expect(await screen.findByRole('heading', { name: 'Authorization failed' })).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
