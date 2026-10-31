import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { useSession } from '../app/sessionContext';
import type { TrackIdentity } from '../domain/types';
import { pinnedLrclibId } from '../translation/curated';
import { normaliseLines } from './lyricSync';
import { LyricsProviderError, type TimedLyrics } from './types';

/** Retries of a lookup that failed for a reason worth retrying (an LRCLIB outage), spaced 2, 4, 8 and 16 s apart. */
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 2000;

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
  // "Try again" must not be answered from the cache, which holds the very result being retried.
  const refreshNext = useRef(false);
  const lookup = (pin: number | null) => ({
    queryKey: [mode, 'lyrics', provider?.id, track?.spotifyTrackId, pin],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60 * 60_000,
    retry: (count: number, error: Error) => count < MAX_RETRIES && error instanceof LyricsProviderError && error.retryable,
    retryDelay: (attempt: number) => RETRY_BASE_MS * 2 ** attempt,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const refresh = refreshNext.current;
      refreshNext.current = false;
      const result = await provider!.getTimedLyrics(track!, { signal, ...(pin ? { lrclibId: pin } : {}), ...(refresh ? { refresh } : {}) });
      if (!result) return null;
      return { ...result, lines: normaliseLines(result.lines) };
    },
  });
  const query = useQuery({ ...lookup(lrclibId), enabled: Boolean(provider && track) });
  // The record a curated translation was timed on is fetched by ID, which a busy LRCLIB is slowest to answer. Until
  // it arrives (or if it cannot), the usual lookup's lyrics are shown; the translation joins them once it is there.
  const interim = useQuery({ ...lookup(null), enabled: Boolean(provider && track && lrclibId) && (query.isPending || query.isError) });

  const retry = () => {
    refreshNext.current = true;
    void query.refetch();
  };
  if (!provider) return { status: 'disabled' };
  if (!track) return { status: 'idle' };
  const shown = (query.isPending || query.isError) && lrclibId && interim.data?.lines.length ? interim : query;
  if (shown.isPending) return { status: 'loading' };
  if (shown.isError) return { status: 'unavailable', reason: 'error', retry };
  const lyrics = shown.data;
  if (!lyrics) return { status: 'unavailable', reason: 'not-found', retry };
  if (lyrics.instrumental) return { status: 'instrumental', source: lyrics.source };
  if (lyrics.lines.length === 0) return { status: 'unavailable', reason: 'not-found', retry };
  return { status: 'ready', lyrics };
}
