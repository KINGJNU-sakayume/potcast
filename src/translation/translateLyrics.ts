import { BoundedCache } from '../lib/boundedCache';
import { devWarn } from '../lib/devWarn';
import { hashString } from '../lib/hash';
import type { TimedLyrics } from '../lyrics/types';
import { lyricsMatchTiming, type CuratedMatch } from './curated';
import { alignSegments } from './curated/align';
import { detectLineLanguages, sameLanguage } from './languageDetect';
import { TranslationUnavailableError, type TranslationProvider } from './TranslationProvider';

/** How a curated translation sat on the loaded lyrics. */
export interface CuratedCoverage {
  match: CuratedMatch;
  /** Lines with text, and how many of them a segment covered. */
  total: number;
  covered: number;
  /** Per lyric line: the first segment shown with it (stable across continued lines), or null. */
  segmentOf: (number | null)[];
  /** Per lyric line: true when it continues the previous line's segment. */
  continued: boolean[];
  /** Line indices no segment covered that the machine provider filled in. */
  machine: number[];
}

export type LyricTranslationResult =
  /** Every line is already in the target language. */
  | { status: 'not-needed' }
  /** One entry per lyric line; empty string when the line has no translation. */
  | { status: 'ready'; lines: string[]; curated?: CuratedCoverage }
  | { status: 'needs-download'; sourceLanguage: string }
  | { status: 'unavailable'; message: string };

const TTL_MS = 60 * 24 * 60 * 60_000;
const defaultCache = new BoundedCache<string[]>({ prefix: 'arc.translation.v1:', maxEntries: 150 });

/**
 * Translates only the lines that are not already in the target language,
 * grouped by detected source language (mixed Korean/English lyrics translate
 * just the English lines). Results are cached by provider, track, language
 * pair and a hash of the source text.
 */
export async function translateLyrics(
  provider: TranslationProvider,
  trackId: string,
  lyrics: TimedLyrics,
  targetLanguage: string,
  cache: BoundedCache<string[]> = defaultCache,
): Promise<LyricTranslationResult> {
  const texts = lyrics.lines.map((line) => line.text);
  const languages = detectLineLanguages(texts, lyrics.language);

  const groups = new Map<string, number[]>();
  languages.forEach((language, index) => {
    if (!language || sameLanguage(language, targetLanguage)) return;
    const group = groups.get(language) ?? [];
    group.push(index);
    groups.set(language, group);
  });
  if (groups.size === 0) return { status: 'not-needed' };

  const output = texts.map(() => '');
  for (const [sourceLanguage, indices] of groups) {
    const groupLines = indices.map((i) => lyrics.lines[i]!);
    const key = `${provider.id}:${trackId}:${sourceLanguage}>${targetLanguage}:${hashString(groupLines.map((l) => l.text).join('\n'))}`;
    let translated = cache.get(key);
    if (!translated) {
      if (provider.availability) {
        const availability = await provider.availability(sourceLanguage, targetLanguage);
        if (availability === 'needs-download') return { status: 'needs-download', sourceLanguage };
        if (availability === 'unavailable') {
          return { status: 'unavailable', message: 'Translation for this language is not available on this device.' };
        }
      }
      try {
        translated = await provider.translateLines(groupLines, sourceLanguage, targetLanguage);
      } catch (error) {
        if (error instanceof TranslationUnavailableError && error.reason === 'needs-download') {
          return { status: 'needs-download', sourceLanguage };
        }
        return {
          status: 'unavailable',
          message: error instanceof Error ? error.message : 'Translation failed.',
        };
      }
      if (translated.length !== groupLines.length) {
        return { status: 'unavailable', message: 'The translation provider returned an incomplete result.' };
      }
      cache.set(key, translated, TTL_MS);
    }
    indices.forEach((lineIndex, i) => {
      output[lineIndex] = translated![i] ?? '';
    });
  }
  return output.some(Boolean) ? { status: 'ready', lines: output } : { status: 'unavailable', message: 'No translation was produced.' };
}

/**
 * A curated translation first: its time segments are placed on the loaded
 * lines (see curated/align.ts) and only the lines no segment covers go to the
 * machine provider, when there is one. When the lyrics follow another timing
 * (a different LRCLIB record of another length) or no segment finds a line,
 * the curated translation is not used and plain machine translation runs.
 */
export async function translateWithCurated(
  provider: TranslationProvider | null,
  trackId: string,
  lyrics: TimedLyrics,
  match: CuratedMatch,
  targetLanguage: string,
  trackDurationMs?: number | null,
  cache: BoundedCache<string[]> = defaultCache,
): Promise<LyricTranslationResult> {
  const { timeline } = match.translation;
  const fallback = (message: string): Promise<LyricTranslationResult> | LyricTranslationResult => {
    devWarn(`"${match.note.key}": ${message} Using machine translation.`);
    return provider ? translateLyrics(provider, trackId, lyrics, targetLanguage, cache) : { status: 'unavailable', message };
  };
  if (!lyricsMatchTiming(lyrics.timing, timeline.timing)) {
    return fallback(
      `the lyrics (LRCLIB ${lyrics.timing?.lrclibId ?? '?'}, ${lyrics.timing?.durationMs ?? '?'} ms) are not the version the curated ` +
        `translation was timed on (LRCLIB ${timeline.timing.lrclibId}, ${timeline.timing.durationMs} ms).`,
    );
  }
  const aligned = alignSegments(lyrics.lines, timeline.segments, lyrics.timing?.durationMs ?? trackDurationMs);
  if (aligned.anchored === 0) return fallback('no curated segment falls on these lyrics.');

  const lines = [...aligned.lines];
  const machine: number[] = [];
  if (provider && aligned.uncovered.length > 0) {
    const rest: TimedLyrics = { ...lyrics, lines: aligned.uncovered.map((index) => lyrics.lines[index]!) };
    const result = await translateLyrics(provider, trackId, rest, targetLanguage, cache);
    if (result.status === 'ready') {
      aligned.uncovered.forEach((lineIndex, i) => {
        const text = result.lines[i]?.trim();
        if (!text) return;
        lines[lineIndex] = text;
        machine.push(lineIndex);
      });
    }
  }
  const total = lyrics.lines.filter((line) => line.text.trim()).length;
  return {
    status: 'ready',
    lines,
    curated: { match, total, covered: total - aligned.uncovered.length, segmentOf: aligned.segmentOf, continued: aligned.continued, machine },
  };
}
