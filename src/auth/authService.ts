import type { AccessTokenSource } from '../spotify/client';
import type { SpotifyTokenResponse } from '../spotify/types';
import { createCodeChallenge, generateCodeVerifier, generateState } from './pkce';
import {
  localTokenStore,
  sessionPendingStore,
  type PendingStore,
  type StoredTokens,
  type TokenStore,
} from './tokenStore';

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

/** Refresh this long before expiry so in-flight requests never carry a dead token. */
const EXPIRY_MARGIN_MS = 60_000;
const PENDING_MAX_AGE_MS = 15 * 60_000;

export type AuthState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; scopes: string[]; missingScopes: string[] }
  | { status: 'expired'; message: string };

export type AuthErrorKind =
  | 'access-denied'
  | 'state-mismatch'
  | 'missing-code'
  | 'exchange-failed'
  | 'refresh-rejected'
  | 'network'
  | 'signed-out';

export class SpotifyAuthError extends Error {
  constructor(
    readonly kind: AuthErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SpotifyAuthError';
  }
}

export interface SpotifyAuthOptions {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  tokenStore?: TokenStore;
  pendingStore?: PendingStore;
  fetch?: typeof fetch;
  now?: () => number;
  navigate?: (url: string) => void;
  /** Web Locks keep concurrent tabs from racing to rotate the refresh token. */
  locks?: Pick<LockManager, 'request'> | null;
}

/**
 * Authorization Code with PKCE for a browser-only SPA. No client secret is
 * used. Tokens are refreshed proactively before expiry, once after a 401, and
 * never concurrently (in-tab promise dedupe + cross-tab Web Lock).
 */
export class SpotifyAuth implements AccessTokenSource {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly scopes: readonly string[];
  private readonly tokenStore: TokenStore;
  private readonly pendingStore: PendingStore;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly navigate: (url: string) => void;
  private readonly locks: Pick<LockManager, 'request'> | null;

  private tokens: StoredTokens | null;
  private state: AuthState = { status: 'signed-out' };
  private refreshing: Promise<string> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeStorage: () => void;

  constructor(options: SpotifyAuthOptions) {
    this.clientId = options.clientId;
    this.redirectUri = options.redirectUri;
    this.scopes = options.scopes;
    this.tokenStore = options.tokenStore ?? localTokenStore;
    this.pendingStore = options.pendingStore ?? sessionPendingStore;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.now = options.now ?? Date.now;
    this.navigate = options.navigate ?? ((url) => window.location.assign(url));
    this.locks =
      options.locks !== undefined ? options.locks : typeof navigator !== 'undefined' ? (navigator.locks ?? null) : null;

    this.tokens = this.tokenStore.load();
    this.state = this.deriveState();
    this.unsubscribeStorage = this.tokenStore.onExternalChange(() => this.adoptStoredTokens());
  }

  /* ── useSyncExternalStore contract ───────────────────────────────────── */

  getSnapshot = (): AuthState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispose(): void {
    this.unsubscribeStorage();
    this.listeners.clear();
  }

  /* ── Authorization round trip ────────────────────────────────────────── */

