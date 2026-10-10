import type { SpotifyClient } from './client';
import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyCursorPaging,
  SpotifyDevice,
  SpotifyFollowedArtists,
  SpotifyPaging,
  SpotifyPlayHistory,
  SpotifyPlaybackState,
  SpotifyPrivateUser,
  SpotifyQueue,
  SpotifySavedAlbum,
  SpotifySavedTrack,
  SpotifySearchResponse,
  SpotifySimplifiedAlbum,
  SpotifySimplifiedPlaylist,
  SpotifySimplifiedTrack,
} from './types';

/**
 * Request limits from the official OpenAPI schema (post February 2026).
 * Development Mode apps: search and artist albums are capped at 10 per page.
 */
export const LIMITS = {
  page: 50,
  search: 10,
  artistAlbums: 10,
  recentlyPlayed: 50,
  libraryUris: 40,
} as const;

function required<T>(value: T | null, endpoint: string): T {
  if (value === null) throw new Error(`Spotify returned an empty body for ${endpoint}`);
  return value;
}

/* ── Users ─────────────────────────────────────────────────────────────── */

export async function getCurrentUser(client: SpotifyClient, signal?: AbortSignal): Promise<SpotifyPrivateUser> {
  return required(await client.get<SpotifyPrivateUser>('/me', undefined, signal), '/me');
}

/* ── Library ───────────────────────────────────────────────────────────── */

export async function getRecentlyPlayed(
  client: SpotifyClient,
  limit: number = 30,
  signal?: AbortSignal,
): Promise<SpotifyCursorPaging<SpotifyPlayHistory>> {
  const result = await client.get<SpotifyCursorPaging<SpotifyPlayHistory>>(
    '/me/player/recently-played',
    { limit: Math.min(limit, LIMITS.recentlyPlayed) },
    signal,
  );
  return required(result, '/me/player/recently-played');
}

