import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseTranslationTimeline } from '../translation/curated/parse';
import { loadSongNotes } from './loadNotes';
import { SONG_NOTE_FILES, SONG_TRANSLATION_FILES, songNotes } from './songs';

const BLOCK = ['translation:', '  sourceLanguage: en', '  targetLanguage: ko', '  register: haerache', '  speaker: 화자', '  addressee: 자기 자신', '  written: 2026-10-02'];
const note = ({ block = true, section = true, short = true, body = true } = {}) =>
  [
    '---',
    'artist: test-artist',
    'titles: [Test Song]',
    ...(short ? ['short: 감상 큐.'] : []),
    ...(block ? BLOCK : []),
    '---',
    '',
    ...(body ? ['감상 본문.', ''] : []),
    ...(section ? ['## 번역에 대하여', '', '혼잣말이라 해라체로 옮긴다.'] : []),
  ].join('\n');
const TIMELINE = { schemaVersion: 2, timing: { lrclibId: 1, durationMs: 10_000 }, segments: [{ startMs: 0, endMs: 2000, translation: '첫 줄' }] };
const md = (text: string) => ({ './notes/songs/test-song.md': text });
const json = (value: unknown = TIMELINE) => ({ './notes/songs/test-song.translation.json': value });

describe('song note ↔ curated translation', () => {
  it('loads the listening note and its translation from one note and its .translation.json', () => {
    const [loaded] = loadSongNotes(md(note()), json());
    expect(loaded).toMatchObject({
      short: '감상 큐.',
      full: '감상 본문.',
      translation: { brief: { register: 'haerache', speaker: '화자' }, about: '혼잣말이라 해라체로 옮긴다.', timeline: TIMELINE },
    });
  });

  it('loads a translation-only note (no short, no listening body)', () => {
    const [loaded] = loadSongNotes(md(note({ short: false, body: false })), json());
    expect(loaded?.short).toBeUndefined();
    expect(loaded?.full).toBeUndefined();
    expect(loaded?.translation?.about).toBe('혼잣말이라 해라체로 옮긴다.');
  });

  it.each([
    ['a translation block without its .translation.json', md(note()), {}, /no test-song\.translation\.json/],
    ['a .translation.json without a translation block', md(note({ block: false, section: false })), json(), /no "translation" block/],
    ['a translation block without the 번역에 대하여 section', md(note({ section: false })), json(), /no "## 번역에 대하여" section/],
    ['a 번역에 대하여 section without a translation block', md(note({ block: false })), {}, /section but no "translation" block/],
    ['a .translation.json without a note', {}, json(), /no song note/],
    ['a broken .translation.json', md(note()), json({ ...TIMELINE, schemaVersion: 1 }), /schemaVersion/],
  ])('fails on %s', (_label, files, translations, message) => {
    expect(() => loadSongNotes(files, translations)).toThrow(message);
  });

  it('in the app, drops only the broken translation with a warning and keeps the note', () => {
    const warn = vi.fn();
    const [loaded] = loadSongNotes(md(note()), json({ ...TIMELINE, segments: [] }), { strict: false, warn });
    expect(loaded?.short).toBe('감상 큐.');
    expect(loaded?.translation).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('segments'));
  });

  it('reads lyricsLanguage on a song without a translation, and rejects it elsewhere', () => {
    const korean = note({ block: false, section: false }).replace('titles: [Test Song]', 'titles: [Test Song]\nlyricsLanguage: ko');
    expect(loadSongNotes(md(korean))[0]?.lyricsLanguage).toBe('ko');
    expect(() => loadSongNotes(md(korean.replace('lyricsLanguage: ko', 'lyricsLanguage: ja')))).toThrow(/must be one of/);
    const translated = note().replace('titles: [Test Song]', 'titles: [Test Song]\nlyricsLanguage: ko');
    expect(() => loadSongNotes(md(translated), json())).toThrow(/has a "translation" block/);
  });

  it('still requires a listening cue on a note without a translation', () => {
    expect(() => loadSongNotes(md(note({ block: false, section: false, short: false })))).toThrow(/short/);
  });
});

describe('the repository', () => {
  const songsDir = join(process.cwd(), 'src/editorial/notes/songs');

  it('has no hash-keyed translation directory left', () => {
    expect(existsSync(join(process.cwd(), 'src/translations'))).toBe(false);
  });

  it('loads every song note and translation strictly (the app skips broken ones; the tests do not)', () => {
    const strict = loadSongNotes(SONG_NOTE_FILES, SONG_TRANSLATION_FILES, { strict: true });
    expect(strict.map((entry) => entry.key)).toEqual(songNotes.map((entry) => entry.key));
    expect(strict.filter((entry) => entry.translation).length).toBe(Object.keys(SONG_TRANSLATION_FILES).length);
  });

  it('keeps every .translation.json at schema version 2 with times and translations only', () => {
    const files = readdirSync(songsDir).filter((name) => name.endsWith('.translation.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const raw = JSON.parse(readFileSync(join(songsDir, name), 'utf8')) as { schemaVersion: number; segments: object[] };
      expect(raw.schemaVersion, name).toBe(2);
      // Rejects unknown keys, and text / original / source / lyrics in particular.
      expect(() => parseTranslationTimeline(name, raw)).not.toThrow();
      for (const segment of raw.segments) expect(Object.keys(segment).sort(), name).toEqual(['endMs', 'startMs', 'translation']);
    }
  });

  it('describes each song in one note only', () => {
    const ids = songNotes.flatMap((entry) => entry.trackIds);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
