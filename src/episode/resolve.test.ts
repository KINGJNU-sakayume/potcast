import { describe, expect, it } from 'vitest';
import type { AlbumDetail } from '../domain/types';
import { albumEpisodeTracks, episodeMusicMs, LYRIC_LEAD_IN_MS, outsideFound, unplayable } from './resolve';
import { parseEpisodeScript } from './script';
import { episodeFrom, HEAD_WITH_SOURCE, SOURCE_ID, timedNote, track } from './testing';
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

function problems(body: string, tracks = TRACKS, notes = NOTES, head?: string): string[] {
  try {
    episodeFrom(body, tracks, notes, { head });
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

describe('tracks from outside the album', () => {
  const head = HEAD_WITH_SOURCE;
  const BODY = ['A: 원곡을 듣겠습니다.', '> play @source 0:47–1:05 | 그 대목', 'B: 이번에는 앨범에서.', '> play one 0:20–0:40'].join('\n');
  const SOURCE = {
    key: '@source',
    id: SOURCE_ID,
    uri: `spotify:track:${SOURCE_ID}`,
    title: 'Source Song',
    durationMs: 442_000,
    outside: { artist: 'King Crimson', year: 1969, why: '그 목소리가 온 곳', images: [], unavailable: false },
  };

  it('are known from the script alone: its title, its length, and the track ID to play', () => {
    const { cues, warnings } = episodeFrom(BODY, TRACKS, NOTES, { head });
    expect(cues[1]).toEqual({ type: 'music', tracks: [SOURCE], fromMs: 47_000, fallbackFromMs: 47_000, untilMs: 65_000, caption: '그 대목' });
    expect(cues[3]).toMatchObject({ tracks: [ONE], fromMs: 20_000, untilMs: 40_000 });
    expect(warnings).toEqual([]);
    expect(unplayable(SOURCE)).toBe(false);
    expect(unplayable(ONE)).toBe(false);
  });

  it('take from Spotify the pressing it plays here, its length and its cover', () => {
    const images = [{ url: 'https://i.scdn.co/image/cover', width: 640, height: 640 }];
    const found = { [SOURCE_ID]: { id: 'relinked1234567890abcd', uri: 'spotify:track:relinked1234567890abcd', durationMs: 441_200, images, albumId: 'album1234567890abcdefg', playable: true } };
    const { cues, warnings } = episodeFrom(BODY, TRACKS, NOTES, { head, found });
    expect(cues[1]).toMatchObject({
      tracks: [
        {
          key: '@source',
          id: 'relinked1234567890abcd',
          uri: 'spotify:track:relinked1234567890abcd',
          // The script's own title stands: Spotify's often carries the pressing.
          title: 'Source Song',
          durationMs: 441_200,
          outside: { images, albumId: 'album1234567890abcdefg', unavailable: false },
        },
      ],
    });
    expect(warnings).toEqual([]);
  });

  it('warn when Spotify plays a recording of another length than the one the positions were taken on', () => {
    const found = { [SOURCE_ID]: { id: SOURCE_ID, uri: `spotify:track:${SOURCE_ID}`, durationMs: 401_000, images: [], playable: true } };
    const { warnings } = episodeFrom(BODY, TRACKS, NOTES, { head, found });
    expect(warnings).toEqual([expect.stringMatching(/"Source Song" is 6:41 on Spotify here but the script's positions were taken on a 7:22 recording/)]);
  });

  it('are marked when Spotify cannot play them here, so the episode goes past them', () => {
    const found = { [SOURCE_ID]: { id: SOURCE_ID, uri: `spotify:track:${SOURCE_ID}`, durationMs: 442_000, images: [], playable: false } };
    const { cues, warnings } = episodeFrom(BODY, TRACKS, NOTES, { head, found });
    const cue = cues[1]!;
    expect(cue.type === 'music' && unplayable(cue.tracks[0]!)).toBe(true);
    // The cue stays where it is in the script: chapters and bookmarks count cues.
    expect(cues.map((item) => item.type)).toEqual(['talk', 'music', 'talk', 'music']);
    expect(warnings).toEqual([]);
  });

  it('are placed by the clock only, inside their own length', () => {
    expect(problems('A: 말.\n> play @source L1–L2', TRACKS, NOTES, head)[0]).toMatch(/L1 needs a curated translation for "@source"/);
    expect(problems('A: 말.\n> play @source 7:30–7:40', TRACKS, NOTES, head)[0]).toMatch(/7:30 is past the end of "Source Song" \(7:22\)/);
    expect(problems('A: 말.\n> play @source 1:05–0:47', TRACKS, NOTES, head)[0]).toMatch(/The range 1:05–0:47 of "Source Song" is empty or runs backwards/);
  });

  it('can be talked over and carried on like any other track', () => {
    const { cues } = episodeFrom(['A: 말.', '> play @source 0:47–0:58', 'B~ 지금 이 목소리예요.', '> play to 1:05'].join('\n'), TRACKS, NOTES, { head });
    expect(cues[2]).toMatchObject({ type: 'over', track: SOURCE, fromMs: 58_000 });
    expect(cues[3]).toMatchObject({ tracks: [SOURCE], fromMs: null, fallbackFromMs: 58_000, untilMs: 65_000 });
  });

  it('read the catalogue\'s lookups: found, not on Spotify here, or not known', () => {
    const script = parseEpisodeScript('./notes/episodes/test-album.md', `${head}\n${BODY}`);
    const lookup = {
      track: { spotifyTrackId: 'relinked1234567890abcd', uri: 'spotify:track:relinked1234567890abcd', durationMs: 441_200, album: { id: 'album1234567890abcdefg', images: [] } },
      playable: true,
    };
    expect(outsideFound(script, { [SOURCE_ID]: lookup })).toEqual({
      [SOURCE_ID]: { id: 'relinked1234567890abcd', uri: 'spotify:track:relinked1234567890abcd', durationMs: 441_200, images: [], albumId: 'album1234567890abcdefg', playable: true },
    });
    expect(outsideFound(script, { [SOURCE_ID]: { ...lookup, playable: false } })[SOURCE_ID]).toMatchObject({ playable: false });
    // Spotify has no such track for this listener.
    expect(outsideFound(script, { [SOURCE_ID]: null })).toEqual({ [SOURCE_ID]: { id: SOURCE_ID, uri: `spotify:track:${SOURCE_ID}`, durationMs: 442_000, images: [], playable: false } });
    // The lookup failed: nothing is known, and the script's own description stands.
    expect(outsideFound(script, { [SOURCE_ID]: undefined })).toEqual({});
    expect(outsideFound(script, {})).toEqual({});
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
