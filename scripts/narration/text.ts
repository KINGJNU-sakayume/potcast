/**
 * Text preparation for Supertonic 3, kept as close to Supertone's reference
 * implementation as possible (supertone-oss-archive/supertonic, web/helper.js,
 * MIT): the model was trained on text prepared this way.
 */

export const SUPERTONIC_LANGUAGES = [
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu',
  'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na',
] as const;

const EMOJI =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;

const REPLACEMENTS: Array<[string, string]> = [
  ['–', '-'],
  ['‑', '-'],
  ['—', '-'],
  ['_', ' '],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['´', "'"],
  ['`', "'"],
  ['[', ' '],
  [']', ' '],
  ['|', ' '],
  ['/', ' '],
  ['#', ' '],
  ['→', ' '],
  ['←', ' '],
];

const EXPRESSIONS: Array<[string, string]> = [
  ['@', ' at '],
  ['e.g.,', 'for example, '],
  ['i.e.,', 'that is, '],
];

/** The text as the model reads it, wrapped in its language tags. */
export function prepareText(input: string, language: string): string {
  if (!(SUPERTONIC_LANGUAGES as readonly string[]).includes(language)) {
    throw new Error(`Invalid language: ${language}. Available: ${SUPERTONIC_LANGUAGES.join(', ')}`);
  }
  // NFKD also takes Hangul syllables apart into jamo, which is how the model's vocabulary has them.
  let text = input.normalize('NFKD').replace(EMOJI, '');
  for (const [from, to] of REPLACEMENTS) text = text.replaceAll(from, to);
  text = text.replace(/[♥☆♡©\\]/g, '');
  for (const [from, to] of EXPRESSIONS) text = text.replaceAll(from, to);

  text = text
    .replace(/ ,/g, ',')
    .replace(/ \./g, '.')
    .replace(/ !/g, '!')
    .replace(/ \?/g, '?')
    .replace(/ ;/g, ';')
    .replace(/ :/g, ':')
    .replace(/ '/g, "'");
  while (text.includes('""')) text = text.replace('""', '"');
  while (text.includes("''")) text = text.replace("''", "'");
  while (text.includes('``')) text = text.replace('``', '`');
  text = text.replace(/\s+/g, ' ').trim();

  // A line that does not end in punctuation gets a full stop, so the voice lands it.
  if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(text)) text += '.';
  return `<${language}>${text}</${language}>`;
}

/**
 * The model's token for each UTF-16 unit of `text`, and the characters it has
 * no token for. Those are left out here (the reference passes -1 through,
 * which an embedding lookup reads as "the last token").
 */
export function textIds(text: string, indexer: readonly number[]): { ids: number[]; unknown: string[] } {
  const ids: number[] = [];
  const unknown: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    const id = unit < indexer.length ? indexer[unit]! : -1;
    if (id < 0) unknown.push(text[i]!);
    else ids.push(id);
  }
  return { ids, unknown };
}

/** The longest text the model is given at once: Korean and Japanese pack more speech into a character. */
export function maxChunkLength(language: string): number {
  return language === 'ko' || language === 'ja' ? 120 : 300;
}
