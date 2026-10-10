/**
 * Writing tool for curated lyric translations (see .claude/skills/translate-lyrics).
 *
 *   npm run lyrics:lines -- --title "Lemon" --artist "Kenshi Yonezu" [--album "Lemon"] [--duration 4:15]
 *   npm run lyrics:lines -- --id 123456
 *       Add --lang ja|ko|zh|en (the song's lyric language) to skip romanised / translated uploads and to refuse an --id
 *       whose lyrics are in another language.
 *       Prints the LRCLIB record, the "timing" object for <song-key>.translation.json, and one row per lyric
 *       line: number, startMs, endMs (the next line's start), original text. Segments are written in these times.
 *
 *   npm run lyrics:lines -- --file /path/outside/the/repo/lemon.lrc [--duration 4:15]
 *       The same table from a local LRC file, for when lrclib.net is unreachable. Keep that file outside the
 *       repository (e.g. a scratch directory); it must be LRCLIB's lyrics for the times to match in the app.
 *
 *   npm run lyrics:lines -- --check lemon [--file …]
 *       Loads src/editorial/notes/songs/lemon.md + lemon.translation.json, fetches the LRCLIB record in
 *       "timing", and reports segment starts more than 400 ms from any line start, lines no segment covers,
 *       and an LRCLIB ID or length that does not match "timing". Exits 1 on any problem.
 *
 * The original lyrics are only printed to the terminal — never write them to a file in this repository.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadSongNotes } from '../src/editorial/loadNotes';
import { parseLrc } from '../src/lyrics/lrc';
import { normaliseLines } from '../src/lyrics/lyricSync';
import { LRCLIB_BASE_URL, recordToTimedLyrics, type LrclibRecord } from '../src/lyrics/providers/LrclibLyricsProvider';
import type { TimedLyrics } from '../src/lyrics/types';
import { checkTimeline, formatLineTable } from '../src/translation/curated/authoring';
import { sameLanguage } from '../src/translation/languageDetect';

const NOTES_DIR = 'src/editorial/notes/songs';
const CLIENT = 'ARC Music translation tool (https://github.com/KINGJNU-sakayume/player2)';

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

function seconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  return parts.length === 2 ? parts[0]! * 60 + parts[1]! : parts[0];
}

async function lrclib<T>(path: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${LRCLIB_BASE_URL}${path}`, { headers: { 'Lrclib-Client': CLIENT } });
  } catch (error) {
    throw new Error(
      `lrclib.net is unreachable (${error instanceof Error ? (error.cause as Error | undefined)?.message ?? error.message : error}). ` +
        'Behind a proxy, run with NODE_USE_ENV_PROXY=1; in a sandbox, lrclib.net must be an allowed host.',
    );
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`LRCLIB responded ${response.status}.`);
  return (await response.json()) as T;
}

async function findRecord(options: Map<string, string>): Promise<LrclibRecord> {
  const id = options.get('id');
  if (id) {
    const record = await lrclib<LrclibRecord>(`/get/${encodeURIComponent(id)}`);
    if (!record) throw new Error(`No LRCLIB record ${id}.`);
    return record;
  }
  const title = options.get('title');
  const artist = options.get('artist');
  if (!title || !artist) throw new Error('Pass --title and --artist (optionally --album, --duration m:ss), or --id.');
  const duration = seconds(options.get('duration'));

  const query = new URLSearchParams({ track_name: title, artist_name: artist });
  if (options.get('album')) query.set('album_name', options.get('album')!);
  if (duration) query.set('duration', String(duration));
  const exact = options.get('album') && duration ? await lrclib<LrclibRecord>(`/get?${query.toString()}`) : null;
  if (exact?.syncedLyrics) return exact;

  const results = (await lrclib<LrclibRecord[]>(`/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`)) ?? [];
  const lang = options.get('lang');
  const withLyrics = results.filter((record) => record.syncedLyrics);
  const synced = withLyrics.filter((record) => matchesLanguage(record, lang));
  if (synced.length === 0) {
    throw new Error(
      withLyrics.length === 0
        ? 'LRCLIB has no synced lyrics for this search.'
        : `LRCLIB has ${withLyrics.length} synced candidate(s), none in --lang ${lang} (romanised or translated uploads only). Try --id or --file.`,
    );
  }
  if (lang && synced.length < withLyrics.length) console.error(`Skipped ${withLyrics.length - synced.length} candidate(s) not in --lang ${lang}.`);
  console.error('Candidates (pick one with --id if the first is not the right version):');
  for (const record of synced.slice(0, 8)) {
    console.error(`  --id ${record.id}  ${record.trackName} — ${record.artistName} / ${record.albumName ?? '?'} (${record.duration ?? '?'} s, ${recordToTimedLyrics(record)?.language ?? '?'})`);
  }
  const best = duration ? synced.find((record) => Math.abs((record.duration ?? 0) - duration) <= 3) : undefined;
  return best ?? synced[0]!;
}

/**
 * Candidates whose lyrics are not in the song's language (romanised or English-only uploads of J-pop / K-pop)
 * are dropped. Without --lang nothing is filtered.
 */
