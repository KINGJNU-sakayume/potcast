import type { FieldReader } from '../../editorial/frontmatter';
import {
  SPEECH_LEVELS,
  type SpeechLevel,
  type TermMapping,
  type TranslationBrief,
  type TranslationSegment,
  type TranslationTimeline,
} from './types';

/**
 * Validation for a curated translation: the brief in the note's frontmatter
 * and the timed segments in `<song-key>.translation.json`. Errors name the
 * file and the field, so `npm run test:run` points at the mistake.
 */

export class CuratedTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CuratedTranslationError';
  }
}

/** A segment may end a little after LRCLIB's duration (the last line runs to the end of the track). */
export const DURATION_SLACK_MS = 3000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Keys that would hold the original lyrics. They are never allowed in a translation file. */
const ORIGINAL_TEXT_KEYS = ['text', 'original', 'source', 'lyrics', 'lyric', 'line', 'lines', 'originalText', 'sourceText'];

const BRIEF_KEYS = [
  'sourceLanguage',
  'targetLanguage',
  'register',
  'speaker',
  'addressee',
  'relationship',
  'situation',
  'pronouns',
  'glossary',
  'written',
  'updated',
];

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The note's `translation:` block. */
export function parseTranslationBrief(fields: FieldReader): TranslationBrief {
  for (const key of fields.keys()) {
    if (!BRIEF_KEYS.includes(key)) fields.fail(`unknown field "translation.${key}" (allowed: ${BRIEF_KEYS.join(', ')}).`);
  }
  const register = fields.string('register');
  if (!SPEECH_LEVELS.includes(register as SpeechLevel)) fields.fail(`"translation.register" must be one of ${SPEECH_LEVELS.join(', ')}.`);
  const date = (key: string, required: boolean): string | undefined => {
    const value = required ? fields.string(key) : fields.optionalString(key);
    if (value !== undefined && !ISO_DATE.test(value)) fields.fail(`"translation.${key}" must be a YYYY-MM-DD date.`);
    return value;
  };
  const terms = (key: string): TermMapping[] | undefined =>
    fields.optionalMapList(key)?.map((term) => {
      for (const field of term.keys()) {
        if (!['source', 'target', 'note'].includes(field)) term.fail(`unknown field "${field}" in translation.${key} (allowed: source, target, note).`);
      }
      const note = term.optionalString('note');
      return { source: term.string('source'), target: term.string('target'), ...(note ? { note } : {}) };
    });
  const relationship = fields.optionalString('relationship');
  const situation = fields.optionalString('situation');
  const pronouns = terms('pronouns');
  const glossary = terms('glossary');
  const updated = date('updated', false);
  return {
    sourceLanguage: fields.string('sourceLanguage'),
    targetLanguage: fields.string('targetLanguage'),
    register: register as SpeechLevel,
    speaker: fields.string('speaker'),
    addressee: fields.string('addressee'),
    ...(relationship ? { relationship } : {}),
    ...(situation ? { situation } : {}),
    ...(pronouns?.length ? { pronouns } : {}),
    ...(glossary?.length ? { glossary } : {}),
    written: date('written', true)!,
    ...(updated ? { updated } : {}),
  };
}

/** `<song-key>.translation.json` (schema version 2: timed segments, no original text). */
export function parseTranslationTimeline(file: string, raw: unknown): TranslationTimeline {
  const fail = (message: string): never => {
    throw new CuratedTranslationError(`${file}: ${message}`);
  };
  const onlyKeys = (obj: Json, allowed: readonly string[], where: string) => {
    for (const key of Object.keys(obj)) {
      if (ORIGINAL_TEXT_KEYS.includes(key)) {
        fail(`"${where}${key}" is not allowed: translation files never store the original lyrics (only times and translations).`);
      }
      if (!allowed.includes(key)) fail(`unknown field "${where}${key}" (allowed: ${allowed.join(', ')}).`);
    }
  };
  const milliseconds = (obj: Json, key: string, where: string): number => {
    const value = obj[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail(`"${where}${key}" must be a whole number of milliseconds.`);
    return value as number;
  };

  if (!isObject(raw)) fail('the file must contain one JSON object.');
  const root = raw as Json;
  onlyKeys(root, ['schemaVersion', 'timing', 'segments'], '');
  if (root.schemaVersion !== 2) fail('"schemaVersion" must be 2.');

  if (!isObject(root.timing)) fail('"timing" must be { "lrclibId": …, "durationMs": … }.');
  const timingRaw = root.timing as Json;
  onlyKeys(timingRaw, ['lrclibId', 'durationMs'], 'timing.');
  const lrclibId = timingRaw.lrclibId;
  if (typeof lrclibId !== 'number' || !Number.isInteger(lrclibId) || lrclibId <= 0) fail('"timing.lrclibId" must be the LRCLIB record ID.');
  const durationMs = milliseconds(timingRaw, 'durationMs', 'timing.');
  if (durationMs === 0) fail('"timing.durationMs" must be greater than 0.');

  if (!Array.isArray(root.segments) || root.segments.length === 0) fail('"segments" must be a non-empty list.');
  const segments: TranslationSegment[] = (root.segments as unknown[]).map((entry, i) => {
    const where = `segments[${i}].`;
    if (!isObject(entry)) fail(`"segments[${i}]" must be an object.`);
    const segment = entry as Json;
    onlyKeys(segment, ['startMs', 'endMs', 'translation'], where);
    const startMs = milliseconds(segment, 'startMs', where);
    const endMs = milliseconds(segment, 'endMs', where);
    if (startMs >= endMs) fail(`"${where}startMs" must be before "${where}endMs".`);
    if (endMs > durationMs + DURATION_SLACK_MS) fail(`"${where}endMs" is after the end of the track (timing.durationMs + 3 s).`);
    const translation = segment.translation;
    if (typeof translation !== 'string' || !translation.trim()) fail(`"${where}translation" must be non-empty text.`);
    return { startMs, endMs, translation: (translation as string).trim() };
  });
  segments.forEach((segment, i) => {
    const previous = segments[i - 1];
    if (!previous) return;
    if (segment.startMs < previous.startMs) fail(`segments must be sorted by startMs (segments[${i}] starts before segments[${i - 1}]).`);
    if (segment.startMs < previous.endMs) fail(`segments[${i}] overlaps segments[${i - 1}].`);
  });

  return { schemaVersion: 2, timing: { lrclibId: lrclibId as number, durationMs }, segments };
}
