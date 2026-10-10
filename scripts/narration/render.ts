/**
 * Records the hosts: every utterance of every episode script, said by Supertonic 3 and saved as an MP3 clip.
 *
 *   npm run narration                 render the clips that are missing, then publish
 *   npm run narration -- --check      only report what is missing, then publish what there is
 *
 *   --store <dir>    where clips are kept between runs            (default .narration)
 *   --out <dir>      where the site's copy is written             (default public/narration)
 *   --report <file>  also write the report there, as Markdown
 *   --max <n>        render at most n clips in this run
 *
 * The store only grows: a clip is named after the voice and the exact text it says (src/episode/narration/clip.ts),
 * so a line that has not changed is never rendered twice and an edited line simply gets a new clip. "Publishing"
 * copies the clips the current scripts need into the site and writes their index; the app plays those and lets
 * the browser's own voice say any line that has none. A site built without any of this (no store, no
 * `public/narration`) simply has no recordings and works as it did before there were any.
 *
 * In GitHub Actions the store is the repository's `narration` branch (see scripts/narration/store.sh). The model
 * (about 400 MB) is downloaded from Hugging Face on the first render; set SUPERTONIC_DIR to use a copy on disk.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clipPath, NARRATION_ENGINE, type NarrationManifest } from '../../src/episode/narration/clip';
import { episodeClips, readAsWritten, sampleClips, type PlannedClip } from '../../src/episode/narration/plan';
import { parseEpisodeScript } from '../../src/episode/script';
import { estimateSpeechMs } from '../../src/episode/speechText';
import { encodeMp3, finishClip, MP3_BITRATE } from './audio';
import { ensureModel, MODEL, modelDirectory } from './model';
import { Supertonic } from './supertonic';

const EPISODES_DIR = 'src/editorial/notes/episodes';

interface StoredClip {
  ms: number;
  voice: string;
  text: string;
  engine: string;
}

interface Wanted extends PlannedClip {
  /** The episodes (or "samples") that use the clip. */
  uses: Set<string>;
}

function option(name: string): string | undefined {
  const args = process.argv.slice(2);
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
}

