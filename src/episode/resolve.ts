import type { AlbumDetail } from '../domain/types';
import { getSongNote } from '../editorial/lookup';
import type { SongNote } from '../editorial/types';
import { formatDuration } from '../lib/format';
import { DURATION_TOLERANCE_MS } from '../translation/curated';
import { estimateSpeechMs, splitUtterances } from './speechText';
import {
  EpisodeError,
  type Cue,
  type Episode,
  type EpisodeRelease,
  type EpisodeScript,
  type EpisodeTrack,
  type MusicCue,
  type TimeRef,
} from './types';

/**
 * A lyric position starts a moment before its line: LRCLIB times mark where a
 * line is sung, and a seek that lands exactly there clips its first syllable.
 */
export const LYRIC_LEAD_IN_MS = 600;
/** A stop this close to a track's end is the end. */
const END_SNAP_MS = 1500;
/** The shortest stretch of music worth starting. */
const MIN_RANGE_MS = 1000;

/** The album's tracks an episode can name: those with a song note, under the note's key. */
export function albumEpisodeTracks(album: AlbumDetail, findNote: typeof getSongNote = getSongNote): EpisodeTrack[] {
  const albumArtists = album.artists.map((artist) => artist.name);
  const tracks: EpisodeTrack[] = [];
  const seen = new Set<string>();
  for (const track of album.tracks) {
    const note = findNote({ id: track.id, title: track.name, artistNames: [...albumArtists, ...track.artists.map((a) => a.name)] });
    // A deluxe edition may repeat a song (a remix under the same note): the album cut comes first.
    if (!note || seen.has(note.key)) continue;
    seen.add(note.key);
    tracks.push({ key: note.key, id: track.id, uri: track.uri, title: track.name, durationMs: track.durationMs });
  }
  return tracks;
}

/**
 * Matches a script to real tracks and turns its positions into milliseconds.
 * Every problem is collected and thrown together, each with its script line.
 */
