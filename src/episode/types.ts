/**
 * Album episodes: a spoken walk through an album, with the music itself
 * played in between and underneath. An episode is a script (one Markdown file
 * in `src/editorial/notes/episodes/`, see script.ts) that the runner (runner.ts)
 * performs live: it speaks the hosts' lines, starts and stops Spotify playback
 * at the written positions, and turns the music down while a host talks over it.
 *
 * Nothing is mixed into a file: Spotify audio stays in the Spotify player and
 * the voices are synthesised in the browser, so an episode only exists while
 * the app is performing it.
 */

import type { ImageRef } from '../domain/types';
import type { RecordedVoice, SayRule } from './narration/clip';

export interface EpisodeHost {
  /** Lower-case key used in the script (`A:` → `a`). */
  id: string;
  /** Name shown beside the host's lines. */
  name: string;
  /** The recorded voice that says the host's lines (see narration/clip.ts). */
  voice: RecordedVoice;
}

/**
 * A position in a track. A lyric position is a segment of the song's curated
 * translation (`<song>.translation.json`), numbered from 1 in file order.
 */
export type TimeRef =
  | { kind: 'time'; ms: number }
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'lyric'; line: number; edge: 'start' | 'end' };

/** One host's turn. */
export interface SpokenLine {
  host: string;
  text: string;
}

interface ScriptCueBase {
  /** 1-based line of the script file, for error messages. */
  sourceLine: number;
}

/** Hosts talking with the music stopped. */
export interface ScriptTalkCue extends ScriptCueBase {
  type: 'talk';
  lines: SpokenLine[];
}

/** Hosts talking over the music, which keeps playing turned down. */
export interface ScriptOverCue extends ScriptCueBase {
  type: 'over';
  lines: SpokenLine[];
}

/** Music at full volume. */
export interface ScriptMusicCue extends ScriptCueBase {
  type: 'music';
  /** Song note keys played back to back; empty means "the track already playing". */
  tracks: string[];
  /** Where the first track starts; null keeps the current position (only without `tracks`). */
  from: TimeRef | null;
  /** Where the last track stops. */
  until: TimeRef;
  /** What to listen for, shown while it plays. */
  caption?: string;
}

export type ScriptCue = ScriptTalkCue | ScriptOverCue | ScriptMusicCue;

export interface EpisodeChapter {
  title: string;
  /** Index of the chapter's first cue. */
  cueIndex: number;
}

/** A parsed script, before it is matched to the album's tracks. */
export interface EpisodeScript {
  /** File name without extension. */
  key: string;
  /** Key of the album note the episode belongs to. */
  album: string;
  title: string;
  /** One or two lines for the album page. */
  short?: string;
  hosts: EpisodeHost[];
  /** How the hosts say what is written differently: English titles, numbers. */
  say: SayRule[];
  written?: string;
  updated?: string;
  chapters: EpisodeChapter[];
  cues: ScriptCue[];
}

/** An album track an episode can play. */
export interface EpisodeTrack {
  /** Song note key. */
  key: string;
  /** Spotify track ID and URI. */
  id: string;
  uri: string;
  title: string;
  durationMs: number;
}

export interface TalkCue {
  type: 'talk';
  lines: SpokenLine[];
}

export interface OverCue {
  type: 'over';
  lines: SpokenLine[];
  /** The track the hosts are talking over. */
  track: EpisodeTrack;
  /** Where that track stands when the talk begins, for starting the cue on its own. */
  fromMs: number;
}

export interface MusicCue {
  type: 'music';
  tracks: EpisodeTrack[];
  /** Position in the first track; null continues from wherever the track is. */
  fromMs: number | null;
  /** Where a continuing cue restarts when the player has lost its place. */
  fallbackFromMs: number;
  /** Position in the last track; null plays it to its end. */
  untilMs: number | null;
  caption?: string;
}

export type Cue = TalkCue | OverCue | MusicCue;

/** The Spotify release an episode was matched to: where its page lives and what its cover is. */
export interface EpisodeRelease {
  id: string;
  name: string;
  artistNames: string;
  images: ImageRef[];
}

/** A script matched to real tracks and times: what the runner performs. */
export interface Episode {
  key: string;
  /** Key of the album note. */
  album: string;
  /** Null only for an episode resolved without a Spotify album (tests, tools). */
  release: EpisodeRelease | null;
  title: string;
  short?: string;
  hosts: EpisodeHost[];
  say: SayRule[];
  chapters: EpisodeChapter[];
  cues: Cue[];
  /** Things that may play slightly off, e.g. lyric positions on another edit of a song. */
  warnings: string[];
}

export class EpisodeError extends Error {
  constructor(
    message: string,
    /** Every problem found, one per entry. */
    readonly problems: string[] = [message],
  ) {
    super(message);
    this.name = 'EpisodeError';
  }
}
