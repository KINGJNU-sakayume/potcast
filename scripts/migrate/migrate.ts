import { FieldReader, parseFrontmatter, type FrontmatterMap } from '../../src/editorial/frontmatter';
import { loadSongNotes, splitSongBody, TRANSLATION_HEADING } from '../../src/editorial/loadNotes';
import { namesMatch, normaliseTitle } from '../../src/editorial/lookup';
import type { ArtistNote } from '../../src/editorial/types';
import type { TimedLyricLine } from '../../src/lyrics/types';
import { parseTranslationTimeline } from '../../src/translation/curated/parse';
import { SPEECH_LEVELS, type SpeechLevel, type TermMapping, type TranslationBrief, type TranslationTimeline } from '../../src/translation/curated/types';
import { LINE_KEY, lyricLineHash } from './legacyLineHash';
import { writeSongNote, type SongNoteFields } from './noteWriter';

/**
 * The pure part of `npm run notes:migrate`: one retired hash-keyed translation
 * file (`src/translations/<artist>/<key>.json`) plus the song's note (if any)
 * plus the LRCLIB lines it was written against → one song note with a
 * `translation:` block and `## 번역에 대하여` section, and a
 * `<key>.translation.json` of timed segments.
 *
 * The original lines are used only in memory (to find each hash's time);
 * nothing returned here contains them.
 */

