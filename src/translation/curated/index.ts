import { findSongNote, type NoteSources } from '../../editorial/lookup';
import type { SongNote } from '../../editorial/types';
import { devWarn } from '../../lib/devWarn';
import type { LyricsTiming } from '../../lyrics/types';
import { sameLanguage } from '../languageDetect';
import type { SongTranslation, TranslationTimeline } from './types';

export type { SongTranslation } from './types';

/** How far apart two lengths of "the same recording" may be. */
export const DURATION_TOLERANCE_MS = 3000;

export interface CuratedQuery {
  id?: string | null;
  title?: string | null;
  artistNames?: readonly string[];
  /** Spotify's length of the playing track. */
  durationMs?: number | null;
  targetLanguage: string;
}

export interface CuratedMatch {
  note: SongNote;
  translation: SongTranslation;
  matchedBy: 'id' | 'name';
}

const withinTolerance = (a: number | null | undefined, b: number) => typeof a === 'number' && a > 0 && Math.abs(a - b) <= DURATION_TOLERANCE_MS;

/**
 * The song note's curated translation for the playing track. The note is found
 * as everywhere else (Spotify ID, then title + artist name); a name match only
 * brings the translation along when Spotify's length is within 3 s of the
 * record the segments were timed on — another edit of the song would put them
 * on the wrong lines. The note itself is shown either way.
 */
export function getCuratedTranslation(query: CuratedQuery, sources?: NoteSources): CuratedMatch | null {
  const match = findSongNote(query, sources);
  const translation = match?.note.translation;
  if (!match || !translation || !sameLanguage(translation.brief.targetLanguage, query.targetLanguage)) return null;
  if (match.matchedBy === 'name' && !withinTolerance(query.durationMs, translation.timeline.timing.durationMs)) {
    devWarn(
      `"${match.note.key}" matched by name, but the track is ${query.durationMs ?? '?'} ms and the translation was timed on ` +
        `${translation.timeline.timing.durationMs} ms: curated translation not applied.`,
    );
    return null;
  }
  return { note: match.note, translation, matchedBy: match.matchedBy };
}

/**
 * The LRCLIB record to load lyrics from for this track: the one its song
 * note's curated translation was timed on. Same rule as the translation
 * itself — a track-ID match, or a name match within 3 s of that record's
 * length. Independent of the target language: it only decides which lyrics
 * (and so which timing) the app shows. The provider still checks the record's
 * length against the track and searches as usual when it does not fit.
 */
export function pinnedLrclibId(query: Omit<CuratedQuery, 'targetLanguage'>, sources?: NoteSources): number | null {
  const match = findSongNote(query, sources);
  const timing = match?.note.translation?.timeline.timing;
  if (!match || !timing) return null;
  if (match.matchedBy === 'name' && !withinTolerance(query.durationMs, timing.durationMs)) return null;
  return timing.lrclibId;
}

/**
 * Whether the loaded lyrics follow the timing the segments were written on:
 * the same LRCLIB record, or another one of the same length (±3 s).
 */
export function lyricsMatchTiming(lyrics: LyricsTiming | undefined, timing: TranslationTimeline['timing']): boolean {
  if (!lyrics) return false;
  if (lyrics.lrclibId !== null && lyrics.lrclibId === timing.lrclibId) return true;
  return withinTolerance(lyrics.durationMs, timing.durationMs);
}
