/**
 * Text helpers for narration: what is handed to the voice, how long a line
 * takes to say, and where a host's turn is cut into utterances.
 */

/**
 * Longest utterance, in characters: about nine seconds of Korean. Chrome cuts
 * off long utterances from its network voices after about fifteen seconds, and
 * pausing an episode restarts the utterance it interrupted, so short ones are
 * better on both counts.
 */
export const MAX_UTTERANCE_CHARS = 60;

/** Marks that are written but not spoken: title brackets, quotes, the `*` in "A BOY IS A GUN*". */
const UNSPOKEN = /[『』「」《》〈〉“”‘"*]/g;
/** A quote mark around a title; the apostrophe inside "IGOR'S" or "DON'T" stays. */
const QUOTE_MARK = /(?<![A-Za-z])['’]|['’](?![A-Za-z])/g;

/**
 * Sounds a recorded host can make in the middle of a line, written as
 * `<laugh>`. Only the recorded voice performs them; they are never shown and a
 * browser voice skips them.
 */
export const EXPRESSION_TAGS = ['laugh', 'breath', 'sigh'] as const;
const EXPRESSION_TAG = new RegExp(`\\s*<(?:${EXPRESSION_TAGS.join('|')})>\\s*`, 'g');
/** Anything else in angle brackets is a mistake in the script. */
const ANY_TAG = /<[^<>\s]*>/g;

/** The tags in a line that are not expression tags. */
export function unknownTags(text: string): string[] {
  return (text.match(ANY_TAG) ?? []).filter((tag) => !(EXPRESSION_TAGS as readonly string[]).includes(tag.slice(1, -1)));
}

/** The line as it is shown: without the sounds only a recorded voice makes. */
export function captionText(text: string): string {
  return text.replace(EXPRESSION_TAG, ' ').replace(/\s+([,.!?…])/g, '$1').replace(/\s+/g, ' ').trim();
}

/** Title brackets and quotes off, separators turned into pauses; expression tags are left alone. */
export function withoutUnspokenMarks(text: string): string {
  return text
    .replace(UNSPOKEN, '')
    .replace(QUOTE_MARK, '')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The line as a browser voice should say it. The captions keep the original. */
export function speechText(text: string): string {
  return withoutUnspokenMarks(captionText(text));
}

/**
 * Splits a host's turn into utterances: at sentence ends, and at a comma or a
 * space near the middle of a sentence that is still too long. Punctuation
 * inside a quoted title ("'ARE WE STILL FRIENDS?'는…") is not a sentence end.
 */
export function splitUtterances(text: string, maxChars = MAX_UTTERANCE_CHARS): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!'.!?…'.includes(text[i]!)) continue;
    const next = text[i + 1];
    // A sentence ends where the mark is followed by a space (or the text ends).
    if (next !== undefined && !/\s/.test(next)) continue;
    // "2019. 5. 17." and "feat. X": a full stop after a digit or an abbreviation stays inside the sentence.
    const before = text.slice(start, i);
    if (text[i] === '.' && next !== undefined && /(?:\d|\b(?:feat|ft|vs|mr|ms|dr|no|vol|st))$/i.test(before)) continue;
    const sentence = text.slice(start, i + 1).trim();
    if (sentence) sentences.push(sentence);
    start = i + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);

  const cut = (sentence: string): string[] => {
    if (sentence.length <= maxChars) return [sentence];
    const middle = Math.floor(sentence.length / 2);
    const nearest = (pattern: RegExp): number => {
      let best = -1;
      for (const match of sentence.matchAll(pattern)) {
        const at = match.index + match[0].length;
        if (at < 12 || at > sentence.length - 12) continue;
        if (best < 0 || Math.abs(at - middle) < Math.abs(best - middle)) best = at;
      }
      return best;
    };
    const comma = nearest(/[,，、;:]\s/g);
    const at = comma >= 0 && Math.abs(comma - middle) < sentence.length * 0.3 ? comma : nearest(/\s/g);
    if (at < 0) return [sentence];
    return [...cut(sentence.slice(0, at).trim()), ...cut(sentence.slice(at).trim())];
  };
  return sentences.flatMap(cut);
}

/**
 * About how long a line takes to say. Used to show a line for the right time
 * when no voice is available, to notice a voice that never finishes, and for
 * the episode's running time.
 */
export function estimateSpeechMs(text: string, rate = 1): number {
  const spoken = speechText(text);
  const hangul = (spoken.match(/[가-힣]/g) ?? []).length;
  const other = (spoken.match(/[A-Za-z0-9぀-ヿ一-鿿]/g) ?? []).length;
  const pauses = (spoken.match(/[,.!?…]/g) ?? []).length;
  // A Korean voice says about six syllables a second; Latin letters go by faster than syllables.
  const ms = hangul * 165 + other * 70 + pauses * 220 + 250;
  return Math.max(900, Math.round(ms / Math.min(2, Math.max(0.5, rate))));
}