export interface LegacyTranslation {
  /** File name without extension. */
  key: string;
  /** Directory name: the artist note key. */
  artistKey: string;
  path: string;
  trackIds: string[];
  titles: string[];
  artistNames: string[];
  sourceLanguage: string;
  targetLanguage: string;
  lyricsSource?: { provider: string; id?: number | string; durationMs?: number };
  brief: {
    speaker: string;
    addressee: string;
    relationship?: string;
    situation?: string;
    register: SpeechLevel;
    pronouns?: TermMapping[];
    glossary?: TermMapping[];
    reasoning: string;
    sources?: string[];
  };
  lines: Record<string, string>;
  written: string;
  updated?: string;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a file in the retired format (the shape the old `parse.ts` accepted). */
export function readLegacyTranslation(path: string, raw: unknown): LegacyTranslation {
  const fail = (message: string): never => {
    throw new Error(`${path}: ${message}`);
  };
  if (!isObject(raw)) fail('not a JSON object.');
  const root = raw as Json;
  const text = (obj: Json, key: string, required = true): string | undefined => {
    const value = obj[key];
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string' || !value.trim()) fail(`"${key}" must be non-empty text.`);
    return (value as string).trim();
  };
  const texts = (obj: Json, key: string): string[] => {
    const value = obj[key] ?? [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) fail(`"${key}" must be a list of text.`);
    return (value as string[]).map((item) => item.trim()).filter(Boolean);
  };
  const terms = (obj: Json, key: string): TermMapping[] | undefined => {
    const value = obj[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) fail(`"brief.${key}" must be a list.`);
    return (value as Json[]).map((term) => {
      const note = text(term, 'note', false);
      return { source: text(term, 'source')!, target: text(term, 'target')!, ...(note ? { note } : {}) };
    });
  };
  if (!isObject(root.brief)) fail('"brief" is required.');
  const brief = root.brief as Json;
  if (!SPEECH_LEVELS.includes(brief.register as SpeechLevel)) fail('"brief.register" is not a speech level.');
  if (!isObject(root.lines)) fail('"lines" is required.');
  const lines: Record<string, string> = {};
  for (const [key, value] of Object.entries(root.lines as Json)) {
    if (!LINE_KEY.test(key)) fail(`line key "${key}" is not a line hash.`);
    if (typeof value !== 'string' || !value.trim()) fail(`line "${key}" has no translation.`);
    lines[key] = (value as string).trim();
  }
  const source = isObject(root.lyricsSource) ? (root.lyricsSource as Json) : undefined;
  const segments = path.split('/');
  return {
    key: segments[segments.length - 1]!.replace(/\.json$/, ''),
    artistKey: segments[segments.length - 2] ?? '',
    path,
    trackIds: texts(root, 'trackIds'),
    titles: texts(root, 'titles'),
    artistNames: texts(root, 'artistNames'),
    sourceLanguage: text(root, 'sourceLanguage')!,
    targetLanguage: text(root, 'targetLanguage')!,
    lyricsSource: source
      ? {
          provider: String(source.provider ?? ''),
          id: source.id as number | string | undefined,
          durationMs: typeof source.durationMs === 'number' ? source.durationMs : undefined,
        }
      : undefined,
    brief: {
      speaker: text(brief, 'speaker')!,
      addressee: text(brief, 'addressee')!,
      relationship: text(brief, 'relationship', false),
      situation: text(brief, 'situation', false),
      register: brief.register as SpeechLevel,
      pronouns: terms(brief, 'pronouns'),
      glossary: terms(brief, 'glossary'),
      reasoning: text(brief, 'reasoning')!,
      sources: brief.sources === undefined ? undefined : texts(brief, 'sources'),
    },
    lines,
    written: text(root, 'written')!,
    updated: text(root, 'updated', false),
  };
}

/** The LRCLIB record a legacy file was written against, as the migration sees it. */
export function lrclibIdOf(legacy: LegacyTranslation): number | null {
  const id = Number(legacy.lyricsSource?.id);
  return legacy.lyricsSource?.provider === 'lrclib' && Number.isInteger(id) && id > 0 ? id : null;
}

export interface ExistingNote {
  key: string;
  /** The note file's text. */
  source: string;
}

const SONG_NOTE_FIELDS = ['artist', 'trackIds', 'titles', 'short', 'written', 'updated', 'sources'];

/** The note the translation belongs to: a shared Spotify track ID, then a title + one of the artist's names. */
export function findNoteFor(legacy: LegacyTranslation, notes: readonly ExistingNote[], artists: readonly ArtistNote[]): ExistingNote | null {
  const parsed = notes.map((note) => ({ note, data: parseFrontmatter(note.source).data }));
  const list = (data: FrontmatterMap, key: string) => (Array.isArray(data[key]) ? (data[key] as string[]) : []);
  const byId = parsed.find(({ data }) => list(data, 'trackIds').some((id) => legacy.trackIds.includes(id)));
  if (byId) return byId.note;
  const titles = new Set(legacy.titles.map(normaliseTitle));
  const byName = parsed.find(({ data }) => {
    const artist = artists.find((entry) => entry.key === data.artist);
    return (
      list(data, 'titles').some((title) => titles.has(normaliseTitle(title))) &&
      Boolean(artist) &&
      namesMatch(artist!.names, legacy.artistNames)
    );
  });
  return byName?.note ?? null;
}

export interface SegmentResult {
  timeline: TranslationTimeline;
  /** Lines with text in the LRCLIB record. */
  totalLines: number;
  /** Of those, lines that got a segment. */
  translatedLines: number;
  /** Keys of the legacy file that no line of the record matched. */
  unmatchedKeys: string[];
}

/**
 * Hash → line → segment `[line start, next line start)` (the last line runs to
 * `durationMs`). `<hash>#n` is the n-th occurrence of that line; a plain
 * `<hash>` covers every occurrence that has no `#n` of its own.
 */
export function buildSegments(
  lines: readonly TimedLyricLine[],
  legacyLines: Readonly<Record<string, string>>,
  timing: { lrclibId: number; durationMs: number },
  file = 'segments',
): SegmentResult {
  const seen = new Map<string, number>();
  const used = new Set<string>();
  const segments: TranslationTimeline['segments'] = [];
  let totalLines = 0;
  lines.forEach((line, index) => {
    const hash = lyricLineHash(line.text);
    if (!hash) return;
    totalLines += 1;
    const occurrence = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, occurrence);
    const key = `${hash}#${occurrence}` in legacyLines ? `${hash}#${occurrence}` : hash in legacyLines ? hash : null;
    if (!key) return;
    used.add(key);
    const next = lines[index + 1];
    segments.push({ startMs: line.startMs, endMs: next ? next.startMs : timing.durationMs, translation: legacyLines[key]! });
  });
  // Validated exactly as the app will read it.
  const timeline = parseTranslationTimeline(file, { schemaVersion: 2, timing, segments });
  return {
    timeline,
    totalLines,
    translatedLines: segments.length,
    unmatchedKeys: Object.keys(legacyLines).filter((key) => !used.has(key)),
  };
}

export interface MigratedSong {
  /** Key of the note written (the existing note's key when merged). */
  key: string;
  action: 'merged' | 'created';
  markdown: string;
  timelineJson: string;
  /** Legacy `artistNames` that the artist note's `names` does not list. */
  missingArtistNames: string[];
  segments: SegmentResult;
}

const union = (a: readonly string[] = [], b: readonly string[] = []): string[] => [...new Set([...a, ...b])];

/** Titles that differ only in case or brackets count once (the note's spelling wins). */
function mergeTitles(note: readonly string[], legacy: readonly string[]): string[] {
  const out = [...note];
  for (const title of legacy) if (!out.some((t) => normaliseTitle(t) === normaliseTitle(title))) out.push(title);
  return out;
}

