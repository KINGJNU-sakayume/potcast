import { describe, expect, it, vi } from 'vitest';
import { loadArtistNotes, loadSongNotes } from '../../editorial/loadNotes';
import { getSongNote, type NoteSources } from '../../editorial/lookup';
import { BoundedCache } from '../../lib/boundedCache';
import type { TimedLyrics } from '../../lyrics/types';
import { translateWithCurated } from '../translateLyrics';
import type { TranslationProvider } from '../TranslationProvider';
import { checkTimeline, formatLineTable } from './authoring';
import { getCuratedTranslation, lyricsMatchTiming, pinnedLrclibId } from './index';
import { CuratedTranslationError, parseTranslationTimeline } from './parse';

// Dummy lines only — never real lyrics.
const TRACK_ID = '0000000000000000000001';
const TIMING = { lrclibId: 101, durationMs: 20_000 };

const timelineJson = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  timing: TIMING,
  segments: [
    { startMs: 1000, endMs: 7000, translation: '첫 문장' },
    { startMs: 9000, endMs: 12_000, translation: '둘째 문장' },
  ],
  ...overrides,
});

const NOTE = [
  '---',
  'artist: test-artist',
  `trackIds: [${TRACK_ID}]`,
  'titles: [Test Song]',
  'short: >',
  '  감상 큐.',
  'sources: [https://example.com/interview]',
  'translation:',
  '  sourceLanguage: en',
  '  targetLanguage: ko',
  '  register: haeche',
  '  speaker: 화자',
  '  addressee: 청자',
  '  pronouns:',
  '    - source: you',
  '      target: 너',
  '  written: 2026-10-02',
  '---',
  '',
  '감상 본문.',
  '',
  '## 번역에 대하여',
  '',
  '친구에게 직접 말을 거는 구조라 **해체**로 통일한다.',
].join('\n');

const sources = (): NoteSources => ({
  artists: loadArtistNotes({ './notes/artists/test-artist.md': '---\nartistIds: [a1]\nnames: [Test Artist]\nshort: Artist.\n---\n' }),
  albums: [],
  songs: loadSongNotes({ './notes/songs/test-song.md': NOTE }, { './notes/songs/test-song.translation.json': timelineJson() }),
});

const lyrics = (lrclibId: number | null, durationMs: number | null): TimedLyrics => ({
  language: 'en',
  timing: { lrclibId, durationMs },
  lines: [
    { startMs: 1000, text: 'line one' },
    { startMs: 4000, text: 'line two' },
    { startMs: 7000, text: 'line three' },
    { startMs: 9000, text: 'line four' },
  ],
});