function matchesLanguage(record: LrclibRecord, lang: string | undefined): boolean {
  if (!lang) return true;
  return sameLanguage(recordToTimedLyrics(record)?.language, lang);
}

function readLocalLyrics(path: string, durationMs: number | null): TimedLyrics {
  const lines = normaliseLines(parseLrc(readFileSync(path, 'utf8')));
  if (lines.length === 0) throw new Error(`${path} has no timed LRC lines (segments need times).`);
  return { lines, timing: { lrclibId: null, durationMs } };
}

function recordLyrics(record: LrclibRecord): TimedLyrics {
  const lyrics = recordToTimedLyrics(record);
  if (!lyrics || lyrics.lines.length === 0) throw new Error(`LRCLIB record ${record.id} has no synced lyrics.`);
  return { ...lyrics, lines: normaliseLines(lyrics.lines) };
}

async function check(key: string, options: Map<string, string>): Promise<void> {
  const notePath = join(NOTES_DIR, `${key}.md`);
  const timelinePath = join(NOTES_DIR, `${key}.translation.json`);
  if (!existsSync(notePath)) throw new Error(`No song note ${notePath}.`);
  if (!existsSync(timelinePath)) throw new Error(`No ${timelinePath} next to the note.`);
  const [note] = loadSongNotes({ [notePath]: readFileSync(notePath, 'utf8') }, { [timelinePath]: JSON.parse(readFileSync(timelinePath, 'utf8')) });
  const timeline = note!.translation!.timeline;
  const localPath = options.get('file');
  const lyrics = localPath
    ? readLocalLyrics(localPath, timeline.timing.durationMs)
    : recordLyrics((await lrclib<LrclibRecord>(`/get/${timeline.timing.lrclibId}`)) ?? missing(timeline.timing.lrclibId));
  const report = checkTimeline(lyrics, timeline);
  const problems: string[] = [];
  if (!localPath && !report.lrclibIdMatches) problems.push(`LRCLIB returned record ${lyrics.timing?.lrclibId}, not ${timeline.timing.lrclibId}.`);
  if (!localPath && !report.durationMatches) {
    problems.push(`LRCLIB record length ${lyrics.timing?.durationMs ?? '?'} ms differs from timing.durationMs ${timeline.timing.durationMs} ms by more than 3 s.`);
  }
  for (const item of report.offGrid) {
    problems.push(`segment ${item.segment} starts at ${item.startMs} ms, ${item.nearestLineMs === null ? 'with no line' : `${Math.abs(item.startMs - item.nearestLineMs)} ms from the nearest line start (${item.nearestLineMs})`}.`);
  }
  for (const row of report.uncovered) problems.push(`line ${row.number} (${row.startMs}–${row.endMs ?? '?'} ms) has no segment: ${row.text}`);

  console.log(`${key}: ${timeline.segments.length} segments cover ${report.covered} / ${report.total} lines${localPath ? ` (local file ${basename(localPath)}: ID and length not checked)` : ''}`);
  for (const problem of problems) console.log(`  ${problem}`);
  if (problems.length) process.exitCode = 1;
}

function missing(id: number): never {
  throw new Error(`No LRCLIB record ${id}.`);
}

async function main(): Promise<void> {
  const options = args();
  const checkKey = options.get('check');
  if (checkKey) return check(basename(checkKey).replace(/\.(md|translation\.json)$/, ''), options);

  const localPath = options.get('file');
  if (localPath) {
    const durationS = seconds(options.get('duration'));
    const lyrics = readLocalLyrics(localPath, durationS ? durationS * 1000 : null);
    console.log(`Local file ${basename(localPath)} — use LRCLIB's own record for "timing" (the app matches segments against it).`);
    console.log('');
    console.log(formatLineTable(lyrics, lyrics.timing?.durationMs));
    return;
  }

  const record = await findRecord(options);
  const lyrics = recordLyrics(record);
  const lang = options.get('lang');
  if (lang && !sameLanguage(lyrics.language, lang)) {
    throw new Error(`LRCLIB ${record.id} lyrics look ${lyrics.language ?? 'unknown'}, not --lang ${lang}: likely a romanised or translated upload.`);
  }
  console.log(`LRCLIB ${record.id}: ${record.trackName} — ${record.artistName} / ${record.albumName ?? '?'} (${record.duration ?? '?'} s, ${lyrics.language ?? '?'})`);
  console.log(`"timing": ${JSON.stringify(lyrics.timing && { lrclibId: lyrics.timing.lrclibId, durationMs: lyrics.timing.durationMs })}`);
  console.log('');
  console.log('  #  startMs    endMs  original (terminal only — never copy into the repository)');
  console.log(formatLineTable(lyrics, lyrics.timing?.durationMs));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
