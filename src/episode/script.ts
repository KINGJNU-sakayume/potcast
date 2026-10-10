import { FieldReader, fileKey, FrontmatterError, parseFrontmatter } from '../editorial/frontmatter';
import { DEFAULT_HOST_VOICES, isRecordedVoice, RECORDED_VOICES, type SayRule } from './narration/clip';
import { EXPRESSION_TAGS, unknownTags } from './speechText';
import {
  EpisodeError,
  type EpisodeChapter,
  type EpisodeHost,
  type EpisodeScript,
  type ScriptCue,
  type ScriptMusicCue,
  type SpokenLine,
  type TimeRef,
} from './types';

/**
 * The episode script format. Frontmatter names the album note, the title and
 * the hosts; the body is read line by line:
 *
 * ```markdown
 * ---
 * album: igor
 * title: 『IGOR』 같이 듣기
 * hosts:
 *   a: 진행
 *   b: 해설
 * voices:                              the recorded voice of each host (F1–F5, M1–M5); optional
 *   a: F1
 *   b: M2
 * say:                                 how to say what is written differently; optional
 *   - EARFQUAKE = 어스퀘이크
 *   - 2019년 = 이천십구 년
 * ---
 *
 * ## 여는 말                           a chapter
 *
 * A: 오늘 들을 앨범은…                  talk; the music is stopped
 * B: 그 전에 하나만.
 *
 * > play igors-theme                   a whole track
 * > play earfquake 0:47–1:11           part of a track
 * > play earfquake L14–L17             lyric lines 14 to 17 of the song's curated translation
 * > play earfquake from 2:25           from a position to the end
 * > play a-song + the-next-song        tracks back to back
 * > play to 1:05                       let the current track run on to 1:05
 * > play earfquake to L5 | 첫 후렴까지   `|` adds what to listen for
 *
 * A~ 이 신스 베이스가…                  talk over the music, which is turned down
 * A: 그건 좀 심했죠. <laugh>            a sound the recorded voice makes: <laugh>, <breath> or <sigh>
 * <!-- a note to yourself -->
 * ```
 *
 * A line right under a host's line continues it; a blank line ends it.
 * Anything else is an error with its line number, so a mistyped script fails
 * the tests instead of silently skipping a line.
 */

const HOST_ID = /^[a-z][a-z0-9]{0,11}$/;
const SPEAKER_LINE = /^([A-Za-z][A-Za-z0-9]{0,11})([:~])\s+(\S.*)$/;
const HEADING = /^##\s+(\S.*)$/;
const DIRECTIVE = /^>\s*(\S+)(?:\s+(.*))?$/;
const COMMENT = /^<!--.*-->$/;
const TRACK_KEY = /^[a-z0-9][a-z0-9-]*$/;
const CLOCK = /^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/;
const LYRIC = /^L(\d+)(?:\.(start|end))?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A problem with one line of the script body. */
class LineError extends Error {}

const fail: (message: string) => never = (message) => {
  throw new LineError(message);
};

function parseRef(token: string, side: 'from' | 'until'): TimeRef | null {
  if (token === 'start') return { kind: 'start' };
  if (token === 'end') return { kind: 'end' };
  const clock = CLOCK.exec(token);
  if (clock) {
    const fraction = clock[3] ? Number(clock[3].padEnd(3, '0')) : 0;
    return { kind: 'time', ms: Number(clock[1]) * 60_000 + Number(clock[2]) * 1000 + fraction };
  }
  const lyric = LYRIC.exec(token);
  if (lyric) {
    const line = Number(lyric[1]);
    if (line < 1) return null;
    // A bare line number means the whole line: it starts a range at the line's start and ends one at its end.
    return { kind: 'lyric', line, edge: (lyric[2] as 'start' | 'end' | undefined) ?? (side === 'from' ? 'start' : 'end') };
  }
  return null;
}

function isRefToken(token: string): boolean {
  return parseRef(token, 'from') !== null;
}

