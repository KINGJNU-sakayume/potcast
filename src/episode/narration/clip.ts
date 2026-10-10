import { withoutUnspokenMarks } from '../speechText';

/**
 * Recorded narration: the hosts' lines synthesised ahead of time with
 * Supertonic 3 and played back as audio files, so every browser and phone
 * hears the same voices and nothing has to be downloaded or computed while
 * listening.
 *
 * This file is the contract between the two sides. The render script
 * (scripts/narration) turns every utterance of every script into a clip; the
 * app (recordedNarrator.ts) finds the clip for the utterance it is about to
 * say. Both get from an utterance to a clip the same way: `clipText`, then
 * `clipKey`. A line whose clip is missing is said by the browser's own voice.
 */

/**
 * What produced the clips. The id is part of every clip key, so changing the
 * model, the number of steps, the speed, or how the audio is finished
 * (scripts/narration/audio.ts) renders everything again.
 */
export const NARRATION_ENGINE = {
  id: 'supertonic-3/steps-10/speed-1.05/finish-3',
  name: 'Supertonic 3',
  steps: 10,
  speed: 1.05,
  language: 'ko',
} as const;

/** The preset voices of Supertonic 3. */
export const RECORDED_VOICES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'] as const;
export type RecordedVoice = (typeof RECORDED_VOICES)[number];

/** In Supertone's own words, shortened. */
export const VOICE_CHARACTER: Record<RecordedVoice, string> = {
  F1: 'calm, slightly low',
  F2: 'bright, cheerful',
  F3: 'clear, announcer-like',
  F4: 'crisp, confident',
  F5: 'kind, gentle',
  M1: 'lively, upbeat',
  M2: 'deep, composed',
  M3: 'polished, authoritative',
  M4: 'soft, friendly',
  M5: 'warm, storytelling',
};

/**
 * The voices of the first and second host when a script names none: the two
 * that speak Korean at the same unhurried pace (F4 and M3 are about a fifth
 * faster than the other eight).
 */
export const DEFAULT_HOST_VOICES: readonly RecordedVoice[] = ['F3', 'M5'];

export function isRecordedVoice(value: string): value is RecordedVoice {
  return (RECORDED_VOICES as readonly string[]).includes(value);
}

/** What every voice says in its sample, for choosing hosts. */
export const SAMPLE_TEXT = '안녕하세요. 오늘은 이 목소리로 앨범 한 장을 처음부터 끝까지 같이 듣겠습니다.';

/**
 * How to say something that is written differently: an English title, a
 * number, an abbreviation. `from` is matched as written in the script.
 */
export interface SayRule {
  from: string;
  to: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Applies the rules in one pass, longest first, so "GONE, GONE" wins over
 * "GONE" and a replacement is never replaced again. A rule that starts or
 * ends with a letter or digit only matches at a word boundary: "Run" is left
 * alone inside "Running".
 */
export function applySay(text: string, rules: readonly SayRule[]): string {
  if (rules.length === 0) return text;
  const sorted = [...rules].sort((a, b) => b.from.length - a.from.length);
  const pattern = sorted
    .map((rule) => {
      const head = /^[A-Za-z0-9]/.test(rule.from) ? '(?<![A-Za-z0-9])' : '';
      const tail = /[A-Za-z0-9]$/.test(rule.from) ? '(?![A-Za-z0-9])' : '';
      return `${head}${escapeRegExp(rule.from)}${tail}`;
    })
    .join('|');
  const byFrom = new Map(sorted.map((rule) => [rule.from, rule.to]));
  return text.replace(new RegExp(pattern, 'g'), (match) => byFrom.get(match) ?? match);
}

/** An utterance as the recorded voice is given it: readings applied, title marks off, expression tags kept. */
export function clipText(utterance: string, say: readonly SayRule[] = []): string {
  return withoutUnspokenMarks(applySay(utterance, say));
}

/** FNV-1a, 64 bits, over the string's UTF-16 code units: the same in Node and in every browser. */
export function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    hash = BigInt.asUintN(64, (hash ^ BigInt(unit & 0xff)) * prime);
    hash = BigInt.asUintN(64, (hash ^ BigInt(unit >> 8)) * prime);
  }
  return hash.toString(16).padStart(16, '0');
}

/** The name of the clip for `text` (from `clipText`) in `voice`. */
export function clipKey(voice: string, text: string): string {
  return fnv1a64(`${NARRATION_ENGINE.id}\n${voice}\n${text}`);
}

/** Where a clip lives, under the store and under the site's `narration/` folder. */
export function clipPath(key: string): string {
  return `clips/${key.slice(0, 2)}/${key}.mp3`;
}

/** `narration/index.json`: the clips the site has, for the scripts it was built from. */
export interface NarrationManifest {
  version: 1;
  engine: { id: string; name: string };
  /** Clip key → length in milliseconds. */
  clips: Record<string, number>;
  /** Voice → the key of its sample clip. */
  samples: Record<string, string>;
}

export function isNarrationManifest(value: unknown): value is NarrationManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Partial<NarrationManifest>;
  return manifest.version === 1 && typeof manifest.clips === 'object' && manifest.clips !== null && typeof manifest.engine?.id === 'string';
}
