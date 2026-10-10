import type { SearchResults } from '../domain/types';
import type { SpotifyClient } from '../spotify/client';
import * as api from '../spotify/endpoints';
import {
  mapAlbumDetail,
  mapAlbumSummary,
  mapArtistDetail,
  mapArtistSummary,
  mapPage,
  mapPlaylistSummary,
  mapRecentlyPlayed,
  mapTrackIdentity,
} from '../spotify/mappers';
import type { SpotifySimplifiedTrack } from '../spotify/types';
import {
  dedupeRecentlyPlayed,
  type CatalogueSource,
  type PageRequest,
  type SearchRequest,
} from './CatalogueSource';

const MAX_ALBUM_TRACK_PAGES = 40;

export function createSpotifyCatalogueSource(client: SpotifyClient): CatalogueSource {
  return {
    mode: 'spotify',

    async getProfile(signal) {
      const user = await api.getCurrentUser(client, signal);
      return { displayName: user.display_name?.trim() || null };
    },

    async getRecentlyPlayed(signal) {
      const page = await api.getRecentlyPlayed(client, 40, signal);
      return dedupeRecentlyPlayed(mapRecentlyPlayed(page.items ?? []));
    },

    async getLikedTracks(page: PageRequest, signal) {
      const result = await api.getSavedTracks(client, page, signal);
      return mapPage(result, (saved) => mapTrackIdentity(saved.track));
    },

    async getFollowedArtists(after, limit, signal) {
      const { artists } = await api.getFollowedArtists(client, { limit, after }, signal);
      const items = (artists?.items ?? []).flatMap((artist) => (artist ? [mapArtistSummary(artist)] : []));
      return {
        items,
        total: typeof artists?.total === 'number' ? artists.total : null,
        nextCursor: artists?.next ? (artists.cursors?.after ?? null) : null,
      };
    },

    async getSavedAlbums(page: PageRequest, signal) {
      const result = await api.getSavedAlbums(client, page, signal);
      return mapPage(result, (saved) => (saved.album ? mapAlbumSummary(saved.album) : null));
    },

    async getPlaylists(page: PageRequest, signal) {
      const result = await api.getMyPlaylists(client, page, signal);
      return mapPage(result, mapPlaylistSummary);
    },

    async getAlbum(id, signal) {
      const album = await api.getAlbum(client, id, signal);
      const tracks: SpotifySimplifiedTrack[] = [...(album.tracks?.items ?? [])];
      const total = album.tracks?.total ?? album.total_tracks ?? tracks.length;
      // The album object embeds only the first page of tracks; fetch the rest.
      for (let page = 0; tracks.length < total && page < MAX_ALBUM_TRACK_PAGES; page += 1) {
        const next = await api.getAlbumTracks(client, id, { limit: api.LIMITS.page, offset: tracks.length }, signal);
        if (next.items.length === 0) break;
        tracks.push(...next.items);
      }
      return mapAlbumDetail(album, tracks);
    },

    async getArtist(id, signal) {
      return mapArtistDetail(await api.getArtist(client, id, signal));
    },

    async getArtistReleases(artistId, groups, page: PageRequest, signal) {
      const result = await api.getArtistAlbums(
        client,
        artistId,
        { includeGroups: groups.join(','), limit: page.limit, offset: page.offset },
        signal,
      );
      return mapPage(result, mapAlbumSummary);
    },

    async search(request: SearchRequest, signal): Promise<SearchResults> {
      const response = await api.search(
        client,
        { q: request.query, types: request.types, limit: request.limit, offset: request.offset },
        signal,
      );
      return {
        tracks: response.tracks ? mapPage(response.tracks, mapTrackIdentity) : null,
        artists: response.artists ? mapPage(response.artists, mapArtistSummary) : null,
        albums: response.albums ? mapPage(response.albums, mapAlbumSummary) : null,
        playlists: response.playlists ? mapPage(response.playlists, mapPlaylistSummary) : null,
      };
    },

    checkSaved(uris, signal) {
      return api.checkLibrary(client, uris, signal);
    },

    async setSaved(uris, saved) {
      if (saved) await api.saveToLibrary(client, uris);
      else await api.removeFromLibrary(client, uris);
    },
  };
}
