import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSession } from '../app/sessionContext';
import type { TrackIdentity } from '../domain/types';
import { pinnedLrclibId } from '../translation/curated';
import { normaliseLines } from './lyricSync';
import { LyricsProviderError, type TimedLyrics } from './types';

export type LyricsState =
  | { status: 'disabled' }
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; lyrics: TimedLyrics }
  | { status: 'instrumental'; source?: string }
  | { status: 'unavailable'; reason: 'not-found' | 'error'; retry: () => void };

/**
 * Loads timed lyrics for a track through the session's replaceable provider.
 * When the song's note has a curated translation, the lyrics come from the
 * LRCLIB record it was timed on, so the translation lands on the right lines.
 * Failures never touch playback; they resolve to a designed "unavailable" state.
 */
export function useTimedLyrics(track: TrackIdentity | null): LyricsState {
  const { lyrics: provider, mode } = useSession();
  const lrclibId = useMemo(
    () =>
      track
        ? pinnedLrclibId({ id: track.spotifyTrackId, title: track.title, artistNames: track.artists.map((a) => a.name), durationMs: track.durationMs })
        : null,
    [track],
  );
  const query = useQuery({
    queryKey: [mode, 'lyrics', provider?.id, track?.spotifyTrackId, lrclibId],
    enabled: Boolean(provider && track),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60 * 60_000,
    retry: (count, error) => count < 2 && error instanceof LyricsProviderError && error.retryable,
    retryDelay: (attempt) => 1500 * 2 ** attempt,
    queryFn: async ({ signal }) => {
      const result = await provider!.getTimedLyrics(track!, { signal, ...(lrclibId ? { lrclibId } : {}) });
      if (!result) return null;
      return { ...result, lines: normaliseLines(result.lines) };
    },
  });

  const retry = () => void query.refetch();
  if (!provider) return { status: 'disabled' };
  if (!track) return { status: 'idle' };
  if (query.isPending) return { status: 'loading' };
  if (query.isError) return { status: 'unavailable', reason: 'error', retry };
  const lyrics = query.data;
  if (!lyrics) return { status: 'unavailable', reason: 'not-found', retry };
  if (lyrics.instrumental) return { status: 'instrumental', source: lyrics.source };
  if (lyrics.lines.length === 0) return { status: 'unavailable', reason: 'not-found', retry };
  return { status: 'ready', lyrics };
}
