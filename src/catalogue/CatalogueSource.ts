import type {
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ArtistSummary,
  ReleaseGroup,
  CursorPage,
  Page,
  PlaylistSummary,
  RecentlyPlayedItem,
  SearchResults,
  SearchType,
  TrackIdentity,
} from '../domain/types';

export type SessionMode = 'spotify' | 'preview';

export interface PageRequest {
  offset: number;
  limit: number;
}

export interface SearchRequest {
  query: string;
  types: SearchType[];
  offset: number;
  limit: number;
}

/**
 * Navigation / library data for pages. Implemented by the Spotify Web API
 * (spotifySource.ts) and by the offline preview catalogue. Pages consume it
 * through the TanStack Query hooks in queries.ts, never directly.
 */
/** The signed-in listener, for the rail marker. */
export interface ListenerProfile {
  displayName: string | null;
}

export interface CatalogueSource {
  readonly mode: SessionMode;
  getProfile(signal?: AbortSignal): Promise<ListenerProfile>;
  getRecentlyPlayed(signal?: AbortSignal): Promise<RecentlyPlayedItem[]>;
  /** Liked Songs, most recently liked first. */
  getLikedTracks(page: PageRequest, signal?: AbortSignal): Promise<Page<TrackIdentity>>;
  getSavedAlbums(page: PageRequest, signal?: AbortSignal): Promise<Page<AlbumSummary>>;
  /** Followed artists; `after` is the cursor returned by the previous page. */
  getFollowedArtists(after: string | null, limit: number, signal?: AbortSignal): Promise<CursorPage<ArtistSummary>>;
  getPlaylists(page: PageRequest, signal?: AbortSignal): Promise<Page<PlaylistSummary>>;
  /** Album with its complete track sequence. */
  getAlbum(id: string, signal?: AbortSignal): Promise<AlbumDetail>;
  getArtist(id: string, signal?: AbortSignal): Promise<ArtistDetail>;
  /** One page of an artist's releases in the given groups (Spotify order). */
  getArtistReleases(
    artistId: string,
    groups: readonly ReleaseGroup[],
    page: PageRequest,
    signal?: AbortSignal,
  ): Promise<Page<AlbumSummary>>;
  search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResults>;
  checkSaved(uris: string[], signal?: AbortSignal): Promise<boolean[]>;
  setSaved(uris: string[], saved: boolean): Promise<void>;
}

/** Case- and width-insensitive title comparison (preview search). */
export function normaliseTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Keeps the most recent play of each track, preserving order. */
export function dedupeRecentlyPlayed(items: RecentlyPlayedItem[]): RecentlyPlayedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.track.spotifyTrackId)) return false;
    seen.add(item.track.spotifyTrackId);
    return true;
  });
}
