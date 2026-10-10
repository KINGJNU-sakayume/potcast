import type { TimedLyricLine } from '../../lyrics/types';
import type { TranslationSegment } from './types';

/**
 * Places a curated translation's time segments on the lyric lines loaded at
 * runtime. LRCLIB may split one sentence over two lines or put two sentences
 * on one, so the repository stores times rather than lines:
 *
 * - Line i's window is [start_i, start_{i+1}); the last line's runs to the end of the track.
 * - A segment's anchor is the line whose window holds its `startMs`, moved to
 *   the next line when that one starts within SNAP_MS (timing noise between
 *   the record the segment was written on and this one).
 * - Segments anchored on the same line are shown together, joined by a space.
 * - Later lines that start inside the segment (before its end, less SNAP_MS)
 *   keep the anchor's translation, marked `continued`.
 * - Lines no segment reaches are `uncovered`: only those go to machine translation.
 */

export const SNAP_MS = 400;

export interface AlignedTranslation {
  /** One entry per lyric line: the curated translation shown with it, or ''. */
  lines: string[];
  /** Index of the first segment shown with the line (a stable key across continued lines), or null. */
  segmentOf: (number | null)[];
  /** True for a line that continues the previous line's segment. */
  continued: boolean[];
  /** Lines with text that no segment covers. */
  uncovered: number[];
  /** Segments that found a line. */
  anchored: number;
}

/** Index of the line whose window holds `ms`: the last line starting at or before it (-1 before the first line). */
function lineAt(starts: readonly number[], ms: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid]! <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function anchorLine(starts: readonly number[], segment: TranslationSegment, trackDurationMs?: number | null): number {
  if (starts.length === 0) return -1;
  let index = lineAt(starts, segment.startMs);
  if (index === -1) {
    // Before the first line: it belongs to the first line only if it reaches into it.
    return segment.endMs > starts[0]! ? 0 : -1;
  }
  const next = starts[index + 1];
  if (next !== undefined && next - segment.startMs <= SNAP_MS) index += 1;
  else if (next === undefined && trackDurationMs && segment.startMs >= trackDurationMs) return -1;
  return index;
}

export function alignSegments(
  lines: readonly TimedLyricLine[],
  segments: readonly TranslationSegment[],
  trackDurationMs?: number | null,
): AlignedTranslation {
  const starts = lines.map((line) => line.startMs);
  const out: AlignedTranslation = {
    lines: lines.map(() => ''),
    segmentOf: lines.map(() => null),
    continued: lines.map(() => false),
    uncovered: [],
    anchored: 0,
  };

  const groups = new Map<number, number[]>();
  segments.forEach((segment, index) => {
    const anchor = anchorLine(starts, segment, trackDurationMs);
    if (anchor < 0) return;
    groups.set(anchor, [...(groups.get(anchor) ?? []), index]);
    out.anchored += 1;
  });

  for (const [anchor, members] of groups) {
    const text = members.map((index) => segments[index]!.translation).join(' ');
    const end = Math.max(...members.map((index) => segments[index]!.endMs));
    out.lines[anchor] = text;
    out.segmentOf[anchor] = members[0]!;
    for (let j = anchor + 1; j < lines.length && starts[j]! < end - SNAP_MS && !groups.has(j); j += 1) {
      out.lines[j] = text;
      out.segmentOf[j] = members[0]!;
      out.continued[j] = true;
    }
  }

  lines.forEach((line, index) => {
    if (line.text.trim() && out.segmentOf[index] === null) out.uncovered.push(index);
  });
  return out;
}
