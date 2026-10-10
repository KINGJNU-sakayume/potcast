import { describe, expect, it, vi } from 'vitest';
import { SpotifyClient, type AccessTokenSource } from './client';
import * as api from './endpoints';
import { SpotifyApiError, classifyStatus, parseRetryAfter } from './errors';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function tokens(overrides: Partial<AccessTokenSource> = {}): AccessTokenSource {
  return {
    getAccessToken: vi.fn(async () => 'token-1'),
    refreshAfterUnauthorized: vi.fn(async () => 'token-2'),
    ...overrides,
  };
}

describe('SpotifyClient', () => {
  it('sends the bearer token and encodes query parameters', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const client = new SpotifyClient(tokens(), { fetch: fetchMock });
    await api.search(client, { q: 'igor tyler', types: ['track', 'album'], limit: 50, offset: 0 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v1/search');
    expect(parsed.searchParams.get('q')).toBe('igor tyler');
    expect(parsed.searchParams.get('type')).toBe('track,album');
    // Development Mode search limit (February 2026 schema): max 10.
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('refreshes once after a 401 and retries with the new token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { status: 401, message: 'expired' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ id: 'me' }));
    const source = tokens();
    const client = new SpotifyClient(source, { fetch: fetchMock });
    await expect(client.get('/me')).resolves.toEqual({ id: 'me' });
    expect(source.refreshAfterUnauthorized).toHaveBeenCalledTimes(1);
    const retried = fetchMock.mock.calls[1]![1] as RequestInit;
    expect((retried.headers as Record<string, string>).Authorization).toBe('Bearer token-2');
  });

  it('surfaces unauthorized when refreshing is impossible', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { status: 401, message: 'revoked' } }, 401));
    const client = new SpotifyClient(tokens({ refreshAfterUnauthorized: vi.fn(async () => null) }), { fetch: fetchMock });
    await expect(client.get('/me')).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
  });

  it('waits out Retry-After for reads and retries', async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { status: 429, message: 'slow down' } }, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    const client = new SpotifyClient(tokens(), { fetch: fetchMock, sleep });
    await expect(client.get('/me/albums')).resolves.toEqual({ items: [] });
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
  });

  it('does not retry rate-limited commands, so no change is claimed', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { status: 429, message: 'slow' } }, 429, { 'Retry-After': '30' }));
    const client = new SpotifyClient(tokens(), { fetch: fetchMock });
    const error = await api.pausePlayback(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpotifyApiError);
    expect(error).toMatchObject({ kind: 'rate-limited', retryAfterMs: 30_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for 204 responses (no active playback)', async () => {
    const client = new SpotifyClient(tokens(), { fetch: vi.fn(async () => new Response(null, { status: 204 })) });
    await expect(api.getPlaybackState(client)).resolves.toBeNull();
  });

  it('maps network failures and player 404s to typed errors', async () => {
    const offline = new SpotifyClient(tokens(), {
      fetch: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    });
    await expect(offline.get('/me')).rejects.toMatchObject({ kind: 'network' });

    const noDevice = new SpotifyClient(tokens(), {
      fetch: vi.fn(async () => jsonResponse({ error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }, 404)),
    });
    await expect(api.skipToNext(noDevice)).rejects.toMatchObject({ kind: 'no-active-device', reason: 'NO_ACTIVE_DEVICE' });
  });

  it('uses the consolidated /me/library endpoints with a uris query (max 40)', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const client = new SpotifyClient(tokens(), { fetch: fetchMock });
    const uris = Array.from({ length: 45 }, (_, i) => `spotify:track:${i}`);
    await api.saveToLibrary(client, uris);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('PUT');
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v1/me/library');
    expect(parsed.searchParams.get('uris')!.split(',')).toHaveLength(40);
  });

  it('builds start-playback bodies from context and offset', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new SpotifyClient(tokens(), { fetch: fetchMock });
    await api.startPlayback(client, { deviceId: 'dev1', contextUri: 'spotify:album:a', offset: { uri: 'spotify:track:t' } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('device_id')).toBe('dev1');
    expect(JSON.parse(init.body as string)).toEqual({ context_uri: 'spotify:album:a', offset: { uri: 'spotify:track:t' } });
  });
});

describe('error helpers', () => {
  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
  });

  it('classifies player and catalogue statuses', () => {
    expect(classifyStatus(404, '/me/player/play')).toBe('no-active-device');
    expect(classifyStatus(404, '/albums/x')).toBe('not-found');
    expect(classifyStatus(403, '/me/player/pause', 'PREMIUM_REQUIRED')).toBe('premium-required');
    expect(classifyStatus(503, '/me')).toBe('server');
  });
});
