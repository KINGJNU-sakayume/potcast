import { describe, expect, it } from 'vitest';
import { loadArtistNotes, loadSongNotes } from '../../src/editorial/loadNotes';
import { parseLrc } from '../../src/lyrics/lrc';
import { normaliseLines } from '../../src/lyrics/lyricSync';
import { lyricLineHash } from './legacyLineHash';
import { findNoteFor, migrateSong, readLegacyTranslation } from './migrate';

// Dummy lines only — never real lyrics.
const LRC = ['[00:01.00]line one', '[00:04.00]line two', '[00:07.00]line one', '[00:09.50]', '[00:10.00]line three', '[00:12.00]line four'].join('\n');
const lines = normaliseLines(parseLrc(LRC));
const timing = { lrclibId: 42, durationMs: 15_000 };
const h = (text: string) => lyricLineHash(text)!;

const artists = loadArtistNotes({
  './notes/artists/test-artist.md': '---\nartistIds: [a1]\nnames: [Test Artist, テスト]\nshort: Artist.\n---\n\nArtist body.\n',
});

const legacyRaw = {
  trackIds: ['track-b'],
  titles: ['Test Song', 'テストソング'],
  artistNames: ['Test Artist', 'Another Name'],
  sourceLanguage: 'en',
  targetLanguage: 'ko',
  lyricsSource: { provider: 'lrclib', id: 42, durationMs: 15_000 },
  brief: {
    speaker: '화자',
    addressee: '청자',
    relationship: '오랜 친구',
    register: 'haeche',
    pronouns: [{ source: 'you', target: '너', note: '처음부터 끝까지 같은 호칭.' }],
    reasoning: '친구에게 직접 말을 거는 구조라 **해체**로 통일한다.',
    sources: ['https://example.com/interview', 'https://example.com/shared'],
  },
  lines: {
    [h('line one')]: '첫째 줄',
    [`${h('line one')}#2`]: '다시 첫째 줄',
    [h('line three')]: '셋째 줄',
    ffffffff: '어디에도 없는 줄',
  },
  written: '2026-10-02',
};
const legacy = readLegacyTranslation('src/translations/test-artist/test-song.json', legacyRaw);

const existingNote = {
  key: 'test-song',
  source: [
    '---',
    'artist: test-artist',
    'trackIds: [track-a]',
    'titles: [Test Song]',
    'written: 2026-09-30',
    'sources:',
    '  - https://example.com/shared',
    'short: >',
    '  감상 큐.',
    '---',
    '',
    '감상 본문.',
  ].join('\n'),
};

describe('notes:migrate', () => {
  it('finds the note by title and artist name when no track ID is shared', () => {
    expect(findNoteFor(legacy, [existingNote], artists)?.key).toBe('test-song');
    expect(findNoteFor({ ...legacy, artistNames: ['Someone Else'] }, [existingNote], artists)).toBeNull();
  });

  it('places hashed lines on the record as segments, honouring #n and reporting the gaps', () => {
    const result = migrateSong({ legacy, note: existingNote, artists, lines, timing });
    expect(result.segments.timeline).toEqual({
      schemaVersion: 2,
      timing: { lrclibId: 42, durationMs: 15_000 },
      segments: [
        { startMs: 1000, endMs: 4000, translation: '첫째 줄' },
        { startMs: 7000, endMs: 10_000, translation: '다시 첫째 줄' },
        { startMs: 10_000, endMs: 12_000, translation: '셋째 줄' },
      ],
    });
    expect(result.segments.totalLines).toBe(5);
    expect(result.segments.translatedLines).toBe(3);
    expect(result.segments.unmatchedKeys).toEqual(['ffffffff']);
  });

  it('uses one translation for every occurrence of a repeated line without #n', () => {
    const rest = Object.fromEntries(Object.entries(legacyRaw.lines).filter(([key]) => key !== `${h('line one')}#2`));
    const result = migrateSong({ legacy: { ...legacy, lines: rest }, note: existingNote, artists, lines, timing });
    expect(result.segments.timeline.segments.filter((segment) => segment.translation === '첫째 줄').map((segment) => segment.startMs)).toEqual([
      1000, 7000,
    ]);
  });

  it('merges into the existing note: union of IDs, titles and sources, brief in the frontmatter, reasoning in the section', () => {
    const result = migrateSong({ legacy, note: existingNote, artists, lines, timing });
    expect(result.action).toBe('merged');
    expect(result.missingArtistNames).toEqual(['Another Name']);
    const [note] = loadSongNotes({ 'test-song.md': result.markdown }, { 'test-song.translation.json': JSON.parse(result.timelineJson) });
    expect(note).toMatchObject({
      key: 'test-song',
      artist: 'test-artist',
      trackIds: ['track-a', 'track-b'],
      titles: ['Test Song', 'テストソング'],
      short: '감상 큐.',
      full: '감상 본문.',
      written: '2026-09-30',
      sources: ['https://example.com/shared', 'https://example.com/interview'],
      translation: {
        brief: {
          sourceLanguage: 'en',
          targetLanguage: 'ko',
          register: 'haeche',
          speaker: '화자',
          addressee: '청자',
          relationship: '오랜 친구',
          pronouns: [{ source: 'you', target: '너', note: '처음부터 끝까지 같은 호칭.' }],
          written: '2026-10-02',
        },
        about: '친구에게 직접 말을 거는 구조라 **해체**로 통일한다.',
      },
    });
    expect(result.markdown).toContain('감상 본문.\n\n## 번역에 대하여\n\n친구에게');
    // Nothing but times and translations in the segment file.
    expect(result.timelineJson).not.toMatch(/line (one|two|three|four)/);
    expect(result.markdown).not.toMatch(/line (one|two|three|four)/);
  });

  it('creates a translation-only note when the song has none', () => {
    const result = migrateSong({ legacy, note: null, artists, lines, timing });
    expect(result.action).toBe('created');
    const [note] = loadSongNotes({ 'test-song.md': result.markdown }, { 'test-song.translation.json': JSON.parse(result.timelineJson) });
    expect(note?.short).toBeUndefined();
    expect(note?.full).toBeUndefined();
    expect(note?.trackIds).toEqual(['track-b']);
    expect(note?.written).toBe('2026-10-02');
    expect(note?.translation?.about).toContain('해체');
  });

  it('refuses a note that already has a translation, and a new note for an unknown artist', () => {
    const migrated = migrateSong({ legacy, note: existingNote, artists, lines, timing });
    expect(() => migrateSong({ legacy, note: { key: 'test-song', source: migrated.markdown }, artists, lines, timing })).toThrow(/already has/);
    expect(() => migrateSong({ legacy: { ...legacy, artistKey: 'nobody' }, note: null, artists, lines, timing })).toThrow(/no artist note/);
  });
});
