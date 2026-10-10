export type SpotifyErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'premium-required'
  | 'not-found'
  | 'no-active-device'
  | 'rate-limited'
  | 'bad-request'
  | 'server'
  | 'network'
  | 'unknown';

export interface SpotifyApiErrorInit {
  kind: SpotifyErrorKind;
  status: number;
  message: string;
  endpoint: string;
  reason?: string;
  retryAfterMs?: number;
}

/** Normalised error for every Spotify Web API failure. */
export class SpotifyApiError extends Error {
  readonly kind: SpotifyErrorKind;
  readonly status: number;
  readonly endpoint: string;
  readonly reason: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(init: SpotifyApiErrorInit) {
    super(init.message);
    this.name = 'SpotifyApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.endpoint = init.endpoint;
    this.reason = init.reason;
    this.retryAfterMs = init.retryAfterMs;
  }
}

/** `reason` used by the offline preview for IDs outside its sample catalogue. */
export const NOT_IN_PREVIEW = 'NOT_IN_PREVIEW';

export function isSpotifyApiError(error: unknown): error is SpotifyApiError {
  return error instanceof SpotifyApiError;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * Classifies an HTTP failure. Player endpoints respond 404 when no device is
 * active and 403 for accounts without Premium; the optional `reason` field
 * (e.g. NO_ACTIVE_DEVICE, PREMIUM_REQUIRED) refines this when present.
 */
export function classifyStatus(status: number, endpoint: string, reason?: string): SpotifyErrorKind {
  const isPlayer = endpoint.startsWith('/me/player');
  if (reason === 'NO_ACTIVE_DEVICE') return 'no-active-device';
  if (reason === 'PREMIUM_REQUIRED') return 'premium-required';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return isPlayer ? 'no-active-device' : 'not-found';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  if (status >= 400) return 'bad-request';
  return 'unknown';
}

/** Short, human-readable description used by designed error states. */
export function describeSpotifyError(error: unknown): { title: string; body: string } {
  if (!isSpotifyApiError(error)) {
    return { title: 'Something went wrong', body: 'The request could not be completed. Try again in a moment.' };
  }
  switch (error.kind) {
    case 'rate-limited': {
      const seconds = error.retryAfterMs ? Math.ceil(error.retryAfterMs / 1000) : null;
      return {
        title: 'Spotify is rate limiting requests',
        body: seconds
          ? `Too many requests were sent in a short time. Spotify asked us to wait ${seconds} s.`
          : 'Too many requests were sent in a short time. Try again shortly.',
      };
    }
    case 'unauthorized':
      return { title: 'Authorization expired', body: 'Reconnect Spotify to continue.' };
    case 'premium-required':
      return { title: 'Spotify Premium required', body: 'Playback control requires a Spotify Premium account.' };
    case 'forbidden':
      return {
        title: 'Spotify refused the request',
        body: 'This content or action is not available to this app or account.',
      };
    case 'not-found':
      return error.reason === NOT_IN_PREVIEW
        ? { title: 'Not in the preview catalogue', body: error.message }
        : { title: 'Not found', body: 'Spotify has no item with this ID in your market.' };
    case 'no-active-device':
      return { title: 'No playback device', body: 'Start Spotify on a device, or play in this browser.' };
    case 'network':
      return { title: 'Spotify is unreachable', body: 'Check your connection. The app will retry automatically.' };
    case 'server':
      return { title: 'Spotify is having trouble', body: 'Spotify returned a server error. Try again shortly.' };
    default:
      return { title: 'Spotify request failed', body: error.message || 'Try again in a moment.' };
  }
}
