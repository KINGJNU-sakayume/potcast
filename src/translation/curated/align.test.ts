import { describe, expect, it } from 'vitest';
import type { TimedLyricLine } from '../../lyrics/types';
import { alignSegments, SNAP_MS } from './align';

// Dummy lines only — never real lyrics.
const line = (startMs: number, text: string): TimedLyricLine => ({ startMs, text });

describe('alignSegments', () => {
  it('shows a segment LRCLIB split over two lines on the first, and keeps it while the second plays', () => {
    const lines = [line(1000, 'line one'), line(3000, 'line two'), line(6000, 'line three')];
    const aligned = alignSegments(lines, [{ startMs: 1000, endMs: 6000, translation: '한 문장' }], 9000);
    expect(aligned.lines).toEqual(['한 문장', '한 문장', '']);
    expect(aligned.continued).toEqual([false, true, false]);
    // Same segment on both lines: the UI keeps one element instead of repeating the translation.
    expect(aligned.segmentOf).toEqual([0, 0, null]);
    expect(aligned.uncovered).toEqual([2]);
  });

  it('joins two segments that LRCLIB put on one line', () => {
    const lines = [line(1000, 'line one and line two'), line(5000, 'line three')];
    const aligned = alignSegments(
      lines,
      [
        { startMs: 1000, endMs: 3000, translation: '첫 문장.' },
        { startMs: 3000, endMs: 5000, translation: '둘째 문장.' },
        { startMs: 5000, endMs: 7000, translation: '셋째 문장.' },
      ],
      7000,
    );
    expect(aligned.lines).toEqual(['첫 문장. 둘째 문장.', '셋째 문장.']);
    expect(aligned.segmentOf).toEqual([0, 2]);
    expect(aligned.uncovered).toEqual([]);
    expect(aligned.anchored).toBe(3);
  });

  it(`snaps a segment that starts up to ${SNAP_MS} ms before a line onto that line`, () => {
    const lines = [line(1000, 'line one'), line(4000, 'line two')];
    const aligned = alignSegments(lines, [{ startMs: 3700, endMs: 6000, translation: '둘째 줄' }], 6000);
    expect(aligned.lines).toEqual(['', '둘째 줄']);
    expect(aligned.uncovered).toEqual([0]);

    const early = alignSegments(lines, [{ startMs: 3500, endMs: 6000, translation: '둘째 줄' }], 6000);
    expect(early.lines).toEqual(['둘째 줄', '둘째 줄']);
  });

  it('does not carry a segment onto a line that starts at (or just before) its end', () => {
    const lines = [line(1000, 'line one'), line(3000, 'line two')];
    const aligned = alignSegments(lines, [{ startMs: 1000, endMs: 3200, translation: '첫 줄' }], 6000);
    expect(aligned.lines).toEqual(['첫 줄', '']);
    expect(aligned.uncovered).toEqual([1]);
  });

  it('places a segment that starts before the first line on it only if it reaches into it', () => {
    const lines = [line(2000, 'line one')];
    expect(alignSegments(lines, [{ startMs: 500, endMs: 4000, translation: '첫 줄' }]).lines).toEqual(['첫 줄']);
    const missed = alignSegments(lines, [{ startMs: 500, endMs: 1500, translation: '전주' }]);
    expect(missed.lines).toEqual(['']);
    expect(missed.anchored).toBe(0);
  });

  it('leaves a segment after the end of the track unplaced', () => {
    const aligned = alignSegments([line(0, 'line one')], [{ startMs: 9000, endMs: 9500, translation: '끝' }], 8000);
    expect(aligned.anchored).toBe(0);
  });
});
