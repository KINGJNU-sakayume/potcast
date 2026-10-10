import type { SpotifyErrorBody } from './types';
import { SpotifyApiError, classifyStatus, isAbortError, parseRetryAfter } from './errors';

export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

/** Supplies bearer tokens; implemented by the auth module. */
export interface AccessTokenSource {
  getAccessToken(): Promise<string>;
  /** Called once after a 401. Resolves a fresh token, or null when re-authorization is required. */
  refreshAfterUnauthorized(): Promise<string | null>;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface SpotifyClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Longest Retry-After the client will wait out transparently for GET requests. */
  maxRateLimitWaitMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE';

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export function buildUrl(base: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(base.replace(/\/$/, '') + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function toApiError(response: Response, endpoint: string): Promise<SpotifyApiError> {
  let message = response.statusText || `HTTP ${response.status}`;
  let reason: string | undefined;
  try {
    const body = (await response.json()) as SpotifyErrorBody;
    if (typeof body.error === 'object' && body.error) {
      message = body.error.message || message;
      reason = body.error.reason;
    } else if (typeof body.error === 'string') {
      message = body.error_description || body.error;
    }
  } catch {
    /* body is not JSON */
  }
  return new SpotifyApiError({
    kind: classifyStatus(response.status, endpoint, reason),
    status: response.status,
    message,
    endpoint,
    reason,
    retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
  });
}

/**
 * The only place that talks HTTP to the Spotify Web API. UI components never
 * call fetch directly; they go through endpoints.ts via the catalogue source
 * or the playback engine.
 */
export class SpotifyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRateLimitWaitMs: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(
    private readonly tokens: AccessTokenSource,
    options: SpotifyClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? SPOTIFY_API_BASE;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.maxRateLimitWaitMs = options.maxRateLimitWaitMs ?? 8000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  get<T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal): Promise<T | null> {
    return this.request<T>('GET', path, { query, signal });
  }

  put<T = null>(path: string, options: RequestOptions = {}): Promise<T | null> {
    return this.request<T>('PUT', path, options);
  }

  post<T = null>(path: string, options: RequestOptions = {}): Promise<T | null> {
    return this.request<T>('POST', path, options);
  }

  delete<T = null>(path: string, options: RequestOptions = {}): Promise<T | null> {
    return this.request<T>('DELETE', path, options);
  }

  async request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T | null> {
    const url = buildUrl(this.baseUrl, path, options.query);
    let token = await this.tokens.getAccessToken();
    let refreshed = false;
    let rateLimitAttempts = 0;

    for (;;) {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      let body: string | undefined;
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }

      let response: Response;
      try {
        response = await this.fetchImpl(url, { method, headers, body, signal: options.signal });
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new SpotifyApiError({
          kind: 'network',
          status: 0,
          message: error instanceof Error ? error.message : 'Network request failed',
          endpoint: path,
        });
      }

      if (response.status === 401 && !refreshed) {
        refreshed = true;
        const next = await this.tokens.refreshAfterUnauthorized();
        if (next) {
          token = next;
          continue;
        }
      }

      // Only idempotent reads are retried transparently; commands surface the
      // rate limit so the UI never claims a change that may not have happened.
      if (response.status === 429 && method === 'GET' && rateLimitAttempts < 2) {
        const wait = parseRetryAfter(response.headers.get('Retry-After')) ?? 1000 * 2 ** rateLimitAttempts;
        if (wait <= this.maxRateLimitWaitMs) {
          rateLimitAttempts += 1;
          await this.sleep(wait, options.signal);
          continue;
        }
      }

      if (!response.ok) throw await toApiError(response, path);
      if (response.status === 204) return null;

      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text) as T;
      } catch {
        if (method === 'GET') {
          throw new SpotifyApiError({ kind: 'unknown', status: response.status, message: 'Invalid JSON', endpoint: path });
        }
        return null;
      }
    }
  }
}
