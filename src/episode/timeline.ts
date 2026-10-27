import { clipKey, clipText } from './narration/clip';
import { unplayable } from './resolve';
import { estimateSpeechMs, splitUtterances } from './speechText';
import type { Cue, Episode, SpokenLine } from './types';

/**
 * An episode laid out on one clock, before it is played: where each cue
 * starts and how long it lasts. Music is exact (the cue's stretch of each
 * track); the hosts' talk is the recording's length where there is one and an
 * estimate for the rest, by the same rules as `episodeTalkMs`. While the hosts
 * talk over a track it keeps playing, so the music cue that carries on after
 * them starts where the talk left the track, not where the talk began.
 */
export interface EpisodeTimeline {
  /** Start and length of each cue, in ms from the top of the episode. */
  cues: Array<{ start: number; dur: number }>;
  totalMs: number;
  /** Where each cue's lines start, utterance by utterance: [line][utterance] → ms into the cue. */
  speech: Array<number[][] | null>;
}

const PER_UTTERANCE_MS = 200;
const PER_LINE_MS = 250;

type RecordedMs = (clipKey: string) => number | undefined;

function lineTimes(episode: Episode, lines: SpokenLine[], rate: number, recordedMs: RecordedMs): { starts: number[][]; total: number } {
  const pace = Math.min(2, Math.max(0.5, rate));
  const voices = new Map(episode.hosts.map((host) => [host.id, host.voice]));
  const starts: number[][] = [];
  let at = 0;
  for (const line of lines) {
    const voice = voices.get(line.host);
    const own: number[] = [];
    for (const utterance of splitUtterances(line.text)) {
      own.push(at);
      const recorded = voice ? recordedMs(clipKey(voice, clipText(utterance, episode.say))) : undefined;
      at += (recorded === undefined ? estimateSpeechMs(utterance, rate) : recorded / pace) + PER_UTTERANCE_MS;
    }
    starts.push(own);
    at += PER_LINE_MS;
  }
  return { starts, total: at };
}

/** How long a music cue sounds, given where its first track stands when a continuing cue begins. */
function musicMs(cue: Extract<Cue, { type: 'music' }>, standsAt: number | null): { dur: number; until: number } {
  const last = cue.tracks[cue.tracks.length - 1]!;
  const until = cue.untilMs ?? last.durationMs;
  if (cue.tracks.some(unplayable)) return { dur: 0, until };
  const from = cue.fromMs ?? standsAt ?? cue.fallbackFromMs;
  if (cue.tracks.length === 1) return { dur: Math.max(0, until - from), until };
  const middle = cue.tracks.slice(1, -1).reduce((sum, track) => sum + track.durationMs, 0);
  return { dur: Math.max(0, cue.tracks[0]!.durationMs - from) + middle + until, until };
}

export function episodeTimeline(episode: Episode, rate = 1, recordedMs: RecordedMs = () => undefined): EpisodeTimeline {
  const cues: EpisodeTimeline['cues'] = [];
  const speech: EpisodeTimeline['speech'] = [];
  let t = 0;
  // Which track the music stands in, and where, for a cue that carries on.
  let track: string | null = null;
  let standsAt = 0;
  for (const cue of episode.cues) {
    if (cue.type === 'music') {
      const carriesOn = cue.fromMs === null && track === cue.tracks[0]!.key;
      const { dur, until } = musicMs(cue, carriesOn ? standsAt : null);
      cues.push({ start: t, dur });
      speech.push(null);
      t += dur;
      track = cue.tracks[cue.tracks.length - 1]!.key;
      standsAt = until;
    } else {
      const { starts, total } = lineTimes(episode, cue.lines, rate, recordedMs);
      cues.push({ start: t, dur: total });
      speech.push(starts);
      t += total;
      if (cue.type === 'over') {
        track = cue.track.key;
        standsAt = cue.fromMs + total;
      }
    }
  }
  return { cues, totalMs: Math.round(t), speech };
}

/** Where the episode stands at a line and utterance of a talk or talk-over cue. */
export function speechAt(timeline: EpisodeTimeline, cueIndex: number, lineIndex: number, utteranceIndex: number): number {
  const cue = timeline.cues[cueIndex];
  if (!cue) return timeline.totalMs;
  const line = timeline.speech[cueIndex]?.[lineIndex];
  return cue.start + (line?.[Math.min(utteranceIndex, line.length - 1)] ?? 0);
}

/** The cue playing at a moment of the episode. */
export function cueAt(timeline: EpisodeTimeline, ms: number): number {
  let index = 0;
  for (let i = 0; i < timeline.cues.length; i += 1) if (timeline.cues[i]!.start <= ms) index = i;
  return index;
}
