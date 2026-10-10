import type {
  AlbumDetail,
  AlbumSummary,
  AlbumTrack,
  AlbumType,
  ArtistDetail,
  ArtistRef,
  ArtistSummary,
  DeviceInfo,
  ImageRef,
  Page,
  PlaylistSummary,
  RecentlyPlayedItem,
  TrackIdentity,
} from '../domain/types';
import { pickImageUrl } from '../lib/images';
import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyDevice,
  SpotifyDisallows,
  SpotifyImage,
  SpotifyPaging,
  SpotifyPlayHistory,
  SpotifyPlayable,
  SpotifyPlaybackState,
  SpotifySimplifiedAlbum,
  SpotifySimplifiedArtist,
  SpotifySimplifiedPlaylist,
  SpotifySimplifiedTrack,
} from './types';

export function mapImages(images: SpotifyImage[] | null | undefined): ImageRef[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image) => typeof image?.url === 'string' && image.url.length > 0)
    .map((image) => ({ url: image.url, width: image.width ?? null, height: image.height ?? null }));
}

export function mapArtistRef(artist: SpotifySimplifiedArtist): ArtistRef {
  return { id: artist.id, name: artist.name, uri: artist.uri };
}

function mapAlbumType(value: string | undefined): AlbumType {
  const normalised = value?.toLowerCase();
  return normalised === 'single' || normalised === 'compilation' ? normalised : 'album';
}

export function mapAlbumSummary(album: SpotifySimplifiedAlbum): AlbumSummary {
  return {
    id: album.id,
    uri: album.uri,
    name: album.name,
    artists: (album.artists ?? []).map(mapArtistRef),
    images: mapImages(album.images),
    albumType: mapAlbumType(album.album_type),
    releaseDate: album.release_date || null,
    releaseDatePrecision: album.release_date_precision ?? null,
    totalTracks: typeof album.total_tracks === 'number' ? album.total_tracks : null,
  };
}

/** Maps a track (or episode) to a TrackIdentity; returns null for episodes, ads and local files. */
export function mapTrackIdentity(item: SpotifyPlayable | null | undefined): TrackIdentity | null {
  if (!item || item.type !== 'track' || !item.id || item.is_local) return null;
  const images = mapImages(item.album?.images);
  return {
    spotifyTrackId: item.id,
    uri: item.uri,
    title: item.name,
    artists: (item.artists ?? []).map(mapArtistRef),
    album: {
      id: item.album?.id ?? '',
      name: item.album?.name ?? '',
      uri: item.album?.uri ?? '',
      imageUrl: pickImageUrl(images, 640) ?? undefined,
      images,
    },
    durationMs: item.duration_ms,
    explicit: item.explicit,
    isrc: item.external_ids?.isrc,
  };
}

export function mapAlbumTrack(track: SpotifySimplifiedTrack): AlbumTrack | null {
  if (!track.id) return null;
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: (track.artists ?? []).map(mapArtistRef),
    durationMs: track.duration_ms,
    trackNumber: track.track_number,
    discNumber: track.disc_number ?? 1,
    explicit: Boolean(track.explicit),
    isPlayable: track.is_playable !== false && !track.restrictions?.reason,
  };
}

export function mapAlbumDetail(album: SpotifyAlbum, allTracks: SpotifySimplifiedTrack[]): AlbumDetail {
  const tracks = allTracks.map(mapAlbumTrack).filter((t): t is AlbumTrack => t !== null);
  const expected = album.tracks?.total ?? album.total_tracks;
  return {
    ...mapAlbumSummary(album),
    tracks,
    tracksComplete: typeof expected === 'number' ? allTracks.length >= expected : true,
    totalDurationMs: tracks.reduce((sum, t) => sum + t.durationMs, 0),
    label: album.label?.trim() || null,
    copyrights: (album.copyrights ?? []).map((c) => c.text).filter(Boolean),
  };
}

export function mapArtistSummary(artist: SpotifyArtist): ArtistSummary {
  return { id: artist.id, uri: artist.uri, name: artist.name, images: mapImages(artist.images) };
}

export function mapArtistDetail(artist: SpotifyArtist): ArtistDetail {
  return {
    ...mapArtistSummary(artist),
    genres: Array.isArray(artist.genres) ? artist.genres : [],
    followers: typeof artist.followers?.total === 'number' ? artist.followers.total : null,
  };
}

export function mapPlaylistSummary(playlist: SpotifySimplifiedPlaylist): PlaylistSummary {
  // `items` replaced `tracks` in February 2026; accept either.
  const ref = playlist.items ?? playlist.tracks;
  return {
    id: playlist.id,
    uri: playlist.uri,
    name: playlist.name,
    description: playlist.description?.trim() || null,
    images: mapImages(playlist.images),
    ownerName: playlist.owner?.display_name ?? null,
    itemCount: typeof ref?.total === 'number' ? ref.total : null,
  };
}

export function mapRecentlyPlayed(items: SpotifyPlayHistory[]): RecentlyPlayedItem[] {
  const result: RecentlyPlayedItem[] = [];
  for (const entry of items) {
    const track = mapTrackIdentity(entry.track);
    if (!track) continue;
    result.push({
      track,
      playedAt: entry.played_at,
      context: entry.context ? { uri: entry.context.uri, type: entry.context.type } : null,
    });
  }
  return result;
}

export function mapPage<T, U>(paging: SpotifyPaging<T | null> | undefined, map: (item: T) => U | null): Page<U> {
  if (!paging) return { items: [], offset: 0, limit: 0, total: 0, hasMore: false };
  const items: U[] = [];
  for (const item of paging.items ?? []) {
    if (item === null || item === undefined) continue;
    const mapped = map(item);
    if (mapped !== null) items.push(mapped);
  }
  return {
    items,
    offset: paging.offset ?? 0,
    limit: paging.limit ?? items.length,
    total: paging.total ?? items.length,
    hasMore: Boolean(paging.next),
  };
}

export function mapDevice(device: SpotifyDevice, browserDeviceId: string | null): DeviceInfo {
  return {
    id: device.id,
    name: device.name,
    type: device.type,
    isActive: device.is_active,
    isRestricted: device.is_restricted,
    isThisBrowser: Boolean(browserDeviceId && device.id === browserDeviceId),
    volumePercent: device.volume_percent,
    supportsVolume: device.supports_volume ?? device.volume_percent !== null,
  };
}

export interface MappedDisallows {
  pausing: boolean;
  resuming: boolean;
  seeking: boolean;
  skippingNext: boolean;
  skippingPrev: boolean;
  togglingShuffle: boolean;
}

export function mapDisallows(actions: SpotifyPlaybackState['actions']): MappedDisallows {
  const source: SpotifyDisallows = actions?.disallows ?? actions ?? {};
  return {
    pausing: Boolean(source.pausing),
    resuming: Boolean(source.resuming),
    seeking: Boolean(source.seeking),
    skippingNext: Boolean(source.skipping_next),
    skippingPrev: Boolean(source.skipping_prev),
    togglingShuffle: Boolean(source.toggling_shuffle),
  };
}
