import { useMemo } from 'react';
import { useSession } from '../app/sessionContext';
import type { TrackIdentity } from '../domain/types';
import { useLyricCursor } from '../playback/hooks';
import { usePreferences } from '../preferences/preferences';
import { detectLineLanguages } from '../translation/languageDetect';
import { useLyricTranslation } from '../translation/useLyricTranslation';
import type { TimedLyricLine } from './types';
import type { LyricsState } from './useTimedLyrics';

/** v7.5 shows the line just sung, the current line with its translation, and the next two lines. */
export const UPCOMING_LINES = 2;

/**
 * What a lyric view shows right now: the active line from the central
 * playback clock, its translation, the line before it, the next lines and
 * the translation controls. Shared by the desktop listening column and the
 * phone's lyrics.
 */
export function useLyricView(track: TrackIdentity, lyricsState: LyricsState) {
  const { translation: provider, translationTarget } = useSession();
  const [preferences, setPreferences] = usePreferences();
  const lyrics = lyricsState.status === 'ready' ? lyricsState.lyrics : null;
  const lines: TimedLyricLine[] | null = lyrics?.lines ?? null;
  const { state: translation, prepare, curated } = useLyricTranslation(track, lyrics, preferences.translationEnabled);
  const { activeIndex, nextIndex } = useLyricCursor(lines);

  const lineLanguages = useMemo(
    () => (lines ? detectLineLanguages(lines.map((l) => l.text), lyrics?.language) : []),
    [lines, lyrics?.language],
  );

  const source = lyricsState.status === 'ready' ? lyrics?.source : lyricsState.status === 'instrumental' ? lyricsState.source : null;
  const current = lines && activeIndex >= 0 ? lines[activeIndex]! : null;
  // In a gap between lines, the line before is the one that just ended.
  const previousIndex = (activeIndex >= 0 ? activeIndex : nextIndex) - 1;
  const previous = lines && previousIndex >= 0 ? (lines[previousIndex] ?? null) : null;
  const upcoming = lines ? lines.slice(nextIndex, nextIndex + UPCOMING_LINES) : [];
  const translated = translation.status === 'ready' && activeIndex >= 0 ? (translation.lines[activeIndex] ?? '').trim() : '';
  // A curated segment spanning several lines keeps one element (same key), dimmed while it continues.
  const curatedLine = translation.status === 'ready' && translation.curated && activeIndex >= 0 ? translation.curated : null;
  const segment = curatedLine?.segmentOf[activeIndex] ?? null;
  const continued = Boolean(curatedLine?.continued[activeIndex]);

  return {
    provider,
    translationTarget,
    preferences,
    setPreferences,
    translation,
    prepare,
    curated,
    lines,
    activeIndex,
    nextIndex,
    lineLanguages,
    source,
    current,
    previous,
    previousIndex,
    upcoming,
    translated,
    segment,
    continued,
    /** Whether a translation toggle makes sense for this session. */
    canTranslate: Boolean(provider || curated),
  };
}
