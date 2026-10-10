import { describe, expect, it } from 'vitest';
import { albumNotes } from './albums';
import { artistNotes } from './artists';
import { findSongNote, getAlbumNote, getArtistNote, getSongNote, normaliseTitle } from './lookup';
import { songNotes } from './songs';

describe('seeded notes', () => {
  it.each([
    ['Vaundy', '2IUl3m1H1EQ7QfNbNWvgru'],
    ['Tyler, The Creator', '4V8LLVI7PbaPR0K2TGSxFF'],
    ['tripleS', '5Z71xE9prhpHrqL5thVMyK'],
    ['Kenshi Yonezu', '1snhtMLeb2DYoMOcVbb8iB'],
    ['Coldplay', '4gzpq5DPGxSnKTe4SA8HAU'],
  ])('has an artist Editorial Note for %s', (name, id) => {
    const note = getArtistNote({ id });
    expect(note?.names).toContain(name);
    expect(note?.short.length).toBeGreaterThan(20);
    expect(note?.full).toContain('\n\n');
  });

  it('keeps every entry complete and every key unique', () => {
    for (const list of [artistNotes, albumNotes, songNotes]) {
      expect(new Set(list.map((entry) => entry.key)).size).toBe(list.length);
    }
    for (const entry of [...artistNotes, ...albumNotes]) {
      expect(entry.short.trim()).not.toBe('');
      expect(entry.full?.trim()).toBeTruthy();
    }
    // A song note is a listening note (cue + body), a curated translation, or both.
    for (const entry of songNotes) {
      if (entry.short || entry.full) {
        expect(entry.short?.trim(), entry.key).toBeTruthy();
        expect(entry.full?.trim(), entry.key).toBeTruthy();
      } else {
        expect(entry.translation, entry.key).toBeDefined();
      }
    }
    const artistKeys = new Set(artistNotes.map((artist) => artist.key));
    for (const entry of [...albumNotes, ...songNotes]) expect(artistKeys.has(entry.artist)).toBe(true);
  });

  it('seeds representative albums and songs for the three example artists', () => {
    // Note files have no inherent order: compare as sorted sets.
    const albumKeysOf = (artist: string) => albumNotes.filter((a) => a.artist === artist).map((a) => a.key).sort();
    const songKeysOf = (artist: string) => songNotes.filter((s) => s.artist === artist).map((s) => s.key).sort();
    expect(albumKeysOf('kenshi-yonezu')).toEqual(['lost-corner', 'stray-sheep']);
    const listeningKeysOf = (artist: string) => songNotes.filter((s) => s.artist === artist && s.short).map((s) => s.key).sort();
    expect(listeningKeysOf('kenshi-yonezu')).toEqual(songKeysOf('kenshi-yonezu'));
    // Previously translation-only notes now also have listening prose.
    expect(songKeysOf('kenshi-yonezu')).toEqual(expect.arrayContaining(['flamingo', 'kanden', 'lemon', 'umi-no-yuurei']));
    const flamingo = songNotes.find((s) => s.key === 'flamingo');
    expect(flamingo?.short).toBeTruthy();
    expect(flamingo?.full).toBeTruthy();
    expect(flamingo?.translation).toBeDefined();
    expect(albumKeysOf('triples')).toEqual(['assemble', 'assemble24']);
    expect(songKeysOf('triples')).toEqual(['beam', 'before-the-rise', 'chowall', 'colorful', 'girls-never-die', 'new-look', 'rising', 'the-baddest']);
    expect(albumKeysOf('coldplay')).toEqual(['a-rush-of-blood', 'parachutes', 'viva-la-vida']);
    expect(songKeysOf('coldplay')).toEqual(['the-scientist', 'viva-la-vida', 'yellow']);
  });
});

describe('note lookup', () => {
  it('matches by Spotify ID first', () => {
    expect(getAlbumNote({ id: '052EiTRYh35MuDVJN9Emdh' })?.key).toBe('stray-sheep');
    expect(getSongNote({ id: '04TshWXkhV1qkqHzf31Hn6' })?.key).toBe('lemon');
    // The single and the album cut are both listed.
    expect(getSongNote({ id: '7Cd17G3oNQ34OWUwS8ZxfR' })?.key).toBe('lemon');
  });

  it('falls back to localised artist names and titles', () => {
    expect(getArtistNote({ id: 'unknown', name: '米津玄師' })?.key).toBe('kenshi-yonezu');
    expect(getSongNote({ id: 'other-edition', title: '感電', artistNames: ['米津玄師'] })?.key).toBe('kanden');
    expect(getSongNote({ title: 'Kaiju no Hanauta', artistNames: ['Vaundy'] })?.key).toBe('kaijuu-no-hanauta');
    expect(getAlbumNote({ name: 'ASSEMBLE24', artistNames: ['tripleS'], releaseDate: '2024-05-08' })?.key).toBe('assemble24');
  });

  it('requires the artist to match, and the year when both are known', () => {
    expect(getSongNote({ title: 'Yellow', artistNames: ['Someone Else'] })).toBeNull();
    expect(getAlbumNote({ name: 'Parachutes', artistNames: ['Coldplay'], releaseDate: '2021' })).toBeNull();
    expect(getAlbumNote({ name: 'Parachutes', artistNames: ['Coldplay'], releaseDate: null })?.key).toBe('parachutes');
  });

  it('finds a note with a curated translation, and says how it matched', () => {
    expect(findSongNote({ title: 'Flamingo', artistNames: ['米津玄師'] })).toMatchObject({ matchedBy: 'name', note: { key: 'flamingo' } });
    expect(findSongNote({ id: '04TshWXkhV1qkqHzf31Hn6' })).toMatchObject({ matchedBy: 'id', note: { key: 'lemon' } });
  });

  it('omits filler for entities without a note', () => {
    expect(getSongNote({ id: 'x', title: 'Audio 001', artistNames: ['Vaundy'] })).toBeNull();
    expect(getArtistNote({ id: '0TnOYISbd1XYRBk9myaseg', name: 'Pitbull' })).toBeNull();
    expect(getAlbumNote({})).toBeNull();
  });

  it('treats an entry without text as absent', () => {
    const sources = {
      artists: [{ key: 'a', artistIds: ['id'], names: ['A'], short: '  ' }],
      albums: [],
      songs: [],
    };
    expect(getArtistNote({ id: 'id' }, sources)).toBeNull();
  });
});

describe('normaliseTitle', () => {
  it('ignores case, width, brackets and edition suffixes', () => {
    expect(normaliseTitle('<ASSEMBLE24>')).toBe('assemble24');
    expect(normaliseTitle('＜ASSEMBLE24＞')).toBe('assemble24');
    expect(normaliseTitle('Viva La Vida')).toBe(normaliseTitle('viva la vida'));
    expect(normaliseTitle('Yellow - Remastered 2020')).toBe('yellow');
    expect(normaliseTitle('Clocks (feat. Someone)')).toBe('clocks');
  });
});