/** `> play …` without the caption. */
function parsePlay(spec: string): Omit<ScriptMusicCue, 'type' | 'sourceLine' | 'caption'> {
  // "0:47 – 1:11" and "a+b" read the same as "0:47–1:11" and "a + b".
  const tokens = spec
    .replace(/\s*[–—]\s*/g, '–')
    .replace(/\s+-\s+/g, '–')
    .replace(/\s*\+\s*/g, ' + ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) fail('"> play" needs a track, a range, or both, e.g. "> play earfquake 0:47–1:11" or "> play to end".');

  const tracks: string[] = [];
  let index = 0;
  const isTrack = (token: string | undefined): token is string =>
    token !== undefined && TRACK_KEY.test(token) && token !== 'from' && token !== 'to' && !isRefToken(token);
  if (isTrack(tokens[0])) {
    tracks.push(tokens[0]);
    index = 1;
    while (tokens[index] === '+') {
      const next = tokens[index + 1];
      if (!isTrack(next)) fail(`"+" must be followed by a track key, got "${next ?? 'nothing'}".`);
      tracks.push(next);
      index += 2;
    }
  }

  let from: TimeRef | null = null;
  let until: TimeRef | null = null;
  const ref = (token: string | undefined, side: 'from' | 'until'): TimeRef => {
    const parsed = token === undefined ? null : parseRef(token, side);
    if (!parsed) fail(`"${token ?? ''}" is not a position. Use m:ss, L<line>, start or end.`);
    return parsed;
  };

  const rest = tokens.slice(index);
  if (rest.length === 1 && /[–-]/.test(rest[0]!)) {
    const parts = rest[0]!.split(/[–-]/);
    if (parts.length !== 2) fail(`"${rest[0]}" is not a range. Write it as 0:47–1:11.`);
    from = ref(parts[0], 'from');
    until = ref(parts[1], 'until');
  } else {
    let i = 0;
    if (rest[i] === 'from') {
      from = ref(rest[i + 1], 'from');
      i += 2;
    }
    if (rest[i] === 'to') {
      until = ref(rest[i + 1], 'until');
      i += 2;
    }
    if (i < rest.length) fail(`Unexpected "${rest.slice(i).join(' ')}". After the track comes a range (0:47–1:11), "from …", "to …" or nothing.`);
  }

  if (from?.kind === 'end') fail('A range cannot start at "end".');
  if (until?.kind === 'start') fail('A range cannot stop at "start".');
  // A named track starts at its beginning unless told otherwise; the current track just carries on.
  if (tracks.length > 0 && from === null) from = { kind: 'start' };
  return { tracks, from, until: until ?? { kind: 'end' } };
}

function readHosts(fields: FieldReader): EpisodeHost[] {
  const map = fields.optionalMap('hosts');
  if (!map) fields.fail('"hosts" is required: one or two indented "a: name" lines.');
  const ids = map.keys();
  for (const id of ids) {
    if (!HOST_ID.test(id)) fields.fail(`Host key "${id}" must be lower-case letters or digits, starting with a letter.`);
  }
  if (ids.length < 1 || ids.length > 2) fields.fail(`An episode has one or two hosts, found ${ids.length}.`);

  const voices = fields.optionalMap('voices');
  for (const id of voices?.keys() ?? []) {
    if (!ids.includes(id)) fields.fail(`"voices.${id}" names no host (${ids.join(', ')}).`);
  }
  return ids.map((id, index) => {
    const voice = voices?.optionalString(id) ?? DEFAULT_HOST_VOICES[index]!;
    if (!isRecordedVoice(voice)) fields.fail(`"voices.${id}" must be one of ${RECORDED_VOICES.join(', ')}, got "${voice}".`);
    return { id, name: map.string(id), voice };
  });
}

/** `- EARFQUAKE = 어스퀘이크` items. */
function readSay(fields: FieldReader): SayRule[] {
  const rules: SayRule[] = [];
  for (const item of fields.optionalList('say') ?? []) {
    const at = item.indexOf(' = ');
    const from = at < 0 ? '' : item.slice(0, at).trim();
    const to = at < 0 ? '' : item.slice(at + 3).trim();
    if (!from || !to) fields.fail(`"say" items read "as written = as said", got "${item}".`);
    if (rules.some((rule) => rule.from === from)) fields.fail(`"say" has "${from}" twice.`);
    rules.push({ from, to });
  }
  return rules;
}

/** Parses one script file. `file` is its path; the file name is the episode key. */
export function parseEpisodeScript(file: string, source: string): EpisodeScript {
  let data: ReturnType<typeof parseFrontmatter>['data'];
  try {
    data = parseFrontmatter(source).data;
  } catch (error) {
    throw new EpisodeError(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let fields: FieldReader;
  let album: string;
  let title: string;
  let short: string | undefined;
  let hosts: EpisodeHost[];
  let say: SayRule[];
  let written: string | undefined;
  let updated: string | undefined;
  try {
    fields = new FieldReader(data, file);
    album = fields.string('album');
    title = fields.string('title');
    short = fields.optionalString('short');
    hosts = readHosts(fields);
    say = readSay(fields);
    written = fields.optionalString('written');
    updated = fields.optionalString('updated');
    for (const date of [written, updated]) {
      if (date !== undefined && !ISO_DATE.test(date)) fields.fail(`dates must be YYYY-MM-DD, got "${date}".`);
    }
  } catch (error) {
    if (error instanceof FrontmatterError) throw new EpisodeError(error.message);
    throw error;
  }

  // Line numbers are those of the file, so the body is cut from the source as written.
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const allLines = text.split('\n');
  const closing = allLines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
  const hostIds = new Set(hosts.map((host) => host.id));

  const cues: ScriptCue[] = [];
  const chapters: EpisodeChapter[] = [];
  const problems: string[] = [];
  /** The spoken cue being collected, the line a following plain line would continue, and a heading waiting for its first cue. */
  const pending: {
    spoken: { type: 'talk' | 'over'; lines: SpokenLine[]; sourceLine: number } | null;
    continuing: SpokenLine | null;
    chapter: { title: string; line: number } | null;
  } = { spoken: null, continuing: null, chapter: null };

  const closeSpoken = () => {
    if (pending.spoken) cues.push(pending.spoken);
    pending.spoken = null;
    pending.continuing = null;
  };
  const claimChapter = () => {
    if (!pending.chapter) return;
    chapters.push({ title: pending.chapter.title, cueIndex: cues.length });
    pending.chapter = null;
  };

  for (let i = closing + 1; i < allLines.length; i += 1) {
    const number = i + 1;
    const line = allLines[i]!.trim();
    try {
      if (line === '') {
        pending.continuing = null;
        continue;
      }
      if (COMMENT.test(line)) continue;

      const heading = HEADING.exec(line);
      if (heading) {
        closeSpoken();
        if (pending.chapter) fail(`The chapter "${pending.chapter.title}" (line ${pending.chapter.line}) has nothing in it.`);
        pending.chapter = { title: heading[1]!.trim(), line: number };
        continue;
      }

      const directive = DIRECTIVE.exec(line);
      if (directive) {
        closeSpoken();
        if (directive[1] !== 'play') fail(`Unknown directive "> ${directive[1]}". The only one is "> play".`);
        const [spec = '', ...captionParts] = (directive[2] ?? '').split('|');
        const caption = captionParts.join('|').trim();
        claimChapter();
        cues.push({ type: 'music', sourceLine: number, ...parsePlay(spec.trim()), ...(caption ? { caption } : {}) });
        continue;
      }

      const speaker = SPEAKER_LINE.exec(line);
      const host = speaker?.[1]!.toLowerCase();
      const unknown = unknownTags(line);
      if (unknown.length > 0) fail(`Unknown ${unknown.join(', ')}. The sounds a host can make are ${EXPRESSION_TAGS.map((tag) => `<${tag}>`).join(', ')}.`);
      if (speaker && host && hostIds.has(host)) {
        const type = speaker[2] === '~' ? 'over' : 'talk';
        if (pending.spoken?.type !== type) {
          closeSpoken();
          claimChapter();
          pending.spoken = { type, lines: [], sourceLine: number };
        }
        pending.continuing = { host, text: speaker[3]!.trim() };
        pending.spoken.lines.push(pending.continuing);
        continue;
      }

      if (pending.continuing) {
        pending.continuing.text = `${pending.continuing.text} ${line}`;
        continue;
      }
      if (speaker) fail(`"${speaker[1]}" is not one of the hosts (${[...hostIds].join(', ')}).`);
      fail('This line belongs to no host. Start it with "A: " (talk), "A~ " (talk over the music) or "> play".');
    } catch (error) {
      if (!(error instanceof LineError)) throw error;
      problems.push(`${file}:${number}: ${error.message}`);
      pending.continuing = null;
    }
  }
  closeSpoken();
  if (pending.chapter) problems.push(`${file}:${pending.chapter.line}: The chapter "${pending.chapter.title}" has nothing in it.`);
  if (cues.length === 0 && problems.length === 0) problems.push(`${file}: The script has no lines.`);
  if (problems.length > 0) throw new EpisodeError(problems.join('\n'), problems);

  return { key: fileKey(file), album, title, ...(short ? { short } : {}), hosts, say, written, updated, chapters, cues };
}
