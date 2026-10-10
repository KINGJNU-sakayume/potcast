/**
 * Every scope requested at authorization, with the feature that needs it.
 * Keep this list minimal: remove a scope together with the feature using it.
 * Scope requirements follow the official Web API OpenAPI schema and the
 * Web Playback SDK requirements (streaming + user-read-email + user-read-private).
 */
export const SPOTIFY_SCOPES = [
  { scope: 'streaming', reason: 'Play audio in this browser (Web Playback SDK)' },
  { scope: 'user-read-email', reason: 'Required by the Web Playback SDK' },
  { scope: 'user-read-private', reason: 'Required by the Web Playback SDK' },
  { scope: 'user-read-playback-state', reason: 'Read playback state, devices and the queue' },
  { scope: 'user-modify-playback-state', reason: 'Play, pause, skip, seek, volume and device transfer' },
  { scope: 'user-read-currently-playing', reason: 'Read the playback queue' },
  { scope: 'user-read-recently-played', reason: 'Library — recently played' },
  { scope: 'user-library-read', reason: 'Library — liked songs and saved albums; liked state of the current track' },
  { scope: 'user-follow-read', reason: 'Library — artists you follow' },
  { scope: 'user-library-modify', reason: 'Like / unlike the current track, save albums' },
  { scope: 'playlist-read-private', reason: 'Library — your private playlists' },
  { scope: 'playlist-read-collaborative', reason: 'Library — collaborative playlists you belong to' },
] as const;

export type SpotifyScope = (typeof SPOTIFY_SCOPES)[number]['scope'];

export const REQUIRED_SCOPES: readonly SpotifyScope[] = SPOTIFY_SCOPES.map((s) => s.scope);
