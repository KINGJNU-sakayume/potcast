import type { AlbumDetail, ArtistDetail, ReleaseGroup } from '../domain/types';
import { isSpotifyApiError } from '../spotify/errors';
import type { DigData } from './types';

export const catalogueOffline = (error: unknown) => (typeof navigator !== 'undefined' && navigator.onLine === false) || (isSpotifyApiError(error) && error.kind === 'network');

/** Reconstruct a read-only catalogue snapshot; only explicit recording actions mutate personal data. */
export function offlineAlbum(id: string | undefined, data: DigData): AlbumDetail | undefined {
  const release = data.releases.find((r) => r.id === id);
  if (!release) return undefined;
  const tracks = release.trackIds.flatMap((id) => {
    const track = data.tracks.find((t) => t.id === id);
    // A stored snapshot cannot assert current market availability. Recording is still available offline.
    return track ? [{ ...track, explicit: track.explicit ?? false, isPlayable: false }] : [];
  });
  return { ...release, tracks, tracksComplete: release.tracksComplete && tracks.length === release.trackIds.length,
    totalDurationMs: tracks.reduce((sum, t) => sum + t.durationMs, 0), label: null, copyrights: [] };
}

export function offlineArtist(id: string | undefined, data: DigData): ArtistDetail | undefined {
  const project = data.projects.find((p) => p.id === id);
  return project ? { id: project.id, name: project.name, images: project.images, uri: `spotify:artist:${project.id}`, genres: project.genres, followers: null } : undefined;
}

export function offlineDiscography(artistId: string, group: ReleaseGroup, data: DigData) {
  const ids = new Set(data.memberships.filter((m) => m.artistId === artistId && m.group === group).map((m) => m.albumId));
  const releases = data.releases.filter((r) => ids.has(r.id));
  return releases.length ? { releases, total: releases.length, complete: data.projects.find((p) => p.id === artistId)?.catalogueComplete ?? false } : undefined;
}
