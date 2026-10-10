/**
 * Writing tool for notes (see .claude/skills/write-note): checks notes against the quality floor in
 * src/editorial/quality.ts, the same check `npm run check` runs.
 *
 *   npm run notes:audit                       every note, one row each
 *   npm run notes:audit -- the-weeknd         the notes of one artist (artist key)
 *   npm run notes:audit -- songs/starboy …    particular notes (artists/<key>, albums/<key>, songs/<key>)
 *
 * Prints length, paragraphs, `short` length, sources and the `번역에 대하여` length per note, then each
 * problem. Notes listed in PENDING_REVIEW are marked "pending". Exits 1 when a note outside PENDING_REVIEW
 * falls below the floor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAlbumNotes, loadArtistNotes, loadSongNotes, type NoteFiles, type TranslationFiles } from '../src/editorial/loadNotes';
import { auditNotes, PENDING_REVIEW, type NoteAudit } from '../src/editorial/quality';

const NOTES_DIR = 'src/editorial/notes';

function read(kind: string, extension: string): Record<string, string> {
  const dir = join(NOTES_DIR, kind);
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(extension))) {
    files[`./notes/${kind}/${name}`] = readFileSync(join(dir, name), 'utf8');
  }
  return files;
}

const songFiles: NoteFiles = read('songs', '.md');
const translationFiles: TranslationFiles = Object.fromEntries(
  Object.entries(read('songs', '.translation.json')).map(([path, text]) => [path, JSON.parse(text) as unknown]),
);
const audits = auditNotes(loadArtistNotes(read('artists', '.md')), loadAlbumNotes(read('albums', '.md')), loadSongNotes(songFiles, translationFiles));

const filters = process.argv.slice(2).filter((arg) => arg !== '--');
const selected = filters.length
  ? audits.filter((audit) => filters.some((filter) => audit.id === filter || audit.artist === filter))
  : audits;
if (filters.length && selected.length === 0) {
  console.error(`No notes match ${filters.join(', ')}. Use an artist key or artists/<key>, albums/<key>, songs/<key>.`);
  process.exit(1);
}

const pad = (value: string | number, width: number) => String(value).padStart(width);
console.log(`${'note'.padEnd(56)} ${pad('body', 5)} ${pad('¶', 2)} ${pad('short', 5)} ${pad('src', 3)} ${pad('번역', 4)}  status`);
const status = (audit: NoteAudit) => (audit.problems.length === 0 ? 'ok' : PENDING_REVIEW.has(audit.id) ? 'pending' : 'BELOW FLOOR');
for (const audit of selected) {
  console.log(
    `${audit.id.padEnd(56)} ${pad(audit.bodyLength, 5)} ${pad(audit.paragraphs, 2)} ${pad(audit.shortLength, 5)} ${pad(audit.sources, 3)} ${pad(audit.translationAbout ?? '-', 4)}  ${status(audit)}`,
  );
  for (const problem of audit.problems) console.log(`    - ${problem}`);
}

const failing = selected.filter((audit) => audit.problems.length > 0 && !PENDING_REVIEW.has(audit.id));
console.log(`\n${selected.length} notes: ${selected.filter((audit) => audit.problems.length === 0).length} ok, ${failing.length} below the floor.`);
process.exit(failing.length > 0 ? 1 : 0);
