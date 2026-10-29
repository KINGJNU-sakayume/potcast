/**
 * Script-based language detection for lyric lines. Deliberately simple and
 * deterministic: kana → Japanese, Hangul → Korean, Han-only → Chinese (or
 * Japanese inside a Japanese song), Latin → English. Latin-script lyrics in
 * other languages are reported as English; a provider that detects languages
 * itself may ignore the hint.
 */

const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/u;
const KANA = /[぀-ゟ゠-ヿㇰ-ㇿｦ-ﾟ]/u;
const HAN = /[㐀-䶿一-鿿豈-﫿]/u;
const LATIN = /[A-Za-zÀ-ɏ]/u;

interface ScriptCounts {
  hangul: number;
  kana: number;
  han: number;
  latin: number;
}

function countScripts(text: string): ScriptCounts {
  const counts: ScriptCounts = { hangul: 0, kana: 0, han: 0, latin: 0 };
  for (const char of text) {
    if (HANGUL.test(char)) counts.hangul += 1;
    else if (KANA.test(char)) counts.kana += 1;
    else if (HAN.test(char)) counts.han += 1;
    else if (LATIN.test(char)) counts.latin += 1;
  }
  return counts;
}

export function detectLineLanguage(text: string): string | undefined {
  const { hangul, kana, han, latin } = countScripts(text);
  if (kana > 0) return 'ja';
  // Latin letters are ~3 per word vs 1–2 Hangul syllables per word.
  if (hangul > 0 && hangul * 2 >= latin) return 'ko';
  if (han > 0 && han * 2 >= latin) return 'zh';
  if (latin > 0) return 'en';
  if (hangul > 0) return 'ko';
  return undefined;
}

/** Dominant language across all lines. */
export function detectLyricsLanguage(lines: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const language = detectLineLanguage(line);
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  // Kanji-only lines inside a Japanese song are Japanese.
  if (counts.has('ja') && counts.has('zh')) {
    counts.set('ja', (counts.get('ja') ?? 0) + (counts.get('zh') ?? 0));
    counts.delete('zh');
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [language, count] of counts) {
    if (count > bestCount) {
      best = language;
      bestCount = count;
    }
  }
  return best;
}

/** Per-line languages, resolving Han-only lines with the song's dominant language. */
export function detectLineLanguages(lines: readonly string[], songLanguage?: string): Array<string | undefined> {
  const song = songLanguage ?? detectLyricsLanguage(lines);
  return lines.map((line) => {
    const language = detectLineLanguage(line);
    return language === 'zh' && song === 'ja' ? 'ja' : language;
  });
}

/** Two BCP 47 tags refer to the same language (`ko` vs `ko-KR`). */
export function sameLanguage(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.split('-')[0]!.toLowerCase() === b.split('-')[0]!.toLowerCase();
}

/** Share of lines in Korean / Japanese script from which lyrics count as the original, not a romanised or bilingual upload (~0.5). */
export const MIN_ORIGINAL_SCRIPT_SHARE = 0.7;

/**
 * Share of lines written in Korean or Japanese script. With `language` it counts that language only; without it, the
 * larger of Korean and Japanese. A romanised upload scores 0, genuine lyrics near 1, a line-by-line bilingual upload ~0.5.
 */
export function originalScriptShare(lines: readonly string[], language?: string): number {
  if (lines.length === 0) return 0;
  const languages = detectLineLanguages(lines);
  const share = (target: string): number => languages.filter((line) => sameLanguage(line, target)).length / lines.length;
  return language ? share(language) : Math.max(share('ko'), share('ja'));
}

/** Words common in English lyrics and absent from romanised Korean / Japanese ("are", "no", "me", "to" are romaji too, so they are left out). */
const ENGLISH_WORDS = new Set([
  'the', 'you', 'and', 'your', 'that', 'with', 'this', 'but', 'for', 'just', 'dont', 'cant', 'know', 'like', 'love',
  'baby', 'when', 'what', 'all', 'not', 'have', 'got', 'was', 'how', 'why', 'they', 'we',
]);

/** Share of the words that are common English words from which lyrics read as English. */
const MIN_ENGLISH_WORD_SHARE = 0.2;

/** Fewer words than this are too little text to tell romanised lyrics from English ones. */
const MIN_WORDS_TO_JUDGE = 12;

/**
 * Lyrics that may be a romanised upload of a Korean / Japanese song (or another non-English Latin-script language):
 * enough text to judge, mostly not in Hangul / kana, and not reading as English. Only a hint that a better upload is
 * worth looking for, never a reason to drop these lyrics.
 */
export function mayBeRomanised(lines: readonly string[]): boolean {
  const words = lines.join(' ').toLowerCase().match(/[a-z'’]+/g) ?? [];
  if (words.length < MIN_WORDS_TO_JUDGE) return false;
  if (originalScriptShare(lines) >= MIN_ORIGINAL_SCRIPT_SHARE) return false;
  const english = words.filter((word) => ENGLISH_WORDS.has(word.replace(/['’]/g, ''))).length;
  return english / words.length < MIN_ENGLISH_WORD_SHARE;
}

/** Share of lines in the expected language below which lyrics are taken for a romanised or translated upload. */
const MIN_EXPECTED_LINE_SHARE = 0.1;

/**
 * The language a track's lyrics should be in, when its metadata says so: kana / Hangul in the title, album or
 * artist, else the ISRC country (JP → Japanese, KR → Korean). Latin-only metadata of an unmarked track says nothing.
 */
export function expectedLyricsLanguage(track: { title: string; artists: ReadonlyArray<{ name: string }>; album: { name: string }; isrc?: string }): string | undefined {
  for (const text of [track.title, track.album.name, ...track.artists.map((artist) => artist.name)]) {
    const language = detectLineLanguage(text);
    if (language === 'ja' || language === 'ko') return language;
  }
  const country = track.isrc?.slice(0, 2).toUpperCase();
  if (country === 'JP') return 'ja';
  if (country === 'KR') return 'ko';
  return undefined;
}

/**
 * Whether lyrics are really in `expected`. J-pop / K-pop uploaded as romanisation or English only have no line in
 * the expected language, while genuine lyrics with English hooks still do.
 */
export function lyricsMatchLanguage(lines: readonly string[], expected: string | undefined): boolean {
  if (!expected || lines.length === 0) return true;
  const matching = detectLineLanguages(lines, expected).filter((language) => sameLanguage(language, expected)).length;
  return matching / lines.length >= MIN_EXPECTED_LINE_SHARE;
}
