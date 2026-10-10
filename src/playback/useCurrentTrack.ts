import { useCallback } from 'react';
import { usePlayerSelector } from './hooks';

export interface CurrentMatcher {
  /** Returns the playing state if `track` is the current track, else null. */
  (track: { id: string; uri?: string; name?: string; albumId?: string }): { playing: boolean } | null;
}

/**
 * Identifies the current track in lists. Spotify may relink a track to a
 * different ID in the user's market, so an album + title match is accepted too.
 */
export function useCurrentTrackMatcher(): CurrentMatcher {
  const current = usePlayerSelector((s) => s.snapshot.track);
  const paused = usePlayerSelector((s) => s.snapshot.paused);
  return useCallback<CurrentMatcher>(
    (track) => {
      if (!current) return null;
      const sameId = track.id === current.spotifyTrackId || (track.uri !== undefined && track.uri === current.uri);
      const relinked =
        track.albumId !== undefined &&
        track.name !== undefined &&
        track.albumId === current.album.id &&
        track.name.localeCompare(current.title, undefined, { sensitivity: 'accent' }) === 0;
      return sameId || relinked ? { playing: !paused } : null;
    },
    [current, paused],
  );
}
