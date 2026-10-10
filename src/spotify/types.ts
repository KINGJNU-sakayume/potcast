/**
 * Spotify Web API transport models — a subset of the official OpenAPI schema
 * (https://developer.spotify.com/reference/web-api/open-api-schema.yaml),
 * including the February 2026 Development Mode changes:
 *  - playlist `tracks` → `items`, playlist item `track` → `item`
 *  - artist `followers` / `genres` / `popularity`, album `label` / `popularity`,
 *    track `popularity` / `external_ids` are deprecated and may be absent.
 * Fields that are deprecated or may be omitted are typed as optional.
 * These types must not leak into UI components; see mappers.ts.
 */

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyExternalUrls {
  spotify?: string;
}

export interface SpotifySimplifiedArtist {
  id: string;
  name: string;
  uri: string;
  type: 'artist';
  href?: string;
  external_urls?: SpotifyExternalUrls;
}

export interface SpotifyArtist extends SpotifySimplifiedArtist {
  images?: SpotifyImage[];
  /** @deprecated Development Mode */
  genres?: string[];
  /** @deprecated Development Mode */
  followers?: { href: string | null; total: number };
  /** @deprecated Development Mode */
  popularity?: number;
}

export interface SpotifyRestrictions {
  reason?: string;
}

export interface SpotifyAlbumBase {
  id: string;
  name: string;
  uri: string;
  type: 'album';
  album_type: 'album' | 'single' | 'compilation' | string;
  total_tracks: number;
  images: SpotifyImage[];
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
  href?: string;
  external_urls?: SpotifyExternalUrls;
  restrictions?: SpotifyRestrictions;
}

export interface SpotifySimplifiedAlbum extends SpotifyAlbumBase {
  artists: SpotifySimplifiedArtist[];
  /** @deprecated Present on artist discography items only. */
  album_group?: 'album' | 'single' | 'compilation' | 'appears_on';
}

export interface SpotifyCopyright {
  text: string;
  type: string;
}

export interface SpotifyAlbum extends SpotifySimplifiedAlbum {
  tracks: SpotifyPaging<SpotifySimplifiedTrack>;
  copyrights?: SpotifyCopyright[];
  /** @deprecated Development Mode */
  label?: string;
  /** @deprecated Development Mode */
  popularity?: number;
  /** @deprecated Always empty. */
  genres?: string[];
}

export interface SpotifySimplifiedTrack {
  id: string | null;
  name: string;
  uri: string;
  type: 'track';
  duration_ms: number;
  track_number: number;
  disc_number: number;
  explicit: boolean;
  artists: SpotifySimplifiedArtist[];
  is_playable?: boolean;
  is_local?: boolean;
  restrictions?: SpotifyRestrictions;
}

export interface SpotifyTrack extends SpotifySimplifiedTrack {
  album: SpotifySimplifiedAlbum;
  /** @deprecated Development Mode */
  external_ids?: { isrc?: string };
  /** @deprecated Development Mode */
  popularity?: number;
}

export interface SpotifyEpisode {
  type: 'episode';
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  images?: SpotifyImage[];
}

export type SpotifyPlayable = SpotifyTrack | SpotifyEpisode;

export interface SpotifyPaging<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

export interface SpotifyCursorPaging<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  cursors?: { after?: string; before?: string } | null;
  total?: number;
}

export interface SpotifyContext {
  type: string;
  uri: string;
  href?: string;
  external_urls?: SpotifyExternalUrls;
}

export interface SpotifyPlayHistory {
  track: SpotifyTrack;
  played_at: string;
  context: SpotifyContext | null;
}

export interface SpotifySavedAlbum {
  added_at: string;
  album: SpotifyAlbum;
}

export interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrack | null;
}

/** GET /me/following?type=artist wraps its cursor page in `artists`. */
export interface SpotifyFollowedArtists {
  artists: SpotifyCursorPaging<SpotifyArtist | null>;
}

export interface SpotifyPlaylistItemsRef {
  href: string;
  total: number;
}

export interface SpotifySimplifiedPlaylist {
  id: string;
  name: string;
  uri: string;
  type: 'playlist';
  description: string | null;
  images: SpotifyImage[] | null;
  owner: { id: string; display_name?: string | null };
  public?: boolean | null;
  collaborative?: boolean;
  snapshot_id?: string;
  /** Current field (February 2026). */
  items?: SpotifyPlaylistItemsRef;
  /** @deprecated Renamed to `items`; still returned for Extended Quota apps. */
  tracks?: SpotifyPlaylistItemsRef;
}

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume?: boolean;
}

export type SpotifyDisallows = Partial<
  Record<
    | 'interrupting_playback'
    | 'pausing'
    | 'resuming'
    | 'seeking'
    | 'skipping_next'
    | 'skipping_prev'
    | 'toggling_repeat_context'
    | 'toggling_shuffle'
    | 'toggling_repeat_track'
    | 'transferring_playback',
    boolean
  >
>;

export interface SpotifyPlaybackState {
  device: SpotifyDevice;
  repeat_state: 'off' | 'track' | 'context';
  shuffle_state: boolean;
  context: SpotifyContext | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  item: SpotifyPlayable | null;
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown';
  /**
   * The schema documents a DisallowsObject; responses in the wild nest it under
   * `disallows`. Both shapes are accepted by the mapper.
   */
  actions?: SpotifyDisallows & { disallows?: SpotifyDisallows };
}

export interface SpotifyQueue {
  currently_playing: SpotifyPlayable | null;
  queue: SpotifyPlayable[];
}

export interface SpotifySearchResponse {
  tracks?: SpotifyPaging<SpotifyTrack | null>;
  artists?: SpotifyPaging<SpotifyArtist | null>;
  albums?: SpotifyPaging<SpotifySimplifiedAlbum | null>;
  playlists?: SpotifyPaging<SpotifySimplifiedPlaylist | null>;
}

export interface SpotifyPrivateUser {
  id: string;
  display_name: string | null;
  uri: string;
  images?: SpotifyImage[];
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SpotifyErrorBody {
  error?: { status?: number; message?: string; reason?: string } | string;
  error_description?: string;
}
