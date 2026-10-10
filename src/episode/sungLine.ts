import { songNotes } from '../editorial/songs';
import { DURATION_TOLERANCE_MS } from '../translation/curated';
import type { TranslationTimeline } from '../translation/curated/types';
import type { EpisodeTrack } from './types';

const TIMELINES = new Map(songNotes.flatMap((note) => (note.translation ? [[note.key, note.translation.timeline] as const] : [])));

/** A line is shown a moment before it is sung, as on Now Playing: reading takes longer than hearing. */
const LEAD_MS = 250;

type Track = Pick<EpisodeTrack, 'key' | 'durationMs'>;
type TimelineSource = (songKey: string) => TranslationTimeline | undefined;
const archive: TimelineSource = (key) => TIMELINES.get(key);

/**
 * The song's translated lines, if they fit this track. The segments were
 * timed on one recording: on a release whose track has another length they
 * would land on the wrong lines, so they are not used there.
 */
function usableTimeline(track: Track, timelineOf: TimelineSource): TranslationTimeline | null {
  const timeline = timelineOf(track.key);
  return timeline && Math.abs(track.durationMs - timeline.timing.durationMs) <= DURATION_TOLERANCE_MS ? timeline : null;
}

/** Whether `sungLine` has anything to say about this track at all. */
export function hasSungLines(track: Track, timelineOf: TimelineSource = archive): boolean {
  return usableTimeline(track, timelineOf) !== null;
}

/**
 * The translated line being sung at `positionMs`, from the song note's
 * curated translation, or null between lines and for a song without one.
 */
export function sungLine(track: Track, positionMs: number, timelineOf: TimelineSource = archive): string | null {
  const timeline = usableTimeline(track, timelineOf);
  if (!timeline) return null;
  const { segments } = timeline;
  // The last segment that has started; the segments are sorted and never overlap.
  let low = 0;
  let high = segments.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (segments[middle]!.startMs - LEAD_MS <= positionMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const segment = segments[found];
  return segment && positionMs < segment.endMs ? segment.translation : null;
}

/** How far outside a stretch a line may reach and still belong to it: stretches start a little before their first line. */
const EDGE_MS = 800;

/**
 * The translated lines sung in a stretch of a track, in order: what a
 * listener who plays the stretch themselves reads along with.
 */
export function sungLinesBetween(track: Track, fromMs: number, untilMs: number, timelineOf: TimelineSource = archive): string[] {
  const timeline = usableTimeline(track, timelineOf);
  if (!timeline) return [];
  return timeline.segments.filter((segment) => segment.startMs >= fromMs - EDGE_MS && segment.endMs <= untilMs + EDGE_MS).map((segment) => segment.translation);
}
