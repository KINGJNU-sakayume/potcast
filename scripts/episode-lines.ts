/**
 * Writing tool for episodes (see .claude/skills/write-episode): the lyric lines a script can point at.
 *
 *   npm run episode:lines -- earfquake puppet     the numbered lines of these songs
 *   npm run episode:lines -- --album igor         the same for every track of an album note
 *
 * A script's `L14` is the 14th segment of the song's `<key>.translation.json`. This prints each with its
 * time range and translation, so a stretch such as `> play earfquake L14–L17` can be chosen from the
 * terminal. It reads only the repository; songs without a curated translation are listed as such (their
 * positions have to be written as m:ss).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAlbumNotes, loadSongNotes, type NoteFiles, type TranslationFiles } from '../src/editorial/loadNotes';

const NOTES_DIR = 'src/editorial/notes';

function read(kind: string, extension: string): Record<string, string> {
  const dir = join(NOTES_DIR, kind);
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(extension))) {
    files[`./notes/${kind}/${name}`] = readFileSync(join(dir, name), 'utf8');
  }
  return files;
}

/** m:ss.d */
function clock(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const seconds = (ms % 60_000) / 1000;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const albumFlag = args.indexOf('--album');
const albumKey = albumFlag >= 0 ? args[albumFlag + 1] : undefined;
const songKeys = args.filter((arg, index) => !arg.startsWith('--') && (albumFlag < 0 || index !== albumFlag + 1));

const songFiles: NoteFiles = read('songs', '.md');
const translationFiles: TranslationFiles = Object.fromEntries(
  Object.entries(read('songs', '.translation.json')).map(([path, text]) => [path, JSON.parse(text) as unknown]),
);
const songs = new Map(loadSongNotes(songFiles, translationFiles).map((note) => [note.key, note]));

let keys = songKeys;
if (albumKey) {
  const album = loadAlbumNotes(read('albums', '.md')).find((note) => note.key === albumKey);
  if (!album) {
    console.error(`No album note "${albumKey}" in ${NOTES_DIR}/albums.`);
    process.exit(1);
  }
  keys = [...(album.tracks ?? []), ...songKeys];
}
if (keys.length === 0) {
  console.error('Give song note keys, or --album <album note key>.');
  process.exit(1);
}

let missing = 0;
for (const key of keys) {
  const note = songs.get(key);
  if (!note) {
    console.log(`${key}: no song note with this key.\n`);
    missing += 1;
    continue;
  }
  const timeline = note.translation?.timeline;
  if (!timeline) {
    console.log(`${key} — ${note.titles[0]}: no curated translation (${note.lyricsLanguage ?? 'none'}); write positions as m:ss.\n`);
    continue;
  }
  console.log(`${key} — ${note.titles[0]} (${clock(timeline.timing.durationMs)}, ${timeline.segments.length} lines)`);
  timeline.segments.forEach((segment, index) => {
    console.log(`  ${`L${index + 1}`.padEnd(5)} ${clock(segment.startMs).padStart(7)}–${clock(segment.endMs).padEnd(7)}  ${segment.translation}`);
  });
  console.log('');
}
process.exit(missing > 0 ? 1 : 0);