export function resolveEpisode(
  script: EpisodeScript,
  tracks: readonly EpisodeTrack[],
  songs: readonly SongNote[],
  release: EpisodeRelease | null = null,
): Episode {
  const byKey = new Map(tracks.map((track) => [track.key, track]));
  const notes = new Map(songs.map((note) => [note.key, note]));
  const problems: string[] = [];
  const warnings = new Set<string>();
  const cues: Cue[] = [];
  /** The track the player would be on, and whether it has run out. */
  let current: { track: EpisodeTrack; ended: boolean; atMs: number } | null = null;

  const toMs = (ref: TimeRef, track: EpisodeTrack, at: string): number | null => {
    switch (ref.kind) {
      case 'start':
        return 0;
      case 'end':
        return track.durationMs;
      case 'time':
        if (ref.ms > track.durationMs + END_SNAP_MS) {
          problems.push(`${at}: ${formatDuration(ref.ms)} is past the end of "${track.title}" (${formatDuration(track.durationMs)}).`);
          return null;
        }
        return Math.min(ref.ms, track.durationMs);
      case 'lyric': {
        const timeline = notes.get(track.key)?.translation?.timeline;
        if (!timeline) {
          problems.push(`${at}: L${ref.line} needs a curated translation for "${track.key}", and its song note has none. Use m:ss instead.`);
          return null;
        }
        const segment = timeline.segments[ref.line - 1];
        if (!segment) {
          problems.push(`${at}: "${track.key}" has ${timeline.segments.length} translated lines; there is no L${ref.line}.`);
          return null;
        }
        if (Math.abs(track.durationMs - timeline.timing.durationMs) > DURATION_TOLERANCE_MS) {
          warnings.add(
            `"${track.title}" is ${formatDuration(track.durationMs)} here but its lyric times were taken on a ${formatDuration(timeline.timing.durationMs)} recording: positions given as lyric lines may be off.`,
          );
        }
        const ms = ref.edge === 'start' ? segment.startMs - LYRIC_LEAD_IN_MS : segment.endMs;
        return Math.min(Math.max(0, ms), track.durationMs);
      }
    }
  };

  for (const cue of script.cues) {
    const at = `line ${cue.sourceLine}`;

    if (cue.type === 'talk') {
      cues.push({ type: 'talk', lines: cue.lines });
      continue;
    }

    if (cue.type === 'over') {
      if (!current) problems.push(`${at}: Talk over the music ("~") needs music playing first. Put a "> play" before it.`);
      else if (current.ended) problems.push(`${at}: "${current.track.title}" has already played to its end, so there is nothing to talk over.`);
      else cues.push({ type: 'over', lines: cue.lines, track: current.track, fromMs: current.atMs });
      continue;
    }

    const continuing = cue.tracks.length === 0;
    let cueTracks: EpisodeTrack[];
    if (continuing) {
      if (!current) {
        problems.push(`${at}: "> play" without a track carries on the current one, but nothing has been played yet.`);
        continue;
      }
      // A range of its own ("> play 1:12–1:31") may go back into a track that has ended.
      if (current.ended && cue.from === null) {
        problems.push(`${at}: "${current.track.title}" has already played to its end. Give a range, or name the track to play it again.`);
        continue;
      }
      cueTracks = [current.track];
    } else {
      const missing = cue.tracks.filter((key) => !byKey.has(key));
      if (missing.length > 0) {
        problems.push(`${at}: ${missing.map((key) => `"${key}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not on this album (known: ${tracks.map((t) => t.key).join(', ') || 'none'}).`);
        continue;
      }
      cueTracks = cue.tracks.map((key) => byKey.get(key)!);
    }

    const first = cueTracks[0]!;
    const last = cueTracks[cueTracks.length - 1]!;
    const fromMs = cue.from ? toMs(cue.from, first, at) : null;
    const until = toMs(cue.until, last, at);
    if ((cue.from && fromMs === null) || until === null) continue;
    const untilMs = until >= last.durationMs - END_SNAP_MS ? null : until;

    // Where the stretch starts, for checking it is not empty or backwards.
    const startMs = fromMs ?? current?.atMs ?? 0;
    if (cueTracks.length === 1 && (untilMs ?? last.durationMs) - startMs < MIN_RANGE_MS) {
      problems.push(
        continuing
          ? `${at}: "${last.title}" is already at ${formatDuration(startMs)}, so it cannot run on to ${formatDuration(untilMs ?? last.durationMs)}. Name the track to go back.`
          : `${at}: The range ${formatDuration(startMs)}–${formatDuration(untilMs ?? last.durationMs)} of "${last.title}" is empty or runs backwards.`,
      );
      continue;
    }

    const music: MusicCue = {
      type: 'music',
      tracks: cueTracks,
      fromMs,
      fallbackFromMs: startMs,
      untilMs,
      ...(cue.caption ? { caption: cue.caption } : {}),
    };
    cues.push(music);
    current = { track: last, ended: untilMs === null, atMs: untilMs ?? last.durationMs };
  }

  if (problems.length > 0) {
    const all = problems.map((problem) => `${script.key}: ${problem}`);
    throw new EpisodeError(all.join('\n'), all);
  }

  // Chapters point at script cues; every script cue became exactly one cue, so the indexes carry over.
  return {
    key: script.key,
    album: script.album,
    release,
    title: script.title,
    ...(script.short ? { short: script.short } : {}),
    hosts: script.hosts,
    chapters: script.chapters,
    cues,
    warnings: [...warnings],
  };
}

/** The release an album's episode plays from. */
export function episodeRelease(album: AlbumDetail): EpisodeRelease {
  return { id: album.id, name: album.name, artistNames: album.artists.map((artist) => artist.name).join(', '), images: album.images };
}

/** About how long the hosts talk in an episode, at the given speech rate. */
export function episodeTalkMs(episode: Episode, rate = 1): number {
  let total = 0;
  for (const cue of episode.cues) {
    if (cue.type === 'music') continue;
    for (const line of cue.lines) {
      // The pauses between utterances and between hosts are part of the pace.
      for (const utterance of splitUtterances(line.text)) total += estimateSpeechMs(utterance, rate) + 200;
      total += 250;
    }
  }
  return total;
}

/** Running time of the music in an episode, for the album page ("about 48 min"). */
export function episodeMusicMs(episode: Episode): number {
  let total = 0;
  let at = 0;
  for (const cue of episode.cues) {
    if (cue.type !== 'music') continue;
    const last = cue.tracks[cue.tracks.length - 1]!;
    const start = cue.fromMs ?? at;
    const end = cue.untilMs ?? last.durationMs;
    total += cue.tracks.length === 1 ? Math.max(0, end - start) : cue.tracks.slice(0, -1).reduce((sum, track, i) => sum + track.durationMs - (i === 0 ? start : 0), 0) + end;
    at = end;
  }
  return total;
}
