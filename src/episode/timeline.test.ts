import { describe, expect, it } from 'vitest';
import { episodeFrom, track } from './testing';
import { cueAt, episodeTimeline, speechAt } from './timeline';

const ONE = track('one', 180_000);
const TWO = track('two', 90_000);
const THREE = track('three', 120_000);
const TRACKS = [ONE, TWO, THREE];

describe('an episode on one clock', () => {
  it('lets a track play on under the hosts without counting that stretch twice', () => {
    const episode = episodeFrom(['> play one to 0:30', 'A~ 위에서 잠깐.', '> play to 1:00'].join('\n'), TRACKS);
    const timeline = episodeTimeline(episode);
    const talk = timeline.cues[1]!.dur;
    expect(talk).toBeGreaterThan(0);
    // The track runs 0:00–1:00 in all: the talk sits on part of that minute, it does not add to it.
    expect(timeline.cues[2]!.dur).toBe(30_000 - talk);
    expect(timeline.totalMs).toBe(60_000);
  });

  it('plays tracks one after the other in a cue', () => {
    const episode = episodeFrom('> play two + three to 1:00', TRACKS);
    expect(episodeTimeline(episode).totalMs).toBe(90_000 + 60_000);
  });

  it('puts each cue and chapter after the one before it', () => {
    const episode = episodeFrom(['## 여는 말', 'A: 시작합니다.', 'B: 네, 시작하죠.', '## ONE', '> play one 0:10–0:40', 'A: 다시 듣겠습니다.', '## 닫는 말', 'B: 끝입니다.'].join('\n'), TRACKS);
    const timeline = episodeTimeline(episode);
    const starts = timeline.cues.map((cue) => cue.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(timeline.cues[1]!.start).toBe(timeline.cues[0]!.start + timeline.cues[0]!.dur);
    expect(timeline.cues[1]!.dur).toBe(30_000);
    const chapterStarts = episode.chapters.map((chapter) => timeline.cues[chapter.cueIndex]!.start);
    expect(chapterStarts).toEqual([...chapterStarts].sort((a, b) => a - b));

    // The second host's line starts after the first's, inside the same cue.
    expect(speechAt(timeline, 0, 1, 0)).toBeGreaterThan(speechAt(timeline, 0, 0, 0));
    expect(speechAt(timeline, 0, 1, 0)).toBeLessThan(timeline.cues[1]!.start);
    expect(cueAt(timeline, timeline.cues[1]!.start + 1)).toBe(1);
    expect(cueAt(timeline, timeline.totalMs)).toBe(timeline.cues.length - 1);
  });

  it('takes a recording\'s length over the estimate, at the chosen pace', () => {
    const episode = episodeFrom('A: 녹음된 한 문장.', TRACKS);
    const estimated = episodeTimeline(episode).totalMs;
    const recorded = episodeTimeline(episode, 1, () => 10_000).totalMs;
    expect(recorded).toBe(10_000 + 200 + 250);
    expect(episodeTimeline(episode, 2, () => 10_000).totalMs).toBe(5_000 + 200 + 250);
    expect(recorded).not.toBe(estimated);
  });
});
