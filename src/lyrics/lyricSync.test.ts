import { describe, expect, it } from 'vitest';
import { findActiveLineIndex, firstLineAfter, getLyricWindow, normaliseLines } from './lyricSync';
import type { TimedLyricLine } from './types';

const lines: TimedLyricLine[] = [
  { startMs: 5_000, endMs: 12_000, text: 'one' },
  { startMs: 12_000, endMs: 18_000, text: 'two' },
  // instrumental gap 18 000–24 000
  { startMs: 24_000, endMs: 30_000, text: 'three' },
  { startMs: 30_000, text: 'four' },
  { startMs: 36_000, text: 'five' },
];

describe('findActiveLineIndex', () => {
  it('returns -1 before the first line', () => {
    expect(findActiveLineIndex(lines, 0)).toBe(-1);
    expect(findActiveLineIndex(lines, 4_999)).toBe(-1);
  });

  it('activates a line exactly at its start time', () => {
    expect(findActiveLineIndex(lines, 5_000)).toBe(0);
    expect(findActiveLineIndex(lines, 12_000)).toBe(1);
  });

  it('chooses the greatest startMs <= position', () => {
    expect(findActiveLineIndex(lines, 11_999)).toBe(0);
    expect(findActiveLineIndex(lines, 29_999)).toBe(2);
    expect(findActiveLineIndex(lines, 33_000)).toBe(3);
  });

  it('uses endMs to detect instrumental gaps', () => {
    expect(findActiveLineIndex(lines, 18_000)).toBe(-1);
    expect(findActiveLineIndex(lines, 21_000)).toBe(-1);
  });

  it('keeps the last line active when it has no endMs', () => {
    expect(findActiveLineIndex(lines, 10 * 60_000)).toBe(4);
  });

  it('handles empty input', () => {
    expect(findActiveLineIndex([], 1_000)).toBe(-1);
  });
});

describe('getLyricWindow', () => {
  it('returns the current line and the next two', () => {
    const window = getLyricWindow(lines, 13_000);
    expect(window.current?.text).toBe('two');
    expect(window.upcoming.map((l) => l.text)).toEqual(['three', 'four']);
  });

  it('shows upcoming lines during an intro and inside gaps', () => {
    expect(getLyricWindow(lines, 1_000).upcoming.map((l) => l.text)).toEqual(['one', 'two']);
    const gap = getLyricWindow(lines, 20_000);
    expect(gap.current).toBeNull();
    expect(gap.nextIndex).toBe(2);
    expect(gap.upcoming.map((l) => l.text)).toEqual(['three', 'four']);
  });

  it('returns fewer upcoming lines near the end', () => {
    expect(getLyricWindow(lines, 37_000).upcoming).toEqual([]);
    expect(getLyricWindow(lines, 31_000).upcoming.map((l) => l.text)).toEqual(['five']);
  });
});

describe('firstLineAfter', () => {
  it('finds the insertion point after a position', () => {
    expect(firstLineAfter(lines, 0)).toBe(0);
    expect(firstLineAfter(lines, 5_000)).toBe(1);
    expect(firstLineAfter(lines, 99_000)).toBe(lines.length);
  });
});

describe('normaliseLines', () => {
  it('sorts, trims, drops empty/invalid lines and repairs bad endMs', () => {
    const result = normaliseLines([
      { startMs: 9_000, text: '  later ' },
      { startMs: Number.NaN, text: 'broken' },
      { startMs: 1_000, endMs: 500, text: 'first' },
      { startMs: 2_000, text: '   ' },
    ]);
    expect(result).toEqual([
      { startMs: 1_000, text: 'first' },
      { startMs: 9_000, text: 'later' },
    ]);
  });
});
