import { describe, expect, it, vi } from 'vitest';
import { SpotifyAuth, SpotifyAuthError } from './authService';
import { base64UrlEncode, createCodeChallenge, generateCodeVerifier, randomString } from './pkce';
import { createMemoryStores, type StoredTokens } from './tokenStore';

describe('PKCE', () => {
  it('matches the RFC 7636 appendix B test vector', async () => {
    await expect(createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('generates verifiers from the unreserved character set only', () => {
    const verifier = generateCodeVerifier(128);
    expect(verifier).toHaveLength(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(() => generateCodeVerifier(42)).toThrow(RangeError);
  });

  it('rejects biased bytes instead of wrapping them', () => {
    // 66-character charset: bytes >= 198 must be skipped.
    const bytes = [255, 200, 198, 0, 1];
    const value = randomString(2, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~', () => new Uint8Array(bytes));
    expect(value).toBe('AB');
  });

  it('base64url-encodes without padding', () => {
    expect(base64UrlEncode(new Uint8Array([251, 255]))).toBe('-_8');
  });
});

const SCOPES = ['streaming', 'user-read-playback-state'];

function tokenResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup(initial: StoredTokens | null = null, fetchImpl = vi.fn<typeof fetch>()) {
  let now = 1_000_000;
  const stores = createMemoryStores(initial);
  const navigate = vi.fn();
  const auth = new SpotifyAuth({
    clientId: 'client-123',
    redirectUri: 'http://127.0.0.1:5173/',
    scopes: SCOPES,
    tokenStore: stores.tokens,
    pendingStore: stores.pending,
    fetch: fetchImpl,
    now: () => now,
    navigate,
    locks: null,
  });
  return { auth, stores, navigate, fetchImpl, advance: (ms: number) => (now += ms) };
}

describe('SpotifyAuth (Authorization Code with PKCE)', () => {
  it('redirects to Spotify with S256 PKCE parameters and no client secret', async () => {
    const { auth, navigate } = setup();
    await auth.beginLogin('/album/abc');
    const url = new URL(navigate.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(url.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(url.searchParams.has('client_secret')).toBe(false);
  });

  it('exchanges the code, stores tokens and returns to the original page', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      tokenResponse({ access_token: 'A1', token_type: 'Bearer', scope: 'streaming', expires_in: 3600, refresh_token: 'R1' }),
    );
    const { auth, navigate, stores } = setup(null, fetchImpl);
    await auth.beginLogin('/album/abc');
    const state = new URL(navigate.mock.calls[0]![0] as string).searchParams.get('state');
    await expect(auth.completeLogin(`?code=xyz&state=${state}`)).resolves.toEqual({ returnTo: '/album/abc' });

    const body = new URLSearchParams(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    expect(stores.tokens.load()).toMatchObject({ accessToken: 'A1', refreshToken: 'R1', scopes: ['streaming'] });
    expect(auth.getSnapshot()).toEqual({ status: 'signed-in', scopes: ['streaming'], missingScopes: ['user-read-playback-state'] });
  });

  it('rejects mismatched state and cancelled authorizations', async () => {
    const { auth } = setup();
    await auth.beginLogin();
    await expect(auth.completeLogin('?code=xyz&state=forged')).rejects.toMatchObject({ kind: 'state-mismatch' });
    await expect(auth.completeLogin('?error=access_denied&state=x')).rejects.toMatchObject({ kind: 'access-denied' });
  });

  it('refreshes shortly before expiry and keeps the old refresh token when none is returned', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      tokenResponse({ access_token: 'A2', token_type: 'Bearer', scope: 'streaming', expires_in: 3600 }),
    );
    const { auth, stores, advance } = setup(
      { accessToken: 'A1', expiresAt: 1_000_000 + 3_600_000, refreshToken: 'R1', scopes: ['streaming'] },
      fetchImpl,
    );
    await expect(auth.getAccessToken()).resolves.toBe('A1');
    expect(fetchImpl).not.toHaveBeenCalled();
    advance(3_600_000 - 30_000);
    await expect(auth.getAccessToken()).resolves.toBe('A2');
    expect(new URLSearchParams(fetchImpl.mock.calls[0]![1]!.body as string).get('grant_type')).toBe('refresh_token');
    expect(stores.tokens.load()?.refreshToken).toBe('R1');
  });

  it('deduplicates concurrent refreshes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      tokenResponse({ access_token: 'A2', token_type: 'Bearer', scope: 'streaming', expires_in: 3600, refresh_token: 'R2' }),
    );
    const { auth } = setup({ accessToken: 'A1', expiresAt: 0, refreshToken: 'R1', scopes: [] }, fetchImpl);
    const results = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.refreshAfterUnauthorized()]);
    expect(results).toEqual(['A2', 'A2', 'A2']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('moves to an "expired" state when the refresh token is revoked', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      tokenResponse({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400),
    );
    const { auth, stores } = setup({ accessToken: 'A1', expiresAt: 0, refreshToken: 'R1', scopes: [] }, fetchImpl);
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(SpotifyAuthError);
    expect(auth.getSnapshot().status).toBe('expired');
    expect(stores.tokens.load()).toBeNull();
  });

  it('logs out by clearing stored tokens', () => {
    const { auth, stores } = setup({ accessToken: 'A1', expiresAt: 9e15, refreshToken: 'R1', scopes: [] });
    auth.logout();
    expect(stores.tokens.load()).toBeNull();
    expect(auth.getSnapshot()).toEqual({ status: 'signed-out' });
  });
});
