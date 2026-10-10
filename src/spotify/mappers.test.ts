import { describe, expect, it } from 'vitest';
import { mapRemotePlayback } from '../playback/stateMapping';
import {
  mapAlbumDetail,
  mapArtistDetail,
  mapDisallows,
  mapPage,
  mapPlaylistSummary,
  mapRecentlyPlayed,
  mapTrackIdentity,
} from './mappers';
import type {
  SpotifyAlbum,
  SpotifyPlaybackState,
  SpotifySimplifiedPlaylist,
  SpotifySimplifiedTrack,
  SpotifyTrack,
} from './types';

const artist = { id: 'art1', name: 'Tyler, The Creator', uri: 'spotify:artist:art1', type: 'artist' as const };
const images = [
  { url: 'https://i.scdn.co/image/640', width: 640, height: 640 },
  { url: 'https://i.scdn.co/image/64', width: 64, height: 64 },
];
const simpleAlbum = {
  id: 'alb1',
  name: 'IGOR',
  uri: 'spotify:album:alb1',
  type: 'album' as const,
  album_type: 'album',
  total_tracks: 2,
  images,
  release_date: '2019-05-17',
  release_date_precision: 'day' as const,
  artists: [artist],
};
const simpleTrack = (id: string | null, n: number): SpotifySimplifiedTrack => ({
  id,
  name: `Track ${n}`,
  uri: `spotify:track:${id}`,
  type: 'track',
  duration_ms: 1000 * n,
  track_number: n,
  disc_number: 1,
  explicit: false,
  artists: [artist],
});
const track: SpotifyTrack = { ...simpleTrack('trk1', 1), album: simpleAlbum };

describe('Spotify → domain mappers', () => {
  it('maps a track to a TrackIdentity with the large cover as imageUrl', () => {
    const identity = mapTrackIdentity(track);
    expect(identity).toMatchObject({
      spotifyTrackId: 'trk1',
      title: 'Track 1',
      album: { id: 'alb1', name: 'IGOR', imageUrl: 'https://i.scdn.co/image/640' },
      artists: [{ id: 'art1', name: 'Tyler, The Creator' }],
    });
  });

  it('skips episodes, local files and tracks without IDs', () => {
    expect(mapTrackIdentity({ type: 'episode', id: 'e', name: 'e', uri: 'spotify:episode:e', duration_ms: 1 })).toBeNull();
    expect(mapTrackIdentity({ ...track, is_local: true })).toBeNull();
    expect(mapTrackIdentity({ ...track, id: null })).toBeNull();
  });

  it('builds album details and reports whether every track was loaded', () => {
    const album: SpotifyAlbum = { ...simpleAlbum, tracks: { href: '', items: [], limit: 50, next: null, offset: 0, previous: null, total: 2 } };
    const complete = mapAlbumDetail(album, [simpleTrack('a', 1), simpleTrack('b', 2)]);
    expect(complete.tracks).toHaveLength(2);
    expect(complete.tracksComplete).toBe(true);
    expect(complete.totalDurationMs).toBe(3000);
    expect(complete.label).toBeNull(); // deprecated field absent
    expect(mapAlbumDetail(album, [simpleTrack('a', 1)]).tracksComplete).toBe(false);
  });

  it('tolerates deprecated artist fields being absent', () => {
    expect(mapArtistDetail({ ...artist, images: [] })).toMatchObject({ genres: [], followers: null });
    expect(mapArtistDetail({ ...artist, genres: ['rap'], followers: { href: null, total: 5 } })).toMatchObject({
      genres: ['rap'],
      followers: 5,
    });
  });

  it('reads playlist counts from `items` (Feb 2026) or legacy `tracks`', () => {
    const base: SpotifySimplifiedPlaylist = {
      id: 'pl',
      name: 'List',
      uri: 'spotify:playlist:pl',
      type: 'playlist',
      description: '',
      images: null,
      owner: { id: 'me', display_name: 'You' },
    };
    expect(mapPlaylistSummary({ ...base, items: { href: '', total: 42 } }).itemCount).toBe(42);
    expect(mapPlaylistSummary({ ...base, tracks: { href: '', total: 7 } }).itemCount).toBe(7);
    expect(mapPlaylistSummary(base)).toMatchObject({ itemCount: null, images: [], description: null });
  });

  it('skips null entries that search responses can contain', () => {
    const page = mapPage(
      { href: '', items: [null, base(1), null, base(2)], limit: 10, next: 'more', offset: 0, previous: null, total: 30 },
      (item: { n: number }) => item.n,
    );
    expect(page).toEqual({ items: [1, 2], offset: 0, limit: 10, total: 30, hasMore: true });
    function base(n: number) {
      return { n };
    }
  });

  it('drops unplayable recently-played entries', () => {
    const items = mapRecentlyPlayed([
      { track, played_at: '2026-09-27T10:00:00Z', context: { type: 'album', uri: 'spotify:album:alb1' } },
      { track: { ...track, id: null }, played_at: '2026-09-27T09:00:00Z', context: null },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.context).toEqual({ uri: 'spotify:album:alb1', type: 'album' });
  });

  it('accepts both documented and nested disallow shapes', () => {
    expect(mapDisallows({ resuming: true }).resuming).toBe(true);
    expect(mapDisallows({ disallows: { skipping_prev: true } }).skippingPrev).toBe(true);
    expect(mapDisallows(undefined).pausing).toBe(false);
    expect(mapDisallows({ disallows: { toggling_shuffle: true } }).togglingShuffle).toBe(true);
  });

  it('maps GET /me/player into a remote snapshot', () => {
    const state: SpotifyPlaybackState = {
      device: { id: 'phone', is_active: true, is_private_session: false, is_restricted: false, name: 'Pixel', type: 'Smartphone', volume_percent: 70 },
      repeat_state: 'off',
      shuffle_state: false,
      context: { type: 'album', uri: 'spotify:album:alb1' },
      timestamp: 0,
      progress_ms: 64_000,
      is_playing: true,
      item: track,
      currently_playing_type: 'track',
    };
    const snapshot = mapRemotePlayback(state, 'browser-device', 500);
    expect(snapshot).toMatchObject({ source: 'remote', paused: false, positionMs: 64_000, sampledAt: 500, volume: 0.7 });
    expect(snapshot.shuffle).toBe(false);
    expect(mapRemotePlayback({ ...state, shuffle_state: true }, 'browser-device', 500).shuffle).toBe(true);
    expect(mapRemotePlayback({ ...state, device: { ...state.device, id: 'browser-device' } }, 'browser-device', 0).source).toBe('sdk');
  });
});
