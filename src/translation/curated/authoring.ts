import type { TimedLyrics } from '../../lyrics/types';
import { alignSegments, SNAP_MS } from './align';
import { DURATION_TOLERANCE_MS } from './index';
import type { TranslationTimeline } from './types';

/**
 * Helpers for writing a curated translation (used by scripts/lyrics-lines.ts).
 * They print the original lines only to the terminal; nothing here writes
 * lyrics to a file.
 */

export interface LineRow {
  /** 1-based line number among lines with text. */
  number: number;
  /** Index in `lyrics.lines`. */
  index: number;
  startMs: number;
  /** The next line's start; the last line runs to the end of the track. */
  endMs: number | null;
  text: string;
}

export function lineRows(lyrics: TimedLyrics, durationMs?: number | null): LineRow[] {
  const rows: LineRow[] = [];
  lyrics.lines.forEach((line, index) => {
    if (!line.text.trim()) return;
    const next = lyrics.lines[index + 1];
    rows.push({ number: rows.length + 1, index, startMs: line.startMs, endMs: next ? next.startMs : (durationMs ?? null), text: line.text.trim() });
  });
  return rows;
}

/** `  1    12340    18900  …` — number, start, end (ms), original text. */
export function formatLineTable(lyrics: TimedLyrics, durationMs?: number | null): string {
  return lineRows(lyrics, durationMs)
    .map((row) => `${String(row.number).padStart(3)}  ${String(row.startMs).padStart(7)}  ${String(row.endMs ?? '?').padStart(7)}  ${row.text}`)
    .join('\n');
}

export interface TimelineCheck {
  total: number;
  covered: number;
  /** The loaded record is the one in `timing`, and has its length (±3 s). */
  lrclibIdMatches: boolean;
  durationMatches: boolean;
  /** Segments whose start is not within ±400 ms of any line start. */
  offGrid: { segment: number; startMs: number; nearestLineMs: number | null }[];
  /** Lines with text that no segment covers. */
  uncovered: LineRow[];
}

export function checkTimeline(lyrics: TimedLyrics, timeline: TranslationTimeline): TimelineCheck {
  const rows = lineRows(lyrics, lyrics.timing?.durationMs);
  const starts = rows.map((row) => row.startMs);
  const aligned = alignSegments(lyrics.lines, timeline.segments, lyrics.timing?.durationMs ?? timeline.timing.durationMs);
  const uncovered = new Set(aligned.uncovered);
  const offGrid = timeline.segments.flatMap((segment, index) => {
    const nearest = starts.reduce<number | null>(
      (best, start) => (best === null || Math.abs(start - segment.startMs) < Math.abs(best - segment.startMs) ? start : best),
      null,
    );
    return nearest !== null && Math.abs(nearest - segment.startMs) <= SNAP_MS ? [] : [{ segment: index, startMs: segment.startMs, nearestLineMs: nearest }];
  });
  const duration = lyrics.timing?.durationMs;
  return {
    total: rows.length,
    covered: rows.length - uncovered.size,
    lrclibIdMatches: lyrics.timing?.lrclibId === timeline.timing.lrclibId,
    durationMatches: typeof duration === 'number' && Math.abs(duration - timeline.timing.durationMs) <= DURATION_TOLERANCE_MS,
    offGrid,
    uncovered: rows.filter((row) => uncovered.has(row.index)),
  };
}
