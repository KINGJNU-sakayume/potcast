import type { DeviceInfo, ImageRef, TrackIdentity } from '../domain/types';
import { pickImageUrl } from '../lib/images';
import { idFromUri, parseSpotifyUri } from '../lib/spotifyUri';
import { mapDevice, mapDisallows, mapTrackIdentity } from '../spotify/mappers';
import type { SpotifyPlaybackState } from '../spotify/types';
import type { PlaybackContextInfo, PlayerSnapshot } from './types';

export const BROWSER_DEVICE_NAME = 'ARC Music Browser';

/** Maps a Web Playback SDK track. SDK entities carry URIs, not IDs, so IDs are parsed. */
export function mapSdkTrack(track: Spotify.Track | null | undefined): TrackIdentity | null {
  if (!track || track.type !== 'track') return null;
  const id = track.id ?? idFromUri(track.uri);
  if (!id) return null;
  const images: ImageRef[] = (track.album?.images ?? []).map((image) => ({
    url: image.url,
    width: image.width ?? null,
    height: image.height ?? null,
  }));
  return {
    spotifyTrackId: id,
    uri: track.uri,
    title: track.name,
    artists: (track.artists ?? []).map((artist) => ({
      id: idFromUri(artist.uri) ?? '',
      name: artist.name,
      uri: artist.uri,
    })),
    album: {
      id: idFromUri(track.album?.uri) ?? '',
      name: track.album?.name ?? '',
      uri: track.album?.uri ?? '',
      imageUrl: pickImageUrl(images, 640) ?? undefined,
      images,
    },
    durationMs: track.duration_ms,
  };
}

function mapContext(uri: string | null | undefined, name: string | null | undefined): PlaybackContextInfo | null {
  if (!uri) return null;
  return { uri, type: parseSpotifyUri(uri)?.type ?? 'context', name: name ?? null };
}

export function browserDevice(deviceId: string, volume: number | null): DeviceInfo {
  return {
    id: deviceId,
    name: BROWSER_DEVICE_NAME,
    type: 'Computer',
    isActive: true,
    isRestricted: false,
    isThisBrowser: true,
    volumePercent: volume === null ? null : Math.round(volume * 100),
    supportsVolume: true,
  };
}

export function mapSdkState(
  state: Spotify.PlaybackState,
  deviceId: string,
  volume: number | null,
  now: number,
): PlayerSnapshot {
  const window = state.track_window;
  return {
    source: 'sdk',
    track: mapSdkTrack(window?.current_track),
    context: mapContext(state.context?.uri, state.context?.metadata?.name),
    paused: state.paused,
    shuffle: state.shuffle,
    buffering: Boolean(state.loading),
    positionMs: state.position,
    sampledAt: now,
    durationMs: state.duration,
    volume,
    device: browserDevice(deviceId, volume),
    disallows: {
      pausing: Boolean(state.disallows?.pausing),
      resuming: Boolean(state.disallows?.resuming),
      seeking: Boolean(state.disallows?.seeking),
      skippingNext: Boolean(state.disallows?.skipping_next),
      skippingPrev: Boolean(state.disallows?.skipping_prev),
      togglingShuffle: Boolean(state.disallows?.toggling_shuffle),
    },
    nextTracks: (window?.next_tracks ?? []).map(mapSdkTrack).filter((t): t is TrackIdentity => t !== null),
  };
}

/** Maps GET /me/player. `progress_ms` is taken as observed at response time `now`. */
export function mapRemotePlayback(
  state: SpotifyPlaybackState,
  browserDeviceId: string | null,
  now: number,
): PlayerSnapshot {
  const device = state.device ? mapDevice(state.device, browserDeviceId) : null;
  const track = mapTrackIdentity(state.item);
  return {
    source: device?.isThisBrowser ? 'sdk' : 'remote',
    track,
    context: mapContext(state.context?.uri, null),
    paused: !state.is_playing,
    shuffle: state.shuffle_state,
    buffering: false,
    positionMs: state.progress_ms ?? 0,
    sampledAt: now,
    durationMs: track?.durationMs ?? (state.item ? state.item.duration_ms : 0),
    volume: device?.volumePercent === null || device?.volumePercent === undefined ? null : device.volumePercent / 100,
    device,
    disallows: mapDisallows(state.actions),
    nextTracks: [],
  };
}
