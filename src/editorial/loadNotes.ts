import { parseTranslationBrief, parseTranslationTimeline } from '../translation/curated/parse';
import type { SongTranslation } from '../translation/curated/types';
import { FieldReader, fileKey, FrontmatterError, parseFrontmatter } from './frontmatter';
import { SONG_LYRICS_LANGUAGES, type AlbumNote, type ArtistEra, type ArtistNote, type EditorialBody, type SongLyricsLanguage, type SongNote } from './types';

/**
 * Turns the Markdown note files into typed notes. The file name is the key
 * (`notes/albums/stray-sheep.md` → `stray-sheep`); the frontmatter holds the
 * match fields and the `short` preview; the body is the long-form note.
 *
 * A malformed file throws with its path, so `npm run test:run` catches it.
 */

/** `{ path: raw file text }`, as `import.meta.glob(…, { query: '?raw', eager: true })` returns. */
export type NoteFiles = Record<string, string>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dates(fields: FieldReader, file: string): Pick<EditorialBody, 'written' | 'updated'> {
  const written = fields.optionalString('written');
  const updated = fields.optionalString('updated');
  for (const date of [written, updated]) {
    if (date !== undefined && !ISO_DATE.test(date)) throw new FrontmatterError(`${file}: dates must be YYYY-MM-DD, got "${date}".`);
  }
  return { written, updated };
}

function body(fields: FieldReader, full: string, file: string): EditorialBody {
  return {
    short: fields.string('short'),
    full: full || undefined,
    ...dates(fields, file),
    sources: fields.optionalList('sources'),
  };
}

function imageUrl(fields: FieldReader, key: string): string | undefined {
  const url = fields.optionalString(key);
  if (url !== undefined && !/^https:\/\/\S+$/.test(url)) fields.fail(`"${key}" must be an https:// image URL, got "${url}".`);
  return url;
}

const ERA_LINE = /^(\d{4})(?:\s*([–—-])\s*(\d{4})?)?\s*[·:|]\s*(.+)$/;

/** `2012–2015 · title`, `2020– · title` (ongoing) or `2009 · title` (one year). */
export function parseEra(line: string, file: string): ArtistEra {
  const match = ERA_LINE.exec(line.trim());
  if (!match) throw new FrontmatterError(`${file}: era "${line}" must look like "2012–2015 · title".`);
  const from = Number(match[1]);
  const to = match[3] ? Number(match[3]) : match[2] ? null : from;
  if (to !== null && to < from) throw new FrontmatterError(`${file}: era "${line}" ends before it starts.`);
  return { from, to, title: match[4]!.trim() };
}

function load<T>(files: NoteFiles, build: (key: string, fields: FieldReader, full: string, file: string) => T): T[] {
  return Object.keys(files)
    .sort()
    .map((file) => {
      const { data, body: full } = parseFrontmatter(files[file]!);
      return build(fileKey(file), new FieldReader(data, file), full, file);
    });
}

export function loadArtistNotes(files: NoteFiles): ArtistNote[] {
  return load(files, (key, fields, full, file) => ({
    key,
    artistIds: fields.list('artistIds'),
    names: fields.list('names'),
    origin: fields.optionalString('origin'),
    eras: fields.optionalList('eras')?.map((line) => parseEra(line, file)).sort((a, b) => a.from - b.from),
    image: imageUrl(fields, 'image'),
    discography: fields.optionalList('discography'),
    ...body(fields, full, file),
  }));
}

export function loadAlbumNotes(files: NoteFiles): AlbumNote[] {
  return load(files, (key, fields, full, file) => ({
    key,
    artist: fields.string('artist'),
    albumIds: fields.optionalList('albumIds') ?? [],
    titles: fields.list('titles'),
    releaseYear: fields.optionalNumber('releaseYear'),
    cover: imageUrl(fields, 'cover'),
    tracks: fields.optionalList('tracks'),
    ...body(fields, full, file),
  })).sort((a, b) => a.artist.localeCompare(b.artist) || (a.releaseYear ?? 0) - (b.releaseYear ?? 0) || a.key.localeCompare(b.key));
}

