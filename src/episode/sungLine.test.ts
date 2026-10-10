import { describe, expect, it } from 'vitest';
import type { TranslationTimeline } from '../translation/curated/types';
import { hasSungLines, sungLine, sungLinesBetween } from './sungLine';

const TIMELINE: TranslationTimeline = {
  schemaVersion: 2,
  timing: { lrclibId: 1, durationMs: 200_000 },
  segments: [
    { startMs: 10_000, endMs: 14_000, translation: '첫 줄' },
    { startMs: 14_000, endMs: 18_000, translation: '둘째 줄' },
    { startMs: 30_000, endMs: 33_000, translation: '셋째 줄' },
  ],
};
const timelineOf = (key: string) => (key === 'one' ? TIMELINE : undefined);
const at = (positionMs: number, durationMs = 200_000, key = 'one') => sungLine({ key, durationMs }, positionMs, timelineOf);

describe('the line being sung', () => {
  it('is the translation of the segment the position is in', () => {
    expect(at(12_000)).toBe('첫 줄');
    expect(at(14_000)).toBe('둘째 줄');
    expect(at(32_999)).toBe('셋째 줄');
  });

  it('comes up a moment before it is sung', () => {
    expect(at(9_700)).toBeNull();
    expect(at(9_800)).toBe('첫 줄');
    // Back to back, the next line takes over that same moment early.
    expect(at(13_900)).toBe('둘째 줄');
  });

  it('is nothing before the first line, between lines and after the last', () => {
    expect(at(0)).toBeNull();
    expect(at(20_000)).toBeNull();
    expect(at(33_000)).toBeNull();
    expect(at(199_000)).toBeNull();
  });

  it('is nothing for a song without a translation, or on another edit of the song', () => {
    expect(at(12_000, 200_000, 'other')).toBeNull();
    expect(at(12_000, 202_500)).toBe('첫 줄');
    expect(at(12_000, 204_000)).toBeNull();
    expect(hasSungLines({ key: 'one', durationMs: 200_000 }, timelineOf)).toBe(true);
    expect(hasSungLines({ key: 'one', durationMs: 204_000 }, timelineOf)).toBe(false);
    expect(hasSungLines({ key: 'other', durationMs: 200_000 }, timelineOf)).toBe(false);
  });

  it('lists the lines of a stretch, for reading along when the position is not known', () => {
    const one = { key: 'one', durationMs: 200_000 };
    // A stretch written as L1–L2 starts 0.6 s before the first line.
    expect(sungLinesBetween(one, 9_400, 18_000, timelineOf)).toEqual(['첫 줄', '둘째 줄']);
    expect(sungLinesBetween(one, 14_000, 40_000, timelineOf)).toEqual(['둘째 줄', '셋째 줄']);
    // A line that is only partly inside is not part of the stretch.
    expect(sungLinesBetween(one, 12_000, 16_000, timelineOf)).toEqual([]);
    expect(sungLinesBetween({ key: 'one', durationMs: 204_000 }, 0, 200_000, timelineOf)).toEqual([]);
  });

  it('reads the archive\'s own translations by default', () => {
    // EARFQUAKE has a curated translation; far past its end nothing is being sung.
    expect(sungLine({ key: 'earfquake', durationMs: 1 }, 10_000)).toBeNull();
    expect(sungLine({ key: 'no-such-song', durationMs: 200_000 }, 10_000)).toBeNull();
  });
});