const check = process.argv.includes('--check');
const storeDir = option('store') ?? '.narration';
const outDir = option('out') ?? 'public/narration';
const reportFile = option('report');
const max = option('max') === undefined ? Number.POSITIVE_INFINITY : Number(option('max'));

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
const minutes = (ms: number): string => `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
const log = (line: string): void => console.log(line);

/* ── What the scripts need ─────────────────────────────────────────────── */

const scripts = readdirSync(EPISODES_DIR)
  .filter((entry) => entry.endsWith('.md'))
  .sort()
  .map((name) => parseEpisodeScript(`./notes/episodes/${name}`, readFileSync(path.join(EPISODES_DIR, name), 'utf8')));

const wanted = new Map<string, Wanted>();
const want = (clip: PlannedClip, use: string) => {
  const entry = wanted.get(clip.key) ?? { ...clip, uses: new Set<string>() };
  entry.uses.add(use);
  wanted.set(clip.key, entry);
};
// The samples come first: they are few, and they are how a voice is chosen before a whole episode is rendered in it.
const samples = sampleClips();
for (const clip of samples) want(clip, 'samples');
for (const script of scripts) for (const clip of episodeClips(script)) want(clip, script.key);

/* ── What the store has ────────────────────────────────────────────────── */

// A clip is two files, `<key>.mp3` and `<key>.json`. There is no index of the whole store to keep in step,
// so two renders at once (a pull request and a deploy) can both add to it without stepping on each other.
const clipFile = (key: string): string => path.join(storeDir, clipPath(key));
const infoFile = (key: string): string => clipFile(key).replace(/\.mp3$/, '.json');
const known = new Map<string, StoredClip | null>();
function stored(key: string): StoredClip | null {
  if (!known.has(key)) {
    let info: StoredClip | null = null;
    if (existsSync(clipFile(key)) && existsSync(infoFile(key))) {
      try {
        info = JSON.parse(readFileSync(infoFile(key), 'utf8')) as StoredClip;
      } catch {
        info = null;
      }
    }
    known.set(key, info && info.ms > 0 ? info : null);
  }
  return known.get(key)!;
}
function store(key: string, audio: Uint8Array, info: StoredClip): void {
  mkdirSync(path.dirname(clipFile(key)), { recursive: true });
  writeFileSync(clipFile(key), audio);
  writeFileSync(infoFile(key), `${JSON.stringify(info, null, 1)}\n`);
  known.set(key, info);
}

const missing = [...wanted.values()].filter((clip) => !stored(clip.key));
log(`${wanted.size} clips needed, ${wanted.size - missing.length} in the store, ${missing.length} to render.`);

/* ── Rendering ─────────────────────────────────────────────────────────── */

const failures: Array<{ clip: Wanted; error: string }> = [];
const odd: string[] = [];
const unknownCharacters = new Map<string, number>();
let rendered = 0;
let renderedAudioMs = 0;
let renderMs = 0;
let loadMs = 0;
let modelNote = '';
let fatal = '';

if (!check && missing.length > 0) {
  try {
    const dir = modelDirectory();
    await ensureModel(dir, [...new Set(missing.map((clip) => clip.voice))], log);
    const loadStarted = Date.now();
    const tts = await Supertonic.load(dir);
    loadMs = Date.now() - loadStarted;
    modelNote = tts.describe();
    log(`model loaded in ${seconds(loadMs)}\n${modelNote}`);

    const renderStarted = Date.now();
    for (const clip of missing.slice(0, max)) {
      try {
        const synthesis = await tts.synthesize(clip.text, clip.voice, {
          language: NARRATION_ENGINE.language,
          steps: NARRATION_ENGINE.steps,
          speed: NARRATION_ENGINE.speed,
          seed: Number.parseInt(clip.key.slice(0, 8), 16),
        });
        for (const character of synthesis.unknown) unknownCharacters.set(character, (unknownCharacters.get(character) ?? 0) + 1);
        const finished = finishClip(synthesis.samples, synthesis.sampleRate);
        // A clip far shorter or longer than the line would take to say usually means the model skipped or repeated something.
        const expected = estimateSpeechMs(clip.text);
        if (finished.ms < expected * 0.4 || finished.ms > expected * 2.5) odd.push(`${clip.voice} ${seconds(finished.ms)} (expected about ${seconds(expected)}): ${clip.text}`);
        store(clip.key, await encodeMp3(finished.samples, synthesis.sampleRate), { ms: finished.ms, voice: clip.voice, text: clip.text, engine: NARRATION_ENGINE.id });
        rendered += 1;
        renderedAudioMs += finished.ms;
        if (rendered % 20 === 0) {
          log(`${rendered} / ${Math.min(missing.length, max)} rendered (${seconds(renderedAudioMs)} of speech in ${seconds(Date.now() - renderStarted)})`);
        }
      } catch (error) {
        failures.push({ clip, error: error instanceof Error ? error.message : String(error) });
        // The same failure over and over is a broken setup, not a difficult line.
        if (failures.length >= 5 && rendered === 0) throw new Error(`The first ${failures.length} clips all failed; the last error was: ${failures.at(-1)!.error}`);
      }
    }
    renderMs = Date.now() - renderStarted;
  } catch (error) {
    fatal = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
}

/* ── Publishing ────────────────────────────────────────────────────────── */

const manifest: NarrationManifest = { version: 1, engine: { id: NARRATION_ENGINE.id, name: NARRATION_ENGINE.name }, clips: {}, samples: {} };
rmSync(outDir, { recursive: true, force: true });
let publishedBytes = 0;
let publishedMs = 0;
for (const clip of wanted.values()) {
  const info = stored(clip.key);
  if (!info) continue;
  const target = path.join(outDir, clipPath(clip.key));
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(clipFile(clip.key), target);
  publishedBytes += statSync(target).size;
  publishedMs += info.ms;
  manifest.clips[clip.key] = info.ms;
}
for (const clip of samples) if (manifest.clips[clip.key] !== undefined) manifest.samples[clip.voice] = clip.key;
const published = Object.keys(manifest.clips).length;
// Without a single clip the site gets no index at all, and the app uses the browser's voice throughout.
if (published > 0) writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(manifest));

/* ── Report ────────────────────────────────────────────────────────────── */

const stillMissing = [...wanted.values()].filter((clip) => !stored(clip.key));
const perUse = new Map<string, { total: number; ready: number; ms: number }>();
for (const clip of wanted.values()) {
  for (const use of clip.uses) {
    const entry = perUse.get(use) ?? { total: 0, ready: 0, ms: 0 };
    entry.total += 1;
    const info = stored(clip.key);
    if (info) {
      entry.ready += 1;
      entry.ms += info.ms;
    }
    perUse.set(use, entry);
  }
}
const asWritten = new Map<string, number>();
for (const clip of wanted.values()) {
  if (clip.uses.size === 1 && clip.uses.has('samples')) continue;
  for (const word of readAsWritten(clip.text)) asWritten.set(word, (asWritten.get(word) ?? 0) + 1);
}
const counted = (map: Map<string, number>): string =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word, count]) => (count > 1 ? `${word} ×${count}` : word))
    .join(', ');

const lines: string[] = [];
lines.push(`### Narration · ${NARRATION_ENGINE.name}`);
lines.push('');
lines.push(`- **${published} of ${wanted.size} clips published** (${minutes(publishedMs)} of speech, ${(publishedBytes / 1_000_000).toFixed(1)} MB as ${MP3_BITRATE} kbit/s MP3).`);
for (const [use, entry] of perUse) lines.push(`  - \`${use}\`: ${entry.ready} / ${entry.total} clips, ${minutes(entry.ms)}`);
if (rendered > 0) {
  lines.push(
    `- Rendered ${rendered} new clips: ${minutes(renderedAudioMs)} of speech in ${minutes(renderMs)} (${(renderedAudioMs / Math.max(1, renderMs)).toFixed(2)}× real time on ${os.cpus().length} CPUs; model loaded in ${seconds(loadMs)}).`,
  );
} else if (check) {
  lines.push(`- Check only: nothing was rendered.`);
} else if (missing.length === 0) {
  lines.push(`- Nothing new to render: every clip was already in the store.`);
}
if (stillMissing.length > 0) lines.push(`- **${stillMissing.length} clips are missing**; the browser's voice says those lines.`);
if (failures.length > 0) lines.push(`- **${failures.length} clips failed to render.**`);
lines.push(`- Engine \`${NARRATION_ENGINE.id}\`, model \`${MODEL.repository}@${MODEL.revision.slice(0, 8)}\`.`);
if (unknownCharacters.size > 0) lines.push(`- Characters the model has no token for (left out): ${counted(unknownCharacters)}`);
if (asWritten.size > 0) lines.push(`- Left for the voice to read as written (candidates for \`say\`): ${counted(asWritten)}`);
const details = (title: string, body: string) => lines.push('', `<details><summary>${title}</summary>`, '', '```', body, '```', '', '</details>');
if (fatal) details('The render stopped on an error', fatal);
if (failures.length > 0) details('Failed clips', failures.map(({ clip, error }) => `${clip.voice} ${clip.text}\n  ${error}`).join('\n'));
if (odd.length > 0) details(`${odd.length} clips with an unexpected length`, odd.join('\n'));
if (modelNote) details('Model', modelNote);

const report = `${lines.join('\n')}\n`;
log(`\n${report}`);
if (reportFile) writeFileSync(reportFile, report);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `missing=${stillMissing.length}\nrendered=${rendered}\nfailed=${failures.length}\npublished=${published}\n`);
}
if (fatal || failures.length > 0) process.exitCode = 1;
