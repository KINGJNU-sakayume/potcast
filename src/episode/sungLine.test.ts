import { describe, expect, it } from 'vitest';
import type { TranslationTimeline } from '../translation/curated/types';
import { sungLinesBetween } from './sungLine';

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
const one = { key: 'one', durationMs: 200_000 };

describe('the lines sung in a stretch of a track', () => {
  it('are the translations of the segments inside it, in order', () => {
    // A stretch written as L1–L2 starts 0.6 s before the first line.
    expect(sungLinesBetween(one, 9_400, 18_000, timelineOf)).toEqual(['첫 줄', '둘째 줄']);
    expect(sungLinesBetween(one, 14_000, 40_000, timelineOf)).toEqual(['둘째 줄', '셋째 줄']);
    expect(sungLinesBetween(one, 0, 200_000, timelineOf)).toEqual(['첫 줄', '둘째 줄', '셋째 줄']);
  });

  it('leave out a line that is only partly inside', () => {
    expect(sungLinesBetween(one, 12_000, 16_000, timelineOf)).toEqual([]);
    expect(sungLinesBetween(one, 18_000, 30_000, timelineOf)).toEqual([]);
  });

  it('are none for a song without a translation, or on another edit of the song', () => {
    expect(sungLinesBetween({ key: 'other', durationMs: 200_000 }, 0, 200_000, timelineOf)).toEqual([]);
    expect(sungLinesBetween({ key: 'one', durationMs: 202_500 }, 9_400, 18_000, timelineOf)).toEqual(['첫 줄', '둘째 줄']);
    expect(sungLinesBetween({ key: 'one', durationMs: 204_000 }, 0, 200_000, timelineOf)).toEqual([]);
  });

  it('read the archive\'s own translations by default', () => {
    // EARFQUAKE has a curated translation, timed on a recording of another length than this.
    expect(sungLinesBetween({ key: 'earfquake', durationMs: 1 }, 0, 60_000)).toEqual([]);
    expect(sungLinesBetween({ key: 'no-such-song', durationMs: 200_000 }, 0, 60_000)).toEqual([]);
  });
});
