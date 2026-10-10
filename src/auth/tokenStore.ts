import { readJson, removeKey, writeJson } from '../lib/storage';

/**
 * Persistence for the Spotify session.
 *
 * - The PKCE verifier + state live in sessionStorage only for the duration of
 *   one authorization round trip.
 * - The token set lives in localStorage so a browser refresh restores the
 *   session. There is no client secret anywhere in the app. "Disconnect"
 *   clears everything.
 */

export const SESSION_KEY = 'arc.spotify.session.v1';
export const PENDING_KEY = 'arc.spotify.pkce.v1';

/** Keys written by the first ARC v7 build (tokens without scopes); superseded by SESSION_KEY. */
const LEGACY_KEYS = [
  ['arc.spotify.token.v1', 'local'],
  ['arc.spotify.pkce.verifier', 'session'],
  ['arc.spotify.pkce.state', 'session'],
] as const;

/** Drops tokens stored by the earlier build so no credential lingers unused. */
export function clearLegacySession(): void {
  for (const [key, kind] of LEGACY_KEYS) removeKey(key, kind);
}

export interface StoredTokens {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  refreshToken: string | null;
  scopes: string[];
}

export interface PendingAuthorization {
  verifier: string;
  state: string;
  redirectUri: string;
  returnTo: string;
  createdAt: number;
}

function isStoredTokens(value: unknown): value is StoredTokens {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.expiresAt === 'number' &&
    (typeof v.refreshToken === 'string' || v.refreshToken === null) &&
    Array.isArray(v.scopes)
  );
}

export interface TokenStore {
  load(): StoredTokens | null;
  save(tokens: StoredTokens): void;
  clear(): void;
  /** Fires when another tab changes the stored session. */
  onExternalChange(listener: () => void): () => void;
}

export const localTokenStore: TokenStore = {
  load() {
    const value = readJson<unknown>(SESSION_KEY);
    return isStoredTokens(value) ? value : null;
  },
  save(tokens) {
    writeJson(SESSION_KEY, tokens);
  },
  clear() {
    removeKey(SESSION_KEY);
  },
  onExternalChange(listener) {
    if (typeof window === 'undefined') return () => undefined;
    const handler = (event: StorageEvent) => {
      if (event.key === SESSION_KEY || event.key === null) listener();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
};

export interface PendingStore {
  save(pending: PendingAuthorization): void;
  take(): PendingAuthorization | null;
}

export const sessionPendingStore: PendingStore = {
  save(pending) {
    writeJson(PENDING_KEY, pending, 'session');
  },
  take() {
    const value = readJson<PendingAuthorization>(PENDING_KEY, 'session');
    removeKey(PENDING_KEY, 'session');
    return value && typeof value.verifier === 'string' && typeof value.state === 'string' ? value : null;
  },
};

/** In-memory stores for tests. */
export function createMemoryStores(initial: StoredTokens | null = null): { tokens: TokenStore; pending: PendingStore } {
  let tokens = initial;
  let pending: PendingAuthorization | null = null;
  return {
    tokens: {
      load: () => tokens,
      save: (next) => {
        tokens = next;
      },
      clear: () => {
        tokens = null;
      },
      onExternalChange: () => () => undefined,
    },
    pending: {
      save: (next) => {
        pending = next;
      },
      take: () => {
        const value = pending;
        pending = null;
        return value;
      },
    },
  };
}