/** `{ path: parsed JSON }` for `notes/songs/*.translation.json`, as `import.meta.glob(…, { import: 'default', eager: true })` returns. */
export type TranslationFiles = Record<string, unknown>;

/** The reserved heading that starts a song note's translation section. */
export const TRANSLATION_HEADING = '## 번역에 대하여';
const TRANSLATION_SECTION = /^##[ \t]+번역에 대하여[ \t]*$/m;

/** Splits a song note's body into the listening note and the `## 번역에 대하여` section (without its heading). */
export function splitSongBody(full: string): { listening: string; about: string | null } {
  const match = TRANSLATION_SECTION.exec(full);
  if (!match) return { listening: full.trim(), about: null };
  return { listening: full.slice(0, match.index).trim(), about: full.slice(match.index + match[0].length).trim() };
}

export interface SongNoteOptions {
  /**
   * true (tests, tools): any problem throws. false (the app): a broken
   * translation is dropped from its note with a warning, so one bad file never
   * takes the other songs (or the note itself) down.
   */
  strict?: boolean;
  warn?: (message: string) => void;
}

/** `notes/songs/lemon.translation.json` → `lemon`. */
export function translationFileKey(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.translation\.json$/, '');
}

export function loadSongNotes(files: NoteFiles, translationFiles: TranslationFiles = {}, options: SongNoteOptions = {}): SongNote[] {
  const strict = options.strict ?? true;
  const report = (error: unknown) => {
    if (strict) throw error;
    options.warn?.(`Curated translation skipped: ${error instanceof Error ? error.message : String(error)}`);
  };
  const timelines = new Map(Object.keys(translationFiles).map((path) => [translationFileKey(path), path]));
  const notes = load(files, (key, fields, full, file): SongNote => {
    const block = fields.optionalMap('translation');
    const { listening, about } = splitSongBody(full);
    const timelinePath = timelines.get(key);
    timelines.delete(key);

    let translation: SongTranslation | undefined;
    try {
      if (block && !timelinePath) throw new FrontmatterError(`${file}: has a "translation" block but no ${key}.translation.json next to it.`);
      if (!block && timelinePath) throw new FrontmatterError(`${timelinePath}: has no "translation" block in ${file}.`);
      if (block && about === null) throw new FrontmatterError(`${file}: has a "translation" block but no "${TRANSLATION_HEADING}" section.`);
      if (!block && about !== null) throw new FrontmatterError(`${file}: has a "${TRANSLATION_HEADING}" section but no "translation" block.`);
      if (block && !about) throw new FrontmatterError(`${file}: the "${TRANSLATION_HEADING}" section is empty.`);
      if (block && timelinePath) {
        translation = {
          brief: parseTranslationBrief(block),
          about: about!,
          timeline: parseTranslationTimeline(timelinePath, translationFiles[timelinePath]),
        };
      }
    } catch (error) {
      report(error);
    }

    // A note with a translation block may skip the listening cue; any other song note needs one.
    const short = block ? fields.optionalString('short') : fields.string('short');
    const lyricsLanguage = fields.optionalString('lyricsLanguage');
    if (lyricsLanguage !== undefined && !SONG_LYRICS_LANGUAGES.includes(lyricsLanguage as SongLyricsLanguage)) {
      fields.fail(`"lyricsLanguage" must be one of ${SONG_LYRICS_LANGUAGES.join(', ')}, got "${lyricsLanguage}".`);
    }
    if (lyricsLanguage !== undefined && block) fields.fail('"lyricsLanguage" is for songs without a translation; this one has a "translation" block.');
    return {
      key,
      artist: fields.string('artist'),
      trackIds: fields.optionalList('trackIds') ?? [],
      titles: fields.list('titles'),
      ...(short ? { short } : {}),
      ...(lyricsLanguage ? { lyricsLanguage: lyricsLanguage as SongLyricsLanguage } : {}),
      full: listening || undefined,
      ...dates(fields, file),
      sources: fields.optionalList('sources'),
      ...(translation ? { translation } : {}),
    };
  });
  for (const path of timelines.values()) report(new FrontmatterError(`${path}: no song note with the same name.`));
  return notes;
}
