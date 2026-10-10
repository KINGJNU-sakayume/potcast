import { QueryClient } from '@tanstack/react-query';
import { SpotifyAuth } from '../auth/authService';
import { isSpotifyApiError } from '../spotify/errors';
import { REQUIRED_SCOPES } from '../spotify/scopes';
import type { AppConfig } from './config';

/** App-lifetime singletons, created once in main.tsx (outside React). */
export interface AppServices {
  config: AppConfig;
  /** Null when no Spotify client ID is configured. */
  auth: SpotifyAuth | null;
  queryClient: QueryClient;
}

/** Longest Retry-After waited out silently; longer waits surface the designed rate-limit state. */
const MAX_SILENT_RATE_LIMIT_MS = 15_000;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isSpotifyApiError(error)) return failureCount < 1;
  // The client already backed off twice; only keep waiting when Spotify said how long (and it is short).
  if (error.kind === 'rate-limited') {
    return error.retryAfterMs !== undefined && error.retryAfterMs <= MAX_SILENT_RATE_LIMIT_MS;
  }
  return error.kind === 'server' || error.kind === 'network';
}

function retryDelay(attempt: number, error: unknown): number {
  if (isSpotifyApiError(error) && error.retryAfterMs !== undefined) return Math.min(error.retryAfterMs, 30_000);
  return Math.min(1000 * 2 ** attempt, 8000);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export function createAppServices(config: AppConfig): AppServices {
  return {
    config,
    auth: config.spotifyClientId
      ? new SpotifyAuth({ clientId: config.spotifyClientId, redirectUri: config.redirectUri, scopes: REQUIRED_SCOPES })
      : null,
    queryClient: createQueryClient(),
  };
}
