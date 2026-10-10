import { hashString } from '../../src/lib/hash';

/**
 * The line hash the retired hash-keyed translation files (`src/translations/`)
 * used, moved here unchanged from `src/translation/curated/lineHash.ts`: only
 * `npm run notes:migrate` still needs it, to place those files' lines on an
 * LRCLIB record. The app no longer matches lyrics by hash.
 */

/**
 * The form of a lyric line that curated translations are keyed by: width,
 * case, curly quotes and spacing differences between lyric sources (or
 * between two uploads of the same lyrics) do not change the key.
 */
export function normaliseLyricLine(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** 8 hex characters; `null` for a line with no text (instrumental gaps). */
export function lyricLineHash(text: string): string | null {
  const normalised = normaliseLyricLine(text);
  return normalised ? hashString(normalised) : null;
}

export const LINE_KEY = /^[0-9a-f]{8}(?:#[1-9]\d*)?$/;
