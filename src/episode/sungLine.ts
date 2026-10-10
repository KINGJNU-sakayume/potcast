import { songNotes } from '../editorial/songs';
import { DURATION_TOLERANCE_MS } from '../translation/curated';
import type { TranslationTimeline } from '../translation/curated/types';
import type { EpisodeTrack } from './types';

const TIMELINES = new Map(songNotes.flatMap((note) => (note.translation ? [[note.key, note.translation.timeline] as const] : [])));

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