describe('parseTranslationTimeline', () => {
  const parse = (overrides: Record<string, unknown>) => () => parseTranslationTimeline('test.translation.json', timelineJson(overrides));
  const segments = (...list: object[]) => ({ segments: list });

  it('accepts a valid file', () => {
    expect(parse({})()).toEqual(timelineJson());
  });

  it.each([
    ['overlapping segments', segments({ startMs: 0, endMs: 5000, translation: 'a' }, { startMs: 4000, endMs: 6000, translation: 'b' }), /overlaps/],
    ['unsorted segments', segments({ startMs: 5000, endMs: 6000, translation: 'a' }, { startMs: 1000, endMs: 2000, translation: 'b' }), /sorted/],
    ['an empty translation', segments({ startMs: 0, endMs: 1000, translation: '  ' }), /translation" must be non-empty/],
    ['a segment that ends before it starts', segments({ startMs: 2000, endMs: 2000, translation: 'a' }), /before/],
    ['a segment past the end of the track', segments({ startMs: 0, endMs: 23_001, translation: 'a' }), /end of the track/],
    ['an original-text key in a segment', segments({ startMs: 0, endMs: 1000, translation: 'a', text: 'line one' }), /never store the original lyrics/],
    ['an "original" key in a segment', segments({ startMs: 0, endMs: 1000, translation: 'a', original: 'line one' }), /never store the original lyrics/],
    ['a "lyrics" key at the top', { lyrics: 'line one' }, /never store the original lyrics/],
    ['a "source" key in timing', { timing: { ...TIMING, source: 'line one' } }, /never store the original lyrics/],
    ['an unknown key', { trackIds: ['x'] }, /unknown field "trackIds"/],
    ['another schema version', { schemaVersion: 1 }, /schemaVersion/],
    ['no LRCLIB record ID', { timing: { durationMs: 1000 } }, /lrclibId/],
  ])('rejects %s', (_label, overrides, message) => {
    expect(parse(overrides)).toThrow(CuratedTranslationError);
    expect(parse(overrides)).toThrow(message);
  });
});

describe('getCuratedTranslation', () => {
  it('matches by Spotify ID regardless of length', () => {
    expect(getCuratedTranslation({ id: TRACK_ID, durationMs: 1, targetLanguage: 'ko' }, sources())?.matchedBy).toBe('id');
  });

  it('applies a name match only when the track length is within 3 s of the timed record, but keeps the note', () => {
    const query = { id: 'other-edition', title: 'Test Song', artistNames: ['Test Artist'], targetLanguage: 'ko-KR' };
    expect(getCuratedTranslation({ ...query, durationMs: 22_500 }, sources())?.matchedBy).toBe('name');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(getCuratedTranslation({ ...query, durationMs: 23_500 }, sources())).toBeNull();
    expect(getCuratedTranslation({ ...query, durationMs: null }, sources())).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(getSongNote(query, sources())?.key).toBe('test-song');
  });

  it('only returns translations into the requested language', () => {
    expect(getCuratedTranslation({ id: TRACK_ID, targetLanguage: 'en' }, sources())).toBeNull();
  });
});

describe('pinnedLrclibId', () => {
  it("names the record the song note's translation was timed on, under the same matching rule", () => {
    expect(pinnedLrclibId({ id: TRACK_ID, durationMs: 1 }, sources())).toBe(101);
    const byName = { id: 'other-edition', title: 'Test Song', artistNames: ['Test Artist'] };
    expect(pinnedLrclibId({ ...byName, durationMs: 21_000 }, sources())).toBe(101);
    expect(pinnedLrclibId({ ...byName, durationMs: 30_000 }, sources())).toBeNull();
    expect(pinnedLrclibId({ id: 'unknown', title: 'Other Song', artistNames: ['Test Artist'] }, sources())).toBeNull();
  });
});

describe('lyricsMatchTiming', () => {
  it('accepts the same LRCLIB record, or another one of the same length (±3 s)', () => {
    expect(lyricsMatchTiming({ lrclibId: 101, durationMs: 99_000 }, TIMING)).toBe(true);
    expect(lyricsMatchTiming({ lrclibId: 202, durationMs: 22_900 }, TIMING)).toBe(true);
    expect(lyricsMatchTiming({ lrclibId: 202, durationMs: 23_100 }, TIMING)).toBe(false);
    expect(lyricsMatchTiming({ lrclibId: null, durationMs: null }, TIMING)).toBe(false);
    expect(lyricsMatchTiming(undefined, TIMING)).toBe(false);
  });
});

describe('translateWithCurated', () => {
  const freshCache = () => new BoundedCache<string[]>({ prefix: `test.curated.${Math.random()}:`, maxEntries: 20 });
  const fakeProvider = () => {
    const translateLines = vi.fn(async (lines: { text: string }[]) => lines.map((line) => `[MT] ${line.text}`));
    return { provider: { id: 'fake', label: 'Fake', translateLines } satisfies TranslationProvider, translateLines };
  };
  const match = () => getCuratedTranslation({ id: TRACK_ID, targetLanguage: 'ko' }, sources())!;

  it('places segments on the lines and machine-translates only the lines no segment covers', async () => {
    const { provider, translateLines } = fakeProvider();
    const result = await translateWithCurated(provider, 't', lyrics(101, 20_000), match(), 'ko', 20_000, freshCache());
    expect(translateLines).toHaveBeenCalledTimes(1);
    expect(translateLines.mock.calls[0]![0].map((line) => line.text)).toEqual(['line three']);
    expect(result).toMatchObject({
      status: 'ready',
      lines: ['첫 문장', '첫 문장', '[MT] line three', '둘째 문장'],
      curated: { total: 4, covered: 3, machine: [2], segmentOf: [0, 0, null, 1], continued: [false, true, false, false] },
    });
  });

  it('works without a machine provider', async () => {
    const result = await translateWithCurated(null, 't', lyrics(101, 20_000), match(), 'ko', 20_000, freshCache());
    expect(result).toMatchObject({ status: 'ready', lines: ['첫 문장', '첫 문장', '', '둘째 문장'] });
  });

  it('falls back to machine translation when the LRCLIB record and its length both differ', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { provider, translateLines } = fakeProvider();
    const result = await translateWithCurated(provider, 't', lyrics(202, 40_000), match(), 'ko', 40_000, freshCache());
    expect(translateLines.mock.calls[0]![0]).toHaveLength(4);
    expect(result).toEqual({ status: 'ready', lines: ['[MT] line one', '[MT] line two', '[MT] line three', '[MT] line four'] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not the version'));
    expect((await translateWithCurated(null, 't', lyrics(202, 40_000), match(), 'ko', 40_000, freshCache())).status).toBe('unavailable');
  });
});

describe('authoring helpers', () => {
  it('prints number, start, end and text per line', () => {
    expect(formatLineTable(lyrics(101, 20_000), 20_000).split('\n')).toEqual([
      '  1     1000     4000  line one',
      '  2     4000     7000  line two',
      '  3     7000     9000  line three',
      '  4     9000    20000  line four',
    ]);
  });

  it('reports uncovered lines, starts off the line grid and a different record', () => {
    const timeline = parseTranslationTimeline(
      't.json',
      timelineJson({ segments: [{ startMs: 1000, endMs: 7000, translation: 'a' }, { startMs: 9600, endMs: 12_000, translation: 'b' }] }),
    );
    const report = checkTimeline(lyrics(202, 30_000), timeline);
    expect(report.uncovered.map((row) => row.text)).toEqual(['line three']);
    expect(report.offGrid).toEqual([{ segment: 1, startMs: 9600, nearestLineMs: 9000 }]);
    expect(report.lrclibIdMatches).toBe(false);
    expect(report.durationMatches).toBe(false);
  });
});
