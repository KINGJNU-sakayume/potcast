import { describe, expect, it } from 'vitest';
import { albumNotes } from './albums';
import { artistNotes } from './artists';
import { auditAlbum, auditArtist, auditNotes, auditSong, countParagraphs, FLOOR, PENDING_REVIEW } from './quality';
import { songNotes } from './songs';
import type { AlbumNote, ArtistNote, SongNote } from './types';

const prose = (length: number) => '가'.repeat(length);
const paragraphs = (count: number, length: number) => Array.from({ length: count }, () => prose(Math.ceil(length / count))).join('\n\n');
const SOURCES = ['https://en.wikipedia.org/wiki/Example', 'https://example.com/interview'];

const song = (overrides: Partial<SongNote> = {}): SongNote => ({
  key: 'test-song',
  artist: 'test-artist',
  trackIds: [],
  titles: ['Test Song'],
  short: '감상 큐.',
  full: paragraphs(FLOOR.koSongParagraphs, FLOOR.koSongBody + 40),
  sources: SOURCES,
  lyricsLanguage: 'ko',
  ...overrides,
});

const album = (overrides: Partial<AlbumNote> = {}): AlbumNote => ({
  key: 'test-album',
  artist: 'test-artist',
  albumIds: [],
  titles: ['Test Album'],
  short: '프리뷰.',
  full: paragraphs(6, FLOOR.albumBody + 60),
  sources: SOURCES,
  tracks: ['test-song'],
  ...overrides,
});

const artist = (overrides: Partial<ArtistNote> = {}): ArtistNote => ({
  key: 'test-artist',
  artistIds: ['x'],
  names: ['Test Artist'],
  short: '관점.',
  full: paragraphs(5, FLOOR.artistBody + 50),
  sources: SOURCES,
  eras: [{ from: 2010, to: null, title: '데뷔 이후' }],
  ...overrides,
});

describe('the note quality floor', () => {
  it('passes notes written to the floor', () => {
    expect(auditSong(song()).problems).toEqual([]);
    expect(auditAlbum(album(), [song()]).problems).toEqual([]);
    expect(auditArtist(artist()).problems).toEqual([]);
  });

  it('counts prose paragraphs, not headings', () => {
    expect(countParagraphs('## 배경\n\n첫 문단.\n\n둘째 문단.')).toBe(2);
  });

  it('fails a short song note with too few paragraphs', () => {
    const problems = auditSong(song({ lyricsLanguage: 'instrumental', full: paragraphs(2, 300) })).problems.join('\n');
    expect(problems).toMatch(/600\+/);
    expect(problems).toMatch(/3\+/);
  });

  it('holds a Korean-language song to a higher floor than other songs', () => {
    const thin = paragraphs(FLOOR.songParagraphs, FLOOR.songBody + 30);
    const korean = auditSong(song({ full: thin })).problems.join('\n');
    expect(korean).toMatch(/Korean-language song note needs 900\+/);
    expect(korean).toMatch(/needs 4\+/);
    expect(auditSong(song({ full: thin, lyricsLanguage: 'instrumental' })).problems).toEqual([]);
  });

  it('fails a translation-only song note', () => {
    const problems = auditSong(song({ short: undefined, full: undefined })).problems.join('\n');
    expect(problems).toMatch(/short/);
    expect(problems).toMatch(/listening note is 0/);
  });

  it('asks for a translation unless the song needs none', () => {
    expect(auditSong(song({ lyricsLanguage: undefined })).problems.join('\n')).toMatch(/translate-lyrics/);
  });

  it('fails Wikipedia-only sources', () => {
    const problems = auditSong(song({ sources: ['https://en.wikipedia.org/wiki/A', 'https://en.wikipedia.org/wiki/B'] })).problems;
    expect(problems.join('\n')).toMatch(/beyond Wikipedia/);
  });

  it('does not count Namu Wiki as an independent source', () => {
    const problems = auditSong(song({ sources: ['https://namu.wiki/w/A', 'https://en.wikipedia.org/wiki/B'] })).problems;
    expect(problems.join('\n')).toMatch(/beyond Wikipedia, Namu Wiki/);
    expect(auditSong(song({ sources: ['https://namu.wiki/w/A', 'https://www.tenasia.co.kr/article/1'] })).problems).toEqual([]);
  });

  it('fails hearsay and clichés', () => {
    expect(auditSong(song({ full: `${song().full}\n\n최면처럼 들린다는 평이 있었다.` })).problems.join('\n')).toMatch(/hearsay/);
    expect(auditSong(song({ short: '전설적인 곡.' })).problems.join('\n')).toMatch(/cliché/);
  });

  it('fails an album whose tracklist is missing or has no song notes', () => {
    expect(auditAlbum(album({ tracks: undefined }), []).problems.join('\n')).toMatch(/"tracks"/);
    expect(auditAlbum(album({ tracks: ['test-song', 'missing'] }), [song()]).problems.join('\n')).toMatch(/"missing" has no song note/);
    expect(auditAlbum(album(), [song({ artist: 'someone-else' })]).problems.join('\n')).toMatch(/not "test-artist"/);
  });

  it('fails an artist note without eras', () => {
    expect(auditArtist(artist({ eras: undefined })).problems.join('\n')).toMatch(/eras/);
  });
});

describe('the repository notes', () => {
  const audits = auditNotes(artistNotes, albumNotes, songNotes);
  const ids = new Set(audits.map((audit) => audit.id));

  it.each(audits.filter((audit) => !PENDING_REVIEW.has(audit.id)).map((audit) => [audit.id, audit] as const))(
    '%s meets the quality floor',
    (_id, audit) => {
      expect(audit.problems).toEqual([]);
    },
  );

  it.each([...PENDING_REVIEW].map((id) => [id] as const))('%s is still pending review (rewrite it, then remove it from PENDING_REVIEW)', (id) => {
    expect(ids.has(id), `${id} is not a note`).toBe(true);
    const audit = audits.find((entry) => entry.id === id)!;
    expect(audit.problems.length, `${id} now meets the floor: remove it from PENDING_REVIEW in quality.ts`).toBeGreaterThan(0);
  });
});