export async function getSavedAlbums(
  client: SpotifyClient,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<SpotifyPaging<SpotifySavedAlbum>> {
  const result = await client.get<SpotifyPaging<SpotifySavedAlbum>>(
    '/me/albums',
    { limit: Math.min(page.limit, LIMITS.page), offset: page.offset },
    signal,
  );
  return required(result, '/me/albums');
}

/** GET /me/tracks — Liked Songs, newest first. */
export async function getSavedTracks(
  client: SpotifyClient,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<SpotifyPaging<SpotifySavedTrack>> {
  const result = await client.get<SpotifyPaging<SpotifySavedTrack>>(
    '/me/tracks',
    { limit: Math.min(page.limit, LIMITS.page), offset: page.offset },
    signal,
  );
  return required(result, '/me/tracks');
}

/** GET /me/following?type=artist — cursor-paged by the last artist ID. */
export async function getFollowedArtists(
  client: SpotifyClient,
  params: { limit: number; after?: string | null },
  signal?: AbortSignal,
): Promise<SpotifyFollowedArtists> {
  const result = await client.get<SpotifyFollowedArtists>(
    '/me/following',
    { type: 'artist', limit: Math.min(params.limit, LIMITS.page), after: params.after ?? undefined },
    signal,
  );
  return required(result, '/me/following');
}

export async function getMyPlaylists(
  client: SpotifyClient,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<SpotifyPaging<SpotifySimplifiedPlaylist | null>> {
  const result = await client.get<SpotifyPaging<SpotifySimplifiedPlaylist | null>>(
    '/me/playlists',
    { limit: Math.min(page.limit, LIMITS.page), offset: page.offset },
    signal,
  );
  return required(result, '/me/playlists');
}

/** GET /me/library/contains — accepts up to 40 Spotify URIs of mixed types. */
export async function checkLibrary(client: SpotifyClient, uris: string[], signal?: AbortSignal): Promise<boolean[]> {
  if (uris.length === 0) return [];
  const result = await client.get<boolean[]>(
    '/me/library/contains',
    { uris: uris.slice(0, LIMITS.libraryUris).join(',') },
    signal,
  );
  return result ?? uris.map(() => false);
}

/** PUT /me/library — replaces the removed per-type save endpoints. */
export async function saveToLibrary(client: SpotifyClient, uris: string[]): Promise<void> {
  if (uris.length === 0) return;
  await client.put('/me/library', { query: { uris: uris.slice(0, LIMITS.libraryUris).join(',') } });
}

/** DELETE /me/library */
export async function removeFromLibrary(client: SpotifyClient, uris: string[]): Promise<void> {
  if (uris.length === 0) return;
  await client.delete('/me/library', { query: { uris: uris.slice(0, LIMITS.libraryUris).join(',') } });
}

/* ── Catalogue ─────────────────────────────────────────────────────────── */

export async function getAlbum(client: SpotifyClient, id: string, signal?: AbortSignal): Promise<SpotifyAlbum> {
  return required(await client.get<SpotifyAlbum>(`/albums/${encodeURIComponent(id)}`, undefined, signal), '/albums/{id}');
}

export async function getAlbumTracks(
  client: SpotifyClient,
  id: string,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<SpotifyPaging<SpotifySimplifiedTrack>> {
  const result = await client.get<SpotifyPaging<SpotifySimplifiedTrack>>(
    `/albums/${encodeURIComponent(id)}/tracks`,
    { limit: Math.min(page.limit, LIMITS.page), offset: page.offset },
    signal,
  );
  return required(result, '/albums/{id}/tracks');
}

export async function getArtist(client: SpotifyClient, id: string, signal?: AbortSignal): Promise<SpotifyArtist> {
  return required(await client.get<SpotifyArtist>(`/artists/${encodeURIComponent(id)}`, undefined, signal), '/artists/{id}');
}

export async function getArtistAlbums(
  client: SpotifyClient,
  id: string,
  params: { includeGroups: string; limit: number; offset: number },
  signal?: AbortSignal,
): Promise<SpotifyPaging<SpotifySimplifiedAlbum>> {
  const result = await client.get<SpotifyPaging<SpotifySimplifiedAlbum>>(
    `/artists/${encodeURIComponent(id)}/albums`,
    { include_groups: params.includeGroups, limit: Math.min(params.limit, LIMITS.artistAlbums), offset: params.offset },
    signal,
  );
  return required(result, '/artists/{id}/albums');
}

export async function search(
  client: SpotifyClient,
  params: { q: string; types: string[]; limit: number; offset: number },
  signal?: AbortSignal,
): Promise<SpotifySearchResponse> {
  const result = await client.get<SpotifySearchResponse>(
    '/search',
    {
      q: params.q,
      type: params.types.join(','),
      limit: Math.min(params.limit, LIMITS.search),
      offset: params.offset,
    },
    signal,
  );
  return result ?? {};
}

/* ── Player ────────────────────────────────────────────────────────────── */

/** GET /me/player — 204 (null) means no playback is available or active. */
export function getPlaybackState(client: SpotifyClient, signal?: AbortSignal): Promise<SpotifyPlaybackState | null> {
  return client.get<SpotifyPlaybackState>('/me/player', undefined, signal);
}

export async function getDevices(client: SpotifyClient, signal?: AbortSignal): Promise<SpotifyDevice[]> {
  const result = await client.get<{ devices: SpotifyDevice[] }>('/me/player/devices', undefined, signal);
  return result?.devices ?? [];
}

export async function getQueue(client: SpotifyClient, signal?: AbortSignal): Promise<SpotifyQueue> {
  const result = await client.get<SpotifyQueue>('/me/player/queue', undefined, signal);
  return result ?? { currently_playing: null, queue: [] };
}

export async function transferPlayback(client: SpotifyClient, deviceId: string, play: boolean): Promise<void> {
  await client.put('/me/player', { body: { device_ids: [deviceId], play } });
}

export interface StartPlaybackParams {
  deviceId?: string;
  contextUri?: string;
  uris?: string[];
  offset?: { uri: string } | { position: number };
  positionMs?: number;
}

export async function startPlayback(client: SpotifyClient, params: StartPlaybackParams): Promise<void> {
  const body: Record<string, unknown> = {};
  if (params.contextUri) body.context_uri = params.contextUri;
  if (params.uris) body.uris = params.uris;
  if (params.offset) body.offset = params.offset;
  if (params.positionMs !== undefined) body.position_ms = Math.max(0, Math.round(params.positionMs));
  await client.put('/me/player/play', {
    query: { device_id: params.deviceId },
    body: Object.keys(body).length > 0 ? body : undefined,
  });
}

export async function pausePlayback(client: SpotifyClient, deviceId?: string): Promise<void> {
  await client.put('/me/player/pause', { query: { device_id: deviceId } });
}

export async function skipToNext(client: SpotifyClient, deviceId?: string): Promise<void> {
  await client.post('/me/player/next', { query: { device_id: deviceId } });
}

export async function skipToPrevious(client: SpotifyClient, deviceId?: string): Promise<void> {
  await client.post('/me/player/previous', { query: { device_id: deviceId } });
}

export async function setShuffle(client: SpotifyClient, state: boolean, deviceId?: string): Promise<void> {
  await client.put('/me/player/shuffle', { query: { state, device_id: deviceId } });
}

export async function seekTo(client: SpotifyClient, positionMs: number, deviceId?: string): Promise<void> {
  await client.put('/me/player/seek', {
    query: { position_ms: Math.max(0, Math.round(positionMs)), device_id: deviceId },
  });
}

export async function setVolume(client: SpotifyClient, volumePercent: number, deviceId?: string): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(volumePercent)));
  await client.put('/me/player/volume', { query: { volume_percent: clamped, device_id: deviceId } });
}
