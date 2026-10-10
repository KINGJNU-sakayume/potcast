import { describe, expect, it } from 'vitest';
import type { AlbumNote, ArtistNote, SongNote } from '../editorial/types';
import { buildArchiveIndex } from './ArchivePage';

const artist: ArtistNote = { key: 'a', artistIds: ['x'], names: ['A'], short: 's' };
const album = (key: string, releaseYear: number, tracks: string[]): AlbumNote => ({ key, artist: 'a', albumIds: [], titles: [key], releaseYear, tracks, short: 's' });
const song = (key: string, title = key): SongNote => ({ key, artist: 'a', trackIds: [], titles: [title], short: 's' });

describe('buildArchiveIndex', () => {
  it('lists Listening notes under their albums in tracklist order, then the songs on no album A–Z', () => {
    const albums = [album('second', 2010, ['s4', 's5', 'gone']), album('first', 2005, ['s3', 's1', 's2', 's5'])];
    const songs = [song('s1'), song('s2'), song('s3'), song('s4'), song('s5'), song('zz', 'Zebra'), song('aa', 'Apple')];
    const [entry] = buildArchiveIndex([artist], albums, songs).entries;
    expect(entry!.songGroups.map((group) => [group.album?.key ?? null, group.songs.map((s) => `${s.song.key}:${s.track}`)])).toEqual([
      // A song on two albums is listed once, under the older one.
      ['first', ['s3:1', 's1:2', 's2:3', 's5:4']],
      ['second', ['s4:1']],
      [null, ['aa:null', 'zz:null']],
    ]);
    expect(entry!.songs.map((s) => s.key)).toEqual(['s3', 's1', 's2', 's5', 's4', 'aa', 'zz']);
  });
});