  buildAuthorizeUrl(params: { codeChallenge: string; state: string }): string {
    const url = new URL(SPOTIFY_AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: this.scopes.join(' '),
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: params.codeChallenge,
      state: params.state,
    }).toString();
    return url.toString();
  }

  async beginLogin(returnTo = '/'): Promise<void> {
    const verifier = generateCodeVerifier();
    const state = generateState();
    const codeChallenge = await createCodeChallenge(verifier);
    this.pendingStore.save({ verifier, state, redirectUri: this.redirectUri, returnTo, createdAt: this.now() });
    this.navigate(this.buildAuthorizeUrl({ codeChallenge, state }));
  }

  /** Completes the callback. `search` is the callback URL's query string. */
  async completeLogin(search: string): Promise<{ returnTo: string }> {
    const params = new URLSearchParams(search);
    const pending = this.pendingStore.take();
    const error = params.get('error');

    if (error) {
      throw new SpotifyAuthError(
        error === 'access_denied' ? 'access-denied' : 'exchange-failed',
        error === 'access_denied' ? 'Authorization was cancelled.' : `Spotify returned “${error}”.`,
      );
    }
    const code = params.get('code');
    if (!code) throw new SpotifyAuthError('missing-code', 'The callback did not include an authorization code.');
    if (!pending || pending.state !== params.get('state') || this.now() - pending.createdAt > PENDING_MAX_AGE_MS) {
      throw new SpotifyAuthError('state-mismatch', 'The authorization response did not match a pending request.');
    }

    const response = await this.postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: this.clientId,
      code_verifier: pending.verifier,
    });
    this.storeTokens(response, null);
    return { returnTo: pending.returnTo || '/' };
  }

  logout(): void {
    this.tokens = null;
    this.tokenStore.clear();
    this.setState({ status: 'signed-out' });
  }

  /* ── Tokens ──────────────────────────────────────────────────────────── */

  async getAccessToken(): Promise<string> {
    const tokens = this.tokens;
    if (!tokens) throw new SpotifyAuthError('signed-out', 'Not connected to Spotify.');
    if (tokens.expiresAt - EXPIRY_MARGIN_MS > this.now()) return tokens.accessToken;
    return this.refresh(false);
  }

  async refreshAfterUnauthorized(): Promise<string | null> {
    try {
      return await this.refresh(true);
    } catch {
      return null;
    }
  }

  private refresh(force: boolean): Promise<string> {
    if (this.refreshing) return this.refreshing;
    const staleAccessToken = this.tokens?.accessToken ?? null;
    const run = async (): Promise<string> => {
      // Another tab may have rotated the tokens while we waited for the lock.
      const stored = this.tokenStore.load();
      if (stored && stored.accessToken !== staleAccessToken && stored.expiresAt - EXPIRY_MARGIN_MS > this.now()) {
        this.tokens = stored;
        this.setState(this.deriveState());
        return stored.accessToken;
      }
      const current = stored ?? this.tokens;
      if (!current?.refreshToken) {
        this.expire('Spotify authorization expired. Reconnect to continue.');
        throw new SpotifyAuthError('refresh-rejected', 'No refresh token available.');
      }
      if (!force && current.expiresAt - EXPIRY_MARGIN_MS > this.now()) {
        this.tokens = current;
        return current.accessToken;
      }
      const response = await this.postToken({
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
        client_id: this.clientId,
      });
      return this.storeTokens(response, current.refreshToken).accessToken;
    };

    const locked = this.locks ? this.locks.request('arc-spotify-token-refresh', run) : run();
    this.refreshing = Promise.resolve(locked).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async postToken(body: Record<string, string>): Promise<SpotifyTokenResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      });
    } catch {
      throw new SpotifyAuthError('network', 'Could not reach Spotify accounts service.');
    }

    if (!response.ok) {
      let code = '';
      let description = '';
      try {
        const payload = (await response.json()) as { error?: string; error_description?: string };
        code = payload.error ?? '';
        description = payload.error_description ?? '';
      } catch {
        /* not JSON */
      }
      if (body.grant_type === 'refresh_token' && (code === 'invalid_grant' || response.status === 400)) {
        this.expire('Spotify authorization expired or was revoked. Reconnect to continue.');
        throw new SpotifyAuthError('refresh-rejected', description || 'Refresh token rejected.');
      }
      throw new SpotifyAuthError('exchange-failed', description || code || `Token request failed (${response.status}).`);
    }
    return (await response.json()) as SpotifyTokenResponse;
  }

  private storeTokens(response: SpotifyTokenResponse, previousRefreshToken: string | null): StoredTokens {
    const tokens: StoredTokens = {
      accessToken: response.access_token,
      expiresAt: this.now() + response.expires_in * 1000,
      // Spotify may or may not rotate the refresh token; keep the old one if absent.
      refreshToken: response.refresh_token ?? previousRefreshToken,
      scopes: (response.scope ?? '').split(/\s+/).filter(Boolean),
    };
    this.tokens = tokens;
    this.tokenStore.save(tokens);
    this.setState(this.deriveState());
    return tokens;
  }

  private expire(message: string): void {
    this.tokens = null;
    this.tokenStore.clear();
    this.setState({ status: 'expired', message });
  }

  private adoptStoredTokens(): void {
    const stored = this.tokenStore.load();
    this.tokens = stored;
    this.setState(this.deriveState());
  }

  private deriveState(): AuthState {
    if (!this.tokens) {
      return this.state.status === 'expired' ? this.state : { status: 'signed-out' };
    }
    const granted = new Set(this.tokens.scopes);
    return {
      status: 'signed-in',
      scopes: this.tokens.scopes,
      missingScopes: this.scopes.filter((scope) => !granted.has(scope)),
    };
  }

  private setState(next: AuthState): void {
    if (JSON.stringify(this.state) === JSON.stringify(next)) return;
    this.state = next;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
