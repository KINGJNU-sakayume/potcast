/**
 * One-time migration of the retired hash-keyed curated translations into song notes.
 *
 *   npm run notes:migrate -- --dry-run
 *   npm run notes:migrate
 *   npm run notes:migrate -- --only lemon --file /scratch/outside/the/repo/lemon.lrc
 *   npm run notes:migrate -- --lrc-dir /scratch/lrc        # <key>.lrc per song, when lrclib.net is unreachable
 *
 * For each `src/translations/<artist>/<key>.json`:
 *   1. finds the song note (shared track ID, then title + artist name) and merges trackIds / titles, or creates a
 *      translation-only note;
 *   2. moves the brief into the note's `translation:` block, the reasoning into `## 번역에 대하여`, the sources into
 *      the note's sources;
 *   3. places each hashed line on the LRCLIB record (`lyricsSource.id`) and writes `<key>.translation.json` with one
 *      segment `[line start, next line start)` per translated line.
 *
 * The original lines live only in memory. Only the report is printed; nothing with lyrics is written.
 * Any failure is listed and makes the command exit 1, so the old files are never removed silently.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadArtistNotes } from '../src/editorial/loadNotes';
import { parseLrc } from '../src/lyrics/lrc';
import { normaliseLines } from '../src/lyrics/lyricSync';
import { LRCLIB_BASE_URL, type LrclibRecord } from '../src/lyrics/providers/LrclibLyricsProvider';
import type { TimedLyricLine } from '../src/lyrics/types';
import { findNoteFor, lrclibIdOf, migrateSong, readLegacyTranslation, type ExistingNote, type LegacyTranslation, type MigratedSong } from './migrate/migrate';

const CLIENT = 'ARC Music notes migration (https://github.com/KINGJNU-sakayume/player2)';

function args(): Map<string, string> {
  const map = new Map<string, string>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    if (!flag.startsWith('--')) continue;
    const value = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[(i += 1)]! : 'true';
    map.set(flag.slice(2), value);
  }
  return map;
}

function filesIn(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

async function lrclibRecord(id: number): Promise<LrclibRecord> {
  let response: Response;
  try {
    response = await fetch(`${LRCLIB_BASE_URL}/get/${id}`, { headers: { 'Lrclib-Client': CLIENT } });
  } catch (error) {
    throw new Error(
      `lrclib.net is unreachable (${error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : error}); ` +
        'pass --lrc-dir or --file with LRC files kept outside the repository.',
    );
  }
  if (!response.ok) throw new Error(`LRCLIB responded ${response.status} for record ${id}.`);
  return (await response.json()) as LrclibRecord;
}

/** The record's lines exactly as the app shows them, plus the record's timing. */
async function lyricsFor(
  legacy: LegacyTranslation,
  options: Map<string, string>,
): Promise<{ lines: TimedLyricLine[]; timing: { lrclibId: number; durationMs: number } }> {
  const lrclibId = lrclibIdOf(legacy);
  if (!lrclibId) throw new Error('the file has no LRCLIB lyricsSource.id to place its lines on.');
  const localPath = options.get('only') === legacy.key && options.get('file') ? options.get('file')! : options.get('lrc-dir') ? join(options.get('lrc-dir')!, `${legacy.key}.lrc`) : null;
  if (localPath && existsSync(localPath)) {
    const durationMs = legacy.lyricsSource?.durationMs;
    if (!durationMs) throw new Error('a local LRC needs lyricsSource.durationMs in the old file.');
    return { lines: normaliseLines(parseLrc(readFileSync(localPath, 'utf8'))), timing: { lrclibId, durationMs: Math.round(durationMs) } };
  }
  const record = await lrclibRecord(lrclibId);
  if (!record.syncedLyrics) throw new Error(`LRCLIB record ${lrclibId} has no synced lyrics.`);
  if (typeof record.duration !== 'number') throw new Error(`LRCLIB record ${lrclibId} has no duration.`);
  return { lines: normaliseLines(parseLrc(record.syncedLyrics)), timing: { lrclibId: record.id, durationMs: Math.round(record.duration * 1000) } };
}

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