export function migrateSong({
  legacy,
  note,
  artists,
  lines,
  timing,
}: {
  legacy: LegacyTranslation;
  note: ExistingNote | null;
  artists: readonly ArtistNote[];
  lines: readonly TimedLyricLine[];
  timing: { lrclibId: number; durationMs: number };
}): MigratedSong {
  const key = note?.key ?? legacy.key;
  const segments = buildSegments(lines, legacy.lines, timing, `${key}.translation.json`);
  const brief: TranslationBrief = {
    sourceLanguage: legacy.sourceLanguage,
    targetLanguage: legacy.targetLanguage,
    register: legacy.brief.register,
    speaker: legacy.brief.speaker,
    addressee: legacy.brief.addressee,
    ...(legacy.brief.relationship ? { relationship: legacy.brief.relationship } : {}),
    ...(legacy.brief.situation ? { situation: legacy.brief.situation } : {}),
    ...(legacy.brief.pronouns?.length ? { pronouns: legacy.brief.pronouns } : {}),
    ...(legacy.brief.glossary?.length ? { glossary: legacy.brief.glossary } : {}),
    written: legacy.written,
    ...(legacy.updated ? { updated: legacy.updated } : {}),
  };
  const section = `${TRANSLATION_HEADING}\n\n${legacy.brief.reasoning.trim()}`;

  let fields: SongNoteFields;
  let body: string;
  let artistKey: string;
  if (note) {
    const { data, body: existingBody } = parseFrontmatter(note.source);
    const reader = new FieldReader(data, `${note.key}.md`);
    for (const field of reader.keys()) {
      if (field === 'translation') throw new Error(`${note.key}.md already has a translation block.`);
      if (!SONG_NOTE_FIELDS.includes(field)) throw new Error(`${note.key}.md has a field the migration does not know: ${field}.`);
    }
    if (splitSongBody(existingBody).about !== null) throw new Error(`${note.key}.md already has a "${TRANSLATION_HEADING}" section.`);
    artistKey = reader.string('artist');
    fields = {
      artist: artistKey,
      trackIds: union(reader.optionalList('trackIds'), legacy.trackIds),
      titles: mergeTitles(reader.list('titles'), legacy.titles),
      short: reader.optionalString('short'),
      written: reader.optionalString('written'),
      updated: reader.optionalString('updated'),
      sources: union(reader.optionalList('sources'), legacy.brief.sources),
      translation: brief,
    };
    body = existingBody.trim() ? `${existingBody.trim()}\n\n${section}` : section;
  } else {
    artistKey = legacy.artistKey;
    if (!artists.some((artist) => artist.key === artistKey)) throw new Error(`${legacy.path}: no artist note "${artistKey}" for a new song note.`);
    fields = {
      artist: artistKey,
      trackIds: legacy.trackIds,
      titles: legacy.titles,
      written: legacy.written,
      updated: legacy.updated,
      sources: legacy.brief.sources,
      translation: brief,
    };
    body = section;
  }

  const markdown = writeSongNote(fields, body);
  const timelineJson = `${JSON.stringify(segments.timeline, null, 2)}\n`;
  verifyRoundTrip(key, markdown, timelineJson, fields, brief, legacy.brief.reasoning);

  const knownNames = artists.find((artist) => artist.key === artistKey)?.names ?? [];
  return {
    key,
    action: note ? 'merged' : 'created',
    markdown,
    timelineJson,
    missingArtistNames: legacy.artistNames.filter((name) => !namesMatch(knownNames, [name])),
    segments,
  };
}

/** Reads the written note back through the app's own loader and checks nothing was lost. */
function verifyRoundTrip(
  key: string,
  markdown: string,
  timelineJson: string,
  fields: SongNoteFields,
  brief: TranslationBrief,
  reasoning: string,
): void {
  const [loaded] = loadSongNotes({ [`${key}.md`]: markdown }, { [`${key}.translation.json`]: JSON.parse(timelineJson) }, { strict: true });
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const words = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim();
  const problems = [
    !same(loaded?.trackIds, fields.trackIds ?? []) && 'trackIds',
    !same(loaded?.titles, fields.titles) && 'titles',
    words(loaded?.short) !== words(fields.short) && 'short',
    !same(loaded?.sources ?? [], fields.sources ?? []) && 'sources',
    !same(normaliseBrief(loaded?.translation?.brief), normaliseBrief(brief)) && 'translation block',
    loaded?.translation?.about !== reasoning.trim() && 'section',
  ].filter(Boolean);
  if (problems.length) throw new Error(`${key}.md does not read back the same: ${problems.join(', ')}.`);
}

/** The brief as the reader returns it: whitespace in folded text collapses to single spaces. */
function normaliseBrief(brief: TranslationBrief | undefined): unknown {
  return JSON.parse(JSON.stringify(brief ?? null), (_key, value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value));
}
