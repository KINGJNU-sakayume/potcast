import { describe, expect, it } from 'vitest';
import type { AlbumDetail } from '../domain/types';
import { albumEpisodeTracks, episodeMusicMs, LYRIC_LEAD_IN_MS } from './resolve';
import { episodeFrom, timedNote, track } from './testing';
import { EpisodeError } from './types';

const ONE = track('one', 200_000);
const TWO = track('two', 15_000);
const THREE = track('three', 180_000);
const TRACKS = [ONE, TWO, THREE];
const NOTES = [
  timedNote('one', 200_500, [
    [10_000, 14_000],
    [14_000, 20_000],
    [47_000, 53_000],
  ]),
];

function problems(body: string, tracks = TRACKS, notes = NOTES): string[] {
  try {
    episodeFrom(body, tracks, notes);
  } catch (error) {
    if (error instanceof EpisodeError) return error.problems;
    throw error;
  }
  return [];
}

describe('resolving an episode against its album', () => {
  it('turns ranges into milliseconds and whole tracks into "to the end"', () => {
    const { cues } = episodeFrom(['> play one', '> play one 0:47–1:11', '> play three from 2:00'].join('\n'), TRACKS, NOTES);
    expect(cues).toEqual([
      { type: 'music', tracks: [ONE], fromMs: 0, fallbackFromMs: 0, untilMs: null },
      { type: 'music', tracks: [ONE], fromMs: 47_000, fallbackFromMs: 47_000, untilMs: 71_000 },
      { type: 'music', tracks: [THREE], fromMs: 120_000, fallbackFromMs: 120_000, untilMs: null },
    ]);
  });

  it('places lyric lines from the curated translation, starting a moment before the line', () => {
    const { cues, warnings } = episodeFrom('> play one L2–L3 | 둘째 줄부터', TRACKS, NOTES);
    expect(cues[0]).toEqual({ type: 'music', tracks: [ONE], fromMs: 14_000 - LYRIC_LEAD_IN_MS, fallbackFromMs: 14_000 - LYRIC_LEAD_IN_MS, untilMs: 53_000, caption: '둘째 줄부터' });
    expect(warnings).toEqual([]);
    expect(episodeFrom('> play one from L1.end to L3.start', TRACKS, NOTES).cues[0]).toMatchObject({ fromMs: 14_000, untilMs: 47_000 - LYRIC_LEAD_IN_MS });
  });

  it('warns when the lyric times were taken on another edit of the song', () => {
    const { warnings } = episodeFrom('> play one L1–L2', [track('one', 230_000, 'One (Extended)'), TWO], NOTES);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/"One \(Extended\)" is 3:50 here but its lyric times were taken on a 3:20 recording/);
  });

  it('carries the current track on, from wherever the script left it', () => {
    const { cues } = episodeFrom(['> play one to 0:30', 'A~ 음악 위에서.', '> play to 1:05', 'A: 멈추고.', '> play to end'].join('\n'), TRACKS, NOTES);
    expect(cues.map((cue) => cue.type)).toEqual(['music', 'over', 'music', 'talk', 'music']);
    expect(cues[1]).toMatchObject({ type: 'over', track: ONE, fromMs: 30_000 });
    expect(cues[2]).toMatchObject({ tracks: [ONE], fromMs: null, fallbackFromMs: 30_000, untilMs: 65_000 });
    expect(cues[4]).toMatchObject({ tracks: [ONE], fromMs: null, fallbackFromMs: 65_000, untilMs: null });
  });

  it('plays tracks back to back with the range on the first and the last', () => {
    const { cues } = episodeFrom('> play two + three to 1:00', TRACKS, NOTES);
    expect(cues[0]).toMatchObject({ tracks: [TWO, THREE], fromMs: 0, untilMs: 60_000 });
  });

  it('treats a stop within a moment of the end as the end', () => {
    expect(episodeFrom('> play one to 3:19.5', TRACKS, NOTES).cues[0]).toMatchObject({ untilMs: null });
  });

  it('keeps chapters on their cues', () => {
    const episode = episodeFrom(['## 여는 말', 'A: 시작.', '## 첫 곡', '> play one', 'B: 감상.'].join('\n'), TRACKS, NOTES);
    expect(episode.chapters).toEqual([
      { title: '여는 말', cueIndex: 0 },
      { title: '첫 곡', cueIndex: 1 },
    ]);
    expect(episode.cues[episode.chapters[1]!.cueIndex]).toMatchObject({ type: 'music', tracks: [ONE] });
  });

  it.each([
    ['> play four', /line 9: "four" is not on this album \(known: one, two, three\)/],
    ['> play one to 5:00', /line 9: 5:00 is past the end of "ONE" \(3:20\)/],
    ['> play one L9', /Unexpected "L9"/],
    ['> play one L9–L10', /"one" has 3 translated lines; there is no L9/],
    ['> play two L1–L2', /L1 needs a curated translation for "two"/],
    ['> play one 1:00–0:30', /The range 1:00–0:30 of "ONE" is empty or runs backwards/],
    ['> play to 1:00', /nothing has been played yet/],
    ['A~ 음악도 없이.', /needs music playing first/],
    ['> play one\nA~ 끝난 뒤에.', /line 10: "ONE" has already played to its end, so there is nothing to talk over/],
    ['> play one\n> play to end', /line 10: "ONE" has already played to its end\. Give a range/],
    ['> play one to 1:00\n> play to 0:30', /line 10: "ONE" is already at 1:00, so it cannot run on to 0:30/],
  ])('rejects "%s"', (body, message) => {
    const found = problems(body);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join('\n')).toMatch(message);
  });

  it('lets a range go back into a track that has ended', () => {
    const { cues } = episodeFrom(['> play one', 'A: 그 부분을 다시.', '> play 0:47–1:11'].join('\n'), TRACKS, NOTES);
    expect(cues[2]).toMatchObject({ tracks: [ONE], fromMs: 47_000, untilMs: 71_000 });
  });

  it('adds up the music an episode plays', () => {
    const episode = episodeFrom(['> play one to 0:30', 'A~ 위에서.', '> play to 1:00', '> play two + three to 1:00', '> play one 0:10–0:20'].join('\n'), TRACKS, NOTES);
    expect(episodeMusicMs(episode)).toBe(30_000 + 30_000 + (15_000 + 60_000) + 10_000);
  });
});

describe('album tracks an episode can name', () => {
  const album = {
    artists: [{ id: 'a1', name: 'Artist', uri: 'spotify:artist:a1' }],
    tracks: [
      { id: 't1', uri: 'spotify:track:t1', name: 'One', artists: [], durationMs: 200_000 },
      { id: 't2', uri: 'spotify:track:t2', name: 'No Note', artists: [], durationMs: 100_000 },
      { id: 't3', uri: 'spotify:track:t3', name: 'One (Remix)', artists: [], durationMs: 210_000 },
    ],
  } as unknown as AlbumDetail;

  it('are those with a song note, under the note key, the first match winning', () => {
    const findNote = ({ title }: { title?: string | null }) => (title?.startsWith('One') ? timedNote('one', 200_000, []) : null);
    expect(albumEpisodeTracks(album, findNote)).toEqual([{ key: 'one', id: 't1', uri: 'spotify:track:t1', title: 'One', durationMs: 200_000 }]);
  });
});
