import { EXPRESSION_TAGS, splitUtterances } from '../speechText';
import type { EpisodeHost, SpokenLine } from '../types';
import { clipKey, clipText, RECORDED_VOICES, SAMPLE_TEXT, type SayRule } from './clip';

/** What the plan needs of an episode: a parsed script and a resolved episode both have it. */
export interface NarratedEpisode {
  key: string;
  hosts: readonly EpisodeHost[];
  say: readonly SayRule[];
  cues: ReadonlyArray<{ type: string; lines?: readonly SpokenLine[] }>;
}

export interface PlannedClip {
  key: string;
  voice: string;
  /** What the voice is given to say. */
  text: string;
}

/** Every utterance of an episode with the clip that says it, in the order they are said. */
export function episodeClips(episode: NarratedEpisode): PlannedClip[] {
  const voices = new Map(episode.hosts.map((host) => [host.id, host.voice]));
  const clips: PlannedClip[] = [];
  for (const cue of episode.cues) {
    for (const line of cue.lines ?? []) {
      const voice = voices.get(line.host) ?? episode.hosts[0]?.voice;
      if (!voice) continue;
      for (const utterance of splitUtterances(line.text)) {
        const text = clipText(utterance, episode.say);
        clips.push({ key: clipKey(voice, text), voice, text });
      }
    }
  }
  return clips;
}

/** One clip per voice saying the same sentence, for choosing hosts. */
export function sampleClips(): PlannedClip[] {
  return RECORDED_VOICES.map((voice) => ({ key: clipKey(voice, clipText(SAMPLE_TEXT)), voice, text: clipText(SAMPLE_TEXT) }));
}

const TAGS = new RegExp(`<(?:${EXPRESSION_TAGS.join('|')})>`, 'g');
const AS_WRITTEN = /[A-Za-z][A-Za-z'’.-]*(?: [A-Za-z][A-Za-z'’.-]*)*|\d[\d,.]*/g;

/**
 * The English words and the numerals a clip leaves to the voice to read as
 * written. A Korean voice reads Hangul reliably and these less so: each is a
 * candidate for a `say` line.
 */
export function readAsWritten(text: string): string[] {
  return text.replace(TAGS, ' ').match(AS_WRITTEN) ?? [];
}

/** How much of an episode the site has recordings for. */
export function coverage(episode: NarratedEpisode, has: (key: string) => boolean): { recorded: number; total: number } {
  const clips = episodeClips(episode);
  return { recorded: clips.filter((clip) => has(clip.key)).length, total: clips.length };
}