async function main(): Promise<void> {
  const options = args();
  const dryRun = options.has('dry-run');
  const translationsDir = options.get('translations') ?? 'src/translations';
  const notesDir = options.get('notes') ?? 'src/editorial/notes/songs';
  const artistsDir = options.get('artists') ?? 'src/editorial/notes/artists';
  const only = options.get('only');

  const legacyPaths = filesIn(translationsDir, /\.json$/).sort();
  if (legacyPaths.length === 0) {
    console.log(`No legacy translation files in ${translationsDir}: nothing to migrate.`);
    return;
  }
  const artists = loadArtistNotes(Object.fromEntries(filesIn(artistsDir, /\.md$/).map((path) => [path, readFileSync(path, 'utf8')])));
  const notes: ExistingNote[] = filesIn(notesDir, /\.md$/).map((path) => ({
    key: path.replace(/^.*\//, '').replace(/\.md$/, ''),
    source: readFileSync(path, 'utf8'),
  }));

  const results: MigratedSong[] = [];
  const failures: { file: string; reason: string }[] = [];
  const claimed = new Map<string, string>();

  for (const path of legacyPaths) {
    const file = relative(process.cwd(), path);
    try {
      const legacy = readLegacyTranslation(file, JSON.parse(readFileSync(path, 'utf8')));
      if (only && legacy.key !== only) continue;
      const note = findNoteFor(legacy, notes, artists);
      const key = note?.key ?? legacy.key;
      if (!note && notes.some((existing) => existing.key === key)) {
        throw new Error(`a different song already has the note ${key}.md (no shared track ID, title or artist name).`);
      }
      if (claimed.has(key)) throw new Error(`${key}.md is already claimed by ${claimed.get(key)}.`);
      claimed.set(key, file);
      const { lines, timing } = await lyricsFor(legacy, options);
      const result = migrateSong({ legacy, note, artists, lines, timing });
      results.push(result);
      if (!dryRun) {
        writeFileSync(join(notesDir, `${result.key}.md`), result.markdown);
        writeFileSync(join(notesDir, `${result.key}.translation.json`), result.timelineJson);
      }
    } catch (error) {
      failures.push({ file, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(`notes:migrate${dryRun ? ' (dry run: nothing written)' : ''} — ${results.length} migrated, ${failures.length} failed\n`);
  console.log('note                       action   segments  lines  untranslated  unmatched keys  coverage');
  for (const result of results) {
    const { totalLines, translatedLines, unmatchedKeys } = result.segments;
    console.log(
      [
        result.key.padEnd(26),
        result.action.padEnd(8),
        String(result.segments.timeline.segments.length).padStart(8),
        String(totalLines).padStart(6),
        String(totalLines - translatedLines).padStart(13),
        String(unmatchedKeys.length).padStart(15),
        percent(translatedLines, totalLines).padStart(9),
      ].join(' '),
    );
  }
  const gaps = results.filter((result) => result.missingArtistNames.length);
  if (gaps.length) {
    console.log('\nartistNames from the old files that the artist note does not list (add them to `names` if Spotify shows them):');
    for (const result of gaps) console.log(`  ${result.key}: ${result.missingArtistNames.join(', ')}`);
  }
  const merged = results.filter((result) => result.action === 'merged').map((result) => result.key);
  const created = results.filter((result) => result.action === 'created').map((result) => result.key);
  console.log(`\nmerged into existing notes (${merged.length}): ${merged.join(', ') || '—'}`);
  console.log(`new translation-only notes (${created.length}): ${created.join(', ') || '—'}`);
  const total = results.reduce((sum, result) => sum + result.segments.totalLines, 0);
  const translated = results.reduce((sum, result) => sum + result.segments.translatedLines, 0);
  console.log(`overall coverage: ${translated} / ${total} lines (${percent(translated, total)})`);
  if (failures.length) {
    console.log('\nFAILED — keep the old files until these are resolved:');
    for (const failure of failures) console.log(`  ${failure.file}: ${failure.reason}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
