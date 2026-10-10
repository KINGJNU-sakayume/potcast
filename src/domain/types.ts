/**
 * UI-facing domain models. Spotify transport shapes (src/spotify/types.ts) are
 * mapped into these in src/spotify/mappers.ts so that pages, playback and
 * lyrics never depend on raw API responses.
 */

export interface ImageRef {
  url: string;
  width: number | null;
  height: number | null;
}

export interface ArtistRef {
  id: string;
  name: string;
  uri: string;
}

/** The identity of a playable track, independent of Spotify transport shapes. */
export interface TrackIdentity {
  spotifyTrackId: string;
  uri: string;
  title: string;
  artists: ArtistRef[];
  album: {
    id: string;
    name: string;
    uri: string;
    imageUrl?: string;
    images: ImageRef[];
  };
  durationMs: number;
  explicit?: boolean;
  isrc?: string;
}

export type AlbumType = 'album' | 'single' | 'compilation';
/** How a release relates to an artist's discography (Spotify's `include_groups`). */
export type ReleaseGroup = AlbumType | 'appears_on';
export type ReleaseDatePrecision = 'year' | 'month' | 'day';

export interface AlbumSummary {
  id: string;
  uri: string;
  name: string;
  artists: ArtistRef[];
  images: ImageRef[];
  albumType: AlbumType;
  releaseDate: string | null;
  releaseDatePrecision: ReleaseDatePrecision | null;
  totalTracks: number | null;
}

export interface AlbumTrack {
  id: string;
  uri: string;
  name: string;
  artists: ArtistRef[];
  durationMs: number;
  trackNumber: number;
  discNumber: number;
  explicit: boolean;
  isPlayable: boolean;
}

export interface AlbumDetail extends AlbumSummary {
  tracks: AlbumTrack[];
  /** False when the source could not provide every track (e.g. preview data). */
  tracksComplete: boolean;
  totalDurationMs: number;
  label: string | null;
  copyrights: string[];
}

export interface ArtistSummary {
  id: string;
  uri: string;
  name: string;
  images: ImageRef[];
}

export interface ArtistDetail extends ArtistSummary {
  /** Deprecated by Spotify for Development Mode apps — often empty. */
  genres: string[];
  /** Deprecated by Spotify for Development Mode apps — often null. */
  followers: number | null;
}

export interface PlaylistSummary {
  id: string;
  uri: string;
  name: string;
  description: string | null;
  images: ImageRef[];
  ownerName: string | null;
  itemCount: number | null;
}

export interface PlaybackContextRef {
  uri: string;
  type: string;
}

export interface RecentlyPlayedItem {
  track: TrackIdentity;
  playedAt: string;
  context: PlaybackContextRef | null;
}

export interface Page<T> {
  items: T[];
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/** A cursor-paged list (e.g. followed artists); `nextCursor` is null on the last page. */
export interface CursorPage<T> {
  items: T[];
  total: number | null;
  nextCursor: string | null;
}

export type SearchType = 'track' | 'artist' | 'album' | 'playlist';

export interface SearchResults {
  tracks: Page<TrackIdentity> | null;
  artists: Page<ArtistSummary> | null;
  albums: Page<AlbumSummary> | null;
  playlists: Page<PlaylistSummary> | null;
}

export interface DeviceInfo {
  id: string | null;
  name: string;
  type: string;
  isActive: boolean;
  isRestricted: boolean;
  isThisBrowser: boolean;
  volumePercent: number | null;
  supportsVolume: boolean;
}
