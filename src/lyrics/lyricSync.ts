import type { TimedLyricLine } from './types';

/**
 * Pure timed-lyric synchronisation. The active line is derived from the
 * playback position only — never from an independent timer.
 */

/**
 * Index of the line active at `positionMs`, or -1 before the first line and
 * inside gaps. Lines must be sorted by `startMs`. The active line is the one
 * with the greatest `startMs <= positionMs`; when it has an `endMs`, the
 * position must also fall before it.
 */
export function findActiveLineIndex(lines: readonly TimedLyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.startMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found === -1) return -1;
  const endMs = lines[found]!.endMs;
  return endMs !== undefined && positionMs >= endMs ? -1 : found;
}

/** Index of the first line starting strictly after `positionMs` (lines.length if none). */
export function firstLineAfter(lines: readonly TimedLyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.startMs <= positionMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface LyricWindow {
  activeIndex: number;
  current: TimedLyricLine | null;
  /** Index of the first upcoming line. */
  nextIndex: number;
  upcoming: TimedLyricLine[];
}

export function getLyricWindow(lines: readonly TimedLyricLine[], positionMs: number, upcomingCount = 2): LyricWindow {
  const activeIndex = findActiveLineIndex(lines, positionMs);
  const nextIndex = activeIndex >= 0 ? activeIndex + 1 : firstLineAfter(lines, positionMs);
  return {
    activeIndex,
    current: activeIndex >= 0 ? lines[activeIndex]! : null,
    nextIndex,
    upcoming: lines.slice(nextIndex, nextIndex + upcomingCount),
  };
}

/** Sorts, drops invalid entries and repairs inconsistent `endMs` values from any provider. */
export function normaliseLines(lines: readonly TimedLyricLine[]): TimedLyricLine[] {
  return lines
    .filter((line) => Number.isFinite(line.startMs) && line.startMs >= 0 && line.text.trim().length > 0)
    .map((line) => ({ ...line, text: line.text.trim() }))
    .sort((a, b) => a.startMs - b.startMs)
    .map((line) =>
      line.endMs !== undefined && (!Number.isFinite(line.endMs) || line.endMs <= line.startMs)
        ? { startMs: line.startMs, text: line.text }
        : line,
    );
}
