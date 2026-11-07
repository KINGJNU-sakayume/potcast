/** Invented records for the board tests and `board/sample.json`. Nothing here is a real listening record. */
import { emptyDigData, membershipId, type ArtistDigProject, type DigData, type DigRelease, type DigTrack, type ListenEvent } from '../digging/types';
import type { BoardCoverSource } from './buildBoardTiles';

export const SAMPLE_NOW = new Date('2026-11-07T03:00:00Z');
const id22 = (c: string) => c.repeat(22).slice(0, 22);
const SCOPE = { album: true, single: false, compilation: false, appears_on: false };

interface AlbumSpec { key: string; artist: string; name: string; tracks: string[]; date: string }
const ARTISTS = [
  { key: 'R', name: 'Synthetic Artist' },
  { key: 'S', name: 'Another Voice' },
  { key: 'T', name: 'Third Room' },
];
const ALBUMS: AlbumSpec[] = [
  { key: 'a', artist: 'R', name: 'Imaginary Album', date: '2020-03-01', tracks: ['First Song', 'Second Song', 'Third Song', 'Fourth Song', 'Fifth Song'] },
  { key: 'b', artist: 'R', name: 'Second Imaginary', date: '2022-05-01', tracks: ['Opening', 'Middle', 'Closing', 'Encore'] },
  { key: 'c', artist: 'S', name: 'Made Up Hours', date: '2021-09-01', tracks: ['Morning', 'Noon', 'Night'] },
  { key: 'd', artist: 'S', name: 'Paper Weather', date: '2023-01-01', tracks: ['Drizzle', 'Fog', 'Clear'] },
  { key: 'e', artist: 'T', name: 'Finished Business', date: '2019-06-01', tracks: ['Start', 'Turn', 'End'] },
];

export const sampleCovers: BoardCoverSource[] = [
  { albumIds: [id22('a')], appleCover: 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/00/00/00/sample-a/source/1400x1400bb.jpg', cover: 'https://i.scdn.co/image/ab67616d00001e02aaaaaaaaaaaaaaaaaaaaaaaa' },
  { albumIds: [id22('b')], cover: 'https://i.scdn.co/image/ab67616d00001e02bbbbbbbbbbbbbbbbbbbbbbbb' },
];

export function sampleData(): DigData {
  const data = emptyDigData();
  const at = '2026-10-01T00:00:00Z';
  for (const a of ARTISTS) {
    const project: ArtistDigProject = {
      id: id22(a.key), name: a.name, images: [], genres: [], addedAt: at, updatedAt: at, scope: { ...SCOPE }, studioOnly: false,
      note: '', discographySyncedAt: at, catalogueComplete: true, origin: 'potcast',
    };
    data.projects.push(project);
  }
  for (const album of ALBUMS) {
    const artistId = id22(album.artist);
    const artistRef = { id: artistId, name: ARTISTS.find((a) => a.key === album.artist)!.name, uri: `spotify:artist:${artistId}` };
    const tracks: DigTrack[] = album.tracks.map((name, i) => ({
      id: id22(`${album.key}${i}`.padEnd(2, album.key)).slice(0, 20) + album.key + String(i), name, uri: '', artists: [artistRef], durationMs: 200_000, discNumber: 1, trackNumber: i + 1,
    }));
    const release: DigRelease = {
      id: id22(album.key), name: album.name, uri: `spotify:album:${id22(album.key)}`, artists: [artistRef],
      images: album.key === 'c' ? [{ url: `https://i.scdn.co/image/ab67616d0000b273${'c'.repeat(24)}`, width: 640, height: 640 }, { url: `https://i.scdn.co/image/ab67616d00001e02${'c'.repeat(24)}`, width: 300, height: 300 }] : [],
      albumType: 'album', releaseDate: album.date, releaseDatePrecision: 'day', totalTracks: tracks.length, trackIds: tracks.map((t) => t.id), tracksComplete: true, tracksSyncedAt: at,
    };
    data.tracks.push(...tracks);
    data.releases.push(release);
    data.memberships.push({ id: membershipId(artistId, release.id), artistId, albumId: release.id, group: 'album', override: 'auto', studio: null });
  }
  const track = (albumKey: string, i: number) => data.tracks.find((t) => t.id === data.releases.find((r) => r.id === id22(albumKey))!.trackIds[i])!;
  const heard = (albumKey: string, i: number, listenedAt: string, n: number): ListenEvent => {
    const t = track(albumKey, i);
    return { id: `e-${albumKey}${i}-${n}`, trackId: t.id, albumId: id22(albumKey), artistId: t.artists[0]!.id, listenedAt, source: 'manual', playbackVerified: false };
  };
  const plan: Array<[string, number, string]> = [
    ['e', 0, '2026-10-12T09:00:00Z'], ['e', 1, '2026-10-12T09:04:00Z'], ['e', 2, '2026-10-12T09:08:00Z'],
    ['c', 0, '2026-10-20T12:00:00Z'], ['c', 1, '2026-10-20T12:03:00Z'],
    ['a', 0, '2026-10-28T10:00:00Z'], ['a', 1, '2026-10-28T10:04:00Z'], ['a', 2, '2026-10-29T10:00:00Z'], ['a', 0, '2026-11-02T10:00:00Z'], ['a', 0, '2026-11-04T10:00:00Z'],
    ['b', 0, '2026-11-05T14:00:00Z'], ['b', 1, '2026-11-05T14:05:00Z'], ['b', 2, '2026-11-05T14:10:00Z'],
  ];
  plan.forEach(([k, i, when], n) => data.events.push(heard(k, i, when, n)));
  const status = new Set<string>();
  for (const e of data.events) status.add(e.trackId);
  for (const trackId of status) data.states.push({ id: trackId, status: 'listened', updatedAt: '2026-11-05T14:10:00Z' });
  data.completions.push({
    id: 'c1', artistId: id22('T'), kind: 'listened', completedAt: '2026-10-12T09:09:00Z', scope: { ...SCOPE }, studioOnly: false,
    releaseIds: [id22('e')], trackIds: data.releases.find((r) => r.id === id22('e'))!.trackIds, memberships: [],
  });
  return data;
}
