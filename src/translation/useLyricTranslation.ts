import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSession } from '../app/sessionContext';
import type { TrackIdentity } from '../domain/types';
import { hashString } from '../lib/hash';
import type { TimedLyrics } from '../lyrics/types';
import { getCuratedTranslation, type CuratedMatch } from './curated';
import { translateLyrics, translateWithCurated, type LyricTranslationResult } from './translateLyrics';

export type TranslationState =
  | { status: 'off' }
  | { status: 'unsupported' }
  | { status: 'loading' }
  | LyricTranslationResult;

/**
 * Translation for the current lyrics: the curated translation in the song's
 * note when it has one, machine translation otherwise (and for the lines its
 * segments do not cover). Independent of lyric display: when it fails, lyrics
 * keep working and only the translation row disappears. The On / Off toggle
 * (`enabled`) applies to both.
 */
export function useLyricTranslation(
  track: TrackIdentity | null,
  lyrics: TimedLyrics | null,
  enabled: boolean,
): { state: TranslationState; prepare: (() => Promise<void>) | null; curated: CuratedMatch | null } {
  const { translation: provider, translationTarget, mode } = useSession();
  const queryClient = useQueryClient();
  const trackId = track?.spotifyTrackId ?? null;
  const curated = useMemo(
    () =>
      track
        ? getCuratedTranslation({
            id: track.spotifyTrackId,
            title: track.title,
            artistNames: track.artists.map((artist) => artist.name),
            durationMs: track.durationMs,
            targetLanguage: translationTarget,
          })
        : null,
    [track, translationTarget],
  );
  const lyricsHash = lyrics ? hashString(lyrics.lines.map((l) => l.text).join('\n')) : null;
  const queryKey = [mode, 'translation', provider?.id, curated?.note.key ?? null, trackId, translationTarget, lyricsHash];

  const query = useQuery({
    queryKey,
    enabled: Boolean(enabled && (provider || curated) && trackId && lyrics),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: () =>
      curated
        ? translateWithCurated(provider, trackId!, lyrics!, curated, translationTarget, track?.durationMs)
        : translateLyrics(provider!, trackId!, lyrics!, translationTarget),
  });

  const data = query.data;
  const sourceLanguage = data?.status === 'needs-download' ? data.sourceLanguage : null;
  const prepare = useCallback(async () => {
    if (!provider?.prepare || !sourceLanguage) return;
    await provider.prepare(sourceLanguage, translationTarget);
    await queryClient.invalidateQueries({
      queryKey: [mode, 'translation', provider.id, curated?.note.key ?? null, trackId, translationTarget, lyricsHash],
    });
  }, [provider, sourceLanguage, translationTarget, queryClient, mode, curated, trackId, lyricsHash]);

  if (!enabled) return { state: { status: 'off' }, prepare: null, curated };
  if (!provider && !curated) return { state: { status: 'unsupported' }, prepare: null, curated };
  if (!lyrics || !trackId) return { state: { status: 'off' }, prepare: null, curated };
  if (query.isPending) return { state: { status: 'loading' }, prepare: null, curated };
  if (query.isError || !data) {
    return { state: { status: 'unavailable', message: 'Translation failed.' }, prepare: null, curated };
  }
  return { state: data, prepare: data.status === 'needs-download' && provider?.prepare ? prepare : null, curated };
}
