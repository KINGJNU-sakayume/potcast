import type {
  AlbumDetail,
  AlbumTrack,
  AlbumType,
  ArtistDetail,
  ArtistRef,
  PlaylistSummary,
  ReleaseDatePrecision,
  TrackIdentity,
} from '../domain/types';
import type { AlbumPalette } from '../palette/types';
import { TEST_LINES_EN, TEST_LINES_JA, TEST_LINES_KO_MIXED, buildTimedLines } from '../lyrics/providers/testLines';
import type { TimedLyrics } from '../lyrics/types';

/**
 * Offline preview catalogue — shown only when the listener chooses "Preview
 * without Spotify". Artist, album and noted-track IDs are real Spotify IDs,
 * so the local Editorial and Listening Notes apply exactly as they do with
 * Spotify connected. Track lists and durations are approximate sample data;
 * every lyric line is an original test line. Nothing here is used once
 * Spotify is connected.
 */

type LyricSet = 'en' | 'ja' | 'mixed' | 'instrumental' | null;

interface TrackDef {
  id: string;
  name: string;
  durationMs: number;
  lyrics?: LyricSet;
  /** Featured artists besides the album artists (makes the album an "Appears on" release for them). */
  guestIds?: string[];
}

interface AlbumDef {
  id: string;
  name: string;
  artistIds: string[];
  albumType: AlbumType;
  releaseDate: string;
  precision: ReleaseDatePrecision;
  totalTracks: number | null;
  label?: string;
  copyrights?: string[];
  /** Omitted when the preview does not include the track sequence. */
  tracks?: TrackDef[];
}

const TYLER = '4V8LLVI7PbaPR0K2TGSxFF';
const VAUNDY = '2IUl3m1H1EQ7QfNbNWvgru';
const TRIPLES = '5Z71xE9prhpHrqL5thVMyK';
const KENSHI = '1snhtMLeb2DYoMOcVbb8iB';
const COLDPLAY = '4gzpq5DPGxSnKTe4SA8HAU';
const KANYE = '5K4W6rqBFWDnAN6FQUkS6x';
const KING_CRIMSON = '7M1FPw29m5FbicYzS2xdpi';
const TURTLES = '2VIoWte1HPDbZ2WqHd2La7';
const RUN_DMC = '3CQIn7N5CuRDP8wEI7FiDA';
const PONDEROSA_TWINS = '4U8RRuQqYoeXH2JuTr6QMM';
const AL_GREEN = '3dkbV4qihUeMsqN4vBGg93';
const ENSEMBLE = '0ArcPreviewEnsemble';

export const PREVIEW_ARTISTS: ArtistDetail[] = [
  { id: KENSHI, name: 'Kenshi Yonezu' },
  { id: TRIPLES, name: 'tripleS' },
  { id: COLDPLAY, name: 'Coldplay' },
  { id: VAUNDY, name: 'Vaundy' },
  { id: TYLER, name: 'Tyler, The Creator' },
  { id: KANYE, name: 'Kanye West' },
  { id: KING_CRIMSON, name: 'King Crimson' },
  { id: TURTLES, name: 'The Turtles' },
  { id: RUN_DMC, name: 'Run–D.M.C.' },
  { id: PONDEROSA_TWINS, name: 'The Ponderosa Twins Plus One' },
  { id: AL_GREEN, name: 'Al Green' },
  { id: ENSEMBLE, name: 'ARC Preview Ensemble' },
].map((a) => ({ ...a, uri: `spotify:artist:${a.id}`, images: [], genres: [], followers: null }));

const pv = (key: string, n: number) => `0Pv${key}${String(n).padStart(2, '0')}`;

/** [title, seconds, lyric set]; `realIds` maps a 1-based position to its Spotify track ID. */
function tracks(key: string, list: Array<[string, number, LyricSet?]>, realIds: Record<number, string> = {}): TrackDef[] {
  return list.map(([name, seconds, lyrics = 'en'], index) => ({
    id: realIds[index + 1] ?? pv(key, index + 1),
    name,
    durationMs: seconds * 1000,
    lyrics,
  }));
}

const ALBUMS: AlbumDef[] = [
  {
    id: '2nkto6YNI4rUYTLqEwWJ3o',
    name: 'Flower Boy',
    artistIds: [TYLER],
    albumType: 'album',
    releaseDate: '2017-07-21',
    precision: 'day',
    totalTracks: 14,
    label: 'Columbia',
    // Track IDs and durations verified against the Spotify album embed.
    tracks: [
      { id: '33i3xxHB4YSYGYbtJrwwO8', name: "Foreword (feat. Rex Orange County)", durationMs: 194080, lyrics: 'en' },
      { id: '6KuXb26rHuRy3ZDse1VRmx', name: "Where This Flower Blooms (feat. Frank Ocean)", durationMs: 194933, lyrics: 'en' },
      { id: '4KgTrzmfiWNcVneh2Dd1Ou', name: "Sometimes...", durationMs: 36160, lyrics: 'en' },
      { id: '7KA4W4McWYRpgf0fWsJZWB', name: "See You Again (feat. Kali Uchis)", durationMs: 180386, lyrics: 'en' },
      { id: '21yRtB6B8EMounImAfHRCP', name: "Who Dat Boy (feat. A$AP Rocky)", durationMs: 205093, lyrics: 'en' },
      { id: '5SxlUF7J8tyFIEF22EomeP', name: "Pothole (feat. Jaden Smith)", durationMs: 237000, lyrics: 'en' },
      { id: '6ACiYjq5Q7e6BlhZEHz7cd', name: "Garden Shed (feat. Estelle)", durationMs: 223946, lyrics: 'en' },
      { id: '5WNYg3usc6H8N3MBEp4zVk', name: "Boredom (feat. Rex Orange County & Anna of the North)", durationMs: 320720, lyrics: 'en' },
      { id: '430qNtapCS3Ue1yoSql1oV', name: "I Ain't Got Time!", durationMs: 206266, lyrics: 'en' },
      { id: '4bEcoz1OcfMgUbp2ft8ieQ', name: "911 / Mr. Lonely (feat. Frank Ocean & Steve Lacy)", durationMs: 255653, lyrics: 'en' },
      { id: '39u2PsqrAZpZ0KPx6CjasV', name: "Droppin' Seeds (feat. Lil' Wayne)", durationMs: 60000, lyrics: 'en' },
      { id: '4XDpeWqPADoWRKcUY3dC84', name: "November", durationMs: 225346, lyrics: 'en' },
      { id: '0qtK3XwbuG153dmwB8iepL', name: "Glitter", durationMs: 224893, lyrics: 'en' },
      { id: '3R1Vu4Ws7UitwDxDHTol0P', name: "Enjoy Right Now, Today", durationMs: 235400, lyrics: 'instrumental' },
    ],
  },
  {
    id: '052EiTRYh35MuDVJN9Emdh',
    name: 'STRAY SHEEP',
    artistIds: [KENSHI],
    albumType: 'album',
    releaseDate: '2020-08-05',
    precision: 'day',
    totalTracks: 15,
    tracks: tracks(
      'Stray',
      [
        ['カムパネルラ', 254, 'ja'],
        ['Flamingo', 178, 'ja'],
        ['感電', 265, 'ja'],
        ['PLACEBO + 野田洋次郎', 208, 'ja'],
        ['パプリカ', 204, 'ja'],
        ['馬と鹿', 273, 'ja'],
        ['優しい人', 280, 'ja'],
        ['Lemon', 256, 'ja'],
        ['まちがいさがし', 302, 'ja'],
        ['ひまわり', 251, 'ja'],
        ['迷える羊', 272, 'ja'],
        ['Décolleté', 216, 'ja'],
        ['TEENAGE RIOT', 211, 'ja'],
        ['海の幽霊', 283, 'ja'],
        ['カナリヤ', 283, 'ja'],
      ],
      { 3: '6H0PLsSYMzDOqhLgyOlzIj', 8: '04TshWXkhV1qkqHzf31Hn6' },
    ),
  },
  {
    id: '2HfY1kPSmmYfR13OSKYH5T',
    name: 'LOST CORNER',
    artistIds: [KENSHI],
    albumType: 'album',
    releaseDate: '2024-08-21',
    precision: 'day',
    totalTracks: null,
  },
  // Sample entries (0Arc… IDs) so the preview discography shows an edition group and more than one single.
  {
    id: '0ArcPvStraySheepDeluxe',
    name: 'STRAY SHEEP (Deluxe Edition)',
    artistIds: [KENSHI],
    albumType: 'album',
    releaseDate: '2020-08-05',
    precision: 'day',
    totalTracks: 15,
  },
  {
    id: '0ArcPvKickBackSingle01',
    name: 'KICK BACK',
    artistIds: [KENSHI],
    albumType: 'single',
    releaseDate: '2022-10-12',
    precision: 'day',
    totalTracks: 2,
  },
  {
    id: '4Ezkdjk13wY1bdXc5kDJHG',
    name: 'Lemon',
    artistIds: [KENSHI],
    albumType: 'single',
    releaseDate: '2018-03-14',
    precision: 'day',
    totalTracks: 3,
    tracks: tracks(
      'LemonSingle',
      [
        ['Lemon', 256, 'ja'],
        ['クランベリーとパンケーキ', 211, 'ja'],
        ['Paper Flower', 275, 'ja'],
      ],
      { 1: '7Cd17G3oNQ34OWUwS8ZxfR', 2: '0vaqZ9QxzfoyI1K4l3DbJm', 3: '2JzRY7DvaqKqBrehWmsb3E' },
    ),
  },
  {
    id: '1FEdDqMaOL8oZYzI4n27GM',
    name: '<ASSEMBLE24>',
    artistIds: [TRIPLES],
    albumType: 'album',
    releaseDate: '2024',
    precision: 'year',
    totalTracks: 10,
    tracks: tracks(
      'Assemble24',
      [
        ['S', 73, null],
        ['Girls Never Die', 188, 'mixed'],
        ['Heart Raider', 179, 'mixed'],
        ['Midnight Flower', 166, 'mixed'],
        ['White Soul Sneakers', 183, 'mixed'],
        ['Chiyu', 170, 'mixed'],
        ['24', 153, 'mixed'],
        ['Beyond the Beyond', 182, 'mixed'],
        ['Non Scale', 206, 'mixed'],
        ['Dimension', 197, 'mixed'],
      ],
      { 2: '45OflED18VsURGw2z0Y6Cv' },
    ),
  },
  {
    id: '6ArYgWdHk7mcG4knENgPN5',
    name: 'ASSEMBLE',
    artistIds: [TRIPLES],
    albumType: 'album',
    releaseDate: '2023',
    precision: 'year',
    totalTracks: null,
  },
  {
    id: '6ZG5lRT77aJ3btmArcykra',
    name: 'Parachutes',
    artistIds: [COLDPLAY],
    albumType: 'album',
    releaseDate: '2000',
    precision: 'year',
    totalTracks: 10,
    tracks: tracks(
      'Parachutes',
      [
        ["Don't Panic", 137],
        ['Shiver', 304],
        ['Spies', 318],
        ['Sparks', 227],
        ['Yellow', 267],
        ['Trouble', 273],
        ['Parachutes', 46],
        ['High Speed', 254],
        ['We Never Change', 249],
        ["Everything's Not Lost", 435],
      ],
      { 5: '3AJwUDP919kvQ9QcozQPxg', 7: '4qzoHxgp42ylb18ga1SWTL' },
    ),
  },
  {
    id: '0RHX9XECH8IVI3LNgWDpmQ',
    name: 'A Rush of Blood to the Head',
    artistIds: [COLDPLAY],
    albumType: 'album',
    releaseDate: '2002',
    precision: 'year',
    totalTracks: 11,
    tracks: tracks(
      'Rush',
      [
        ['Politik', 318],
        ['In My Place', 228],
        ['God Put a Smile upon Your Face', 297],
        ['The Scientist', 310],
        ['Clocks', 308],
        ['Daylight', 327],
        ['Green Eyes', 223],
        ['Warning Sign', 331],
        ['A Whisper', 238],
        ['A Rush of Blood to the Head', 351],
        ['Amsterdam', 319],
      ],
      { 4: '75JFxkI2RXiU7L9VXzMkle', 5: '0BCPKOYdS2jbQ8iyB56Zns' },
    ),
  },
  {
    id: '1CEODgTmTwLyabvwd7HBty',
    name: 'Viva La Vida or Death and All His Friends',
    artistIds: [COLDPLAY],
    albumType: 'album',
    releaseDate: '2008',
    precision: 'year',
    totalTracks: 10,
    tracks: tracks(
      'Viva',
      [
        ['Life in Technicolor', 149, 'instrumental'],
        ['Cemeteries of London', 201],
        ['Lost!', 235],
        ['42', 237],
        ['Lovers in Japan / Reign of Love', 411],
        ['Yes', 426],
        ['Viva La Vida', 242],
        ['Violet Hill', 222],
        ['Strawberry Swing', 249],
        ['Death and All His Friends', 378],
      ],
      { 7: '1mea3bSkSGXuIRvnydlB5b' },
    ),
  },
  {
    id: '4dKFBa0YCH4636ZtY4L2p7',
    name: 'strobo',
    artistIds: [VAUNDY],
    albumType: 'album',
    releaseDate: '2020',
    precision: 'year',
    totalTracks: 11,
    tracks: tracks(
      'Strobo',
      [
        ['Audio 001', 23, null],
        ['灯火', 178, 'ja'],
        ['東京フラッシュ', 258, 'ja'],
        ['怪獣の花唄', 224, 'ja'],
        ['life hack', 226, 'ja'],
        ['不可幸力', 200, 'ja'],
        ['soramimi', 213, 'ja'],
        ['Audio 002', 68, null],
        ['napori', 203, 'ja'],
        ['僕は今日も', 327, 'ja'],
        ['Bye by me', 242, 'ja'],
      ],
      { 4: '1pCcNaCodPssCc8Aq68gPS' },
    ),
  },
  {
    id: '5zi7WsKlIiUXv09tbGLKsE',
    name: 'IGOR',
    artistIds: [TYLER],
    albumType: 'album',
    releaseDate: '2019-05-17',
    precision: 'day',
    totalTracks: 12,
    tracks: tracks(
      'Igor',
      [
        ["IGOR'S THEME", 200],
        ['EARFQUAKE', 190],
        ['I THINK', 212],
        ['EXACTLY WHAT YOU RUN FROM YOU END UP CHASING', 14, null],
        ['RUNNING OUT OF TIME', 177],
        ['NEW MAGIC WAND', 195],
        ['A BOY IS A GUN*', 210],
        ['PUPPET', 179],
        ["WHAT'S GOOD", 205],
        ['GONE, GONE / THANK YOU', 375],
        ["I DON'T LOVE YOU ANYMORE", 161],
        ['ARE WE STILL FRIENDS?', 265],
      ],
      { 1: '51RN0kzWd7xeR4th5HsEtW', 2: '5hVghJ4KaYES3BFUATCYn0' },
    ),
  },
  {
    id: '20r762YmB5HeofjMCiPMLv',
    name: 'My Beautiful Dark Twisted Fantasy',
    artistIds: [KANYE],
    albumType: 'album',
    releaseDate: '2010-11-22',
    precision: 'day',
    totalTracks: 13,
    tracks: tracks(
      'Mbdtf',
      [
        ['Dark Fantasy', 281],
        ['Gorgeous', 358],
        ['POWER', 292],
        ['All Of The Lights (Interlude)', 62, 'instrumental'],
        ['All Of The Lights', 300],
        ['Monster', 379],
        ['So Appalled', 398],
        ['Devil In A New Dress', 353],
        ['Runaway', 548],
        ['Hell Of A Life', 328],
        ['Blame Game', 470],
        ['Lost In The World', 257],
        ['Who Will Survive In America', 98],
      ],
      {
        1: '7yNK27ZTpHew0c55VvIJgm',
        2: '23SZWX2IaDnxmhFsSLvkG2',
        3: '2gZUPNdnz5Y45eiGxpHGSc',
        4: '4D6TpthzUVNTjWQqfBW5Kb',
        5: '22L7bfCiAkJo5xGSQgmiIO',
        6: '1ZHYJ2Wwgxes4m8Ba88PeK',
        7: '6K07Ahf6V7CAQn0ikrOztl',
        8: '1UGD3lW3tDmgZfAVDh6w7r',
        9: '3DK6m7It6Pw857FcQftMds',
        10: '3rCNmRonlHN1TXQLcG3dSk',
        11: '4EndPA8b6FDWYp1RgsnLEB',
        12: '2Im64pIz6m0EJKdUe6eZ8r',
        13: '4e5IPJxSGVWPsaxQzdRseN',
      },
    ),
  },
  // The records the MBDTF episode steps out to: only the one track of each that it plays.
  {
    id: '75ol9OP8bJaRqzGimpFHDm',
    name: 'In The Court Of The Crimson King',
    artistIds: [KING_CRIMSON],
    albumType: 'album',
    releaseDate: '1969-10-10',
    precision: 'day',
    totalTracks: null,
  },
  {
    id: '155OAoTAYR4Uu0LpSMvy5W',
    name: 'The Turtles Present The Battle of the Bands',
    artistIds: [TURTLES],
    albumType: 'album',
    releaseDate: '1968',
    precision: 'year',
    totalTracks: null,
  },
  // The records the IGOR episode steps out to, likewise.
  {
    id: '0PanG8trSzqFIX7pZmCVFG',
    name: 'Raising Hell',
    artistIds: [RUN_DMC],
    albumType: 'album',
    releaseDate: '1986-05-15',
    precision: 'day',
    totalTracks: null,
  },
  {
    id: '1xdgLmTFMSyJyI5DJOOX7T',
    name: '2+2+1 = (2023 Remastered Version)',
    artistIds: [PONDEROSA_TWINS],
    albumType: 'album',
    releaseDate: '1971',
    precision: 'year',
    totalTracks: null,
  },
  {
    id: '4oKs5WMY4xKsxFgdeY5bKw',
    name: 'The Belle Album',
    artistIds: [AL_GREEN],
    albumType: 'album',
    releaseDate: '1977',
    precision: 'year',
    totalTracks: null,
  },
  {
    id: '0ArcTestPressing01',
    name: 'Test Pressing',
    artistIds: [ENSEMBLE],
    albumType: 'album',
    releaseDate: '2026-09-01',
    precision: 'day',
    totalTracks: 6,
    label: 'ARC Preview',
    copyrights: ['℗ 2026 ARC Preview — sample data for the offline preview'],
    tracks: tracks('TestPress', [
      ['Rule and Margin', 214, 'en'],
      ['Index Card', 178, 'ja'],
      ['Paper Weight', 252, 'instrumental'],
      ['Thin Line', 201, 'mixed'],
      ['Catalogue Number', 227, null],
      ['Last Proof', 305, 'en'],
    ]).map((track) => (track.name === 'Index Card' ? { ...track, guestIds: [KENSHI] } : track)),
  },
];

/** Tracks that are playable in the preview although their album's sequence is not included. */
const LOOSE_TRACKS: Array<{ albumId: string; track: TrackDef }> = [
  { albumId: '2HfY1kPSmmYfR13OSKYH5T', track: { id: '7oYCBKvdjrqp5vDbhDBuac', name: 'KICK BACK', durationMs: 194_000, lyrics: 'ja' } },
  { albumId: '6ArYgWdHk7mcG4knENgPN5', track: { id: '6QCPweR3aP6nj7P43WpiZs', name: 'Rising', durationMs: 160_000, lyrics: 'mixed' } },
  { albumId: '75ol9OP8bJaRqzGimpFHDm', track: { id: '2MfrET7Nc3StKQcGoZKqr9', name: '21st Century Schizoid Man', durationMs: 442_000, lyrics: 'en' } },
  { albumId: '155OAoTAYR4Uu0LpSMvy5W', track: { id: '7j1ABZOylWUPUIZTt5x6AL', name: 'You Showed Me', durationMs: 196_000, lyrics: 'en' } },
  { albumId: '0PanG8trSzqFIX7pZmCVFG', track: { id: '0GqbUEtAVs0CKLEh1lsQ1S', name: 'Hit It Run', durationMs: 191_000, lyrics: 'en' } },
  { albumId: '1xdgLmTFMSyJyI5DJOOX7T', track: { id: '7zye9v6B785eFWEFYs13C2', name: 'Bound - 2023 Remastered Version', durationMs: 191_000, lyrics: 'en' } },
  { albumId: '4oKs5WMY4xKsxFgdeY5bKw', track: { id: '5X7DKwZ5e0JE3XoIakaT2Q', name: 'Dream', durationMs: 453_000, lyrics: 'en' } },
];

const artistById = new Map(PREVIEW_ARTISTS.map((a) => [a.id, a]));

function artistRefs(ids: string[]): ArtistRef[] {
  return ids.flatMap((id) => {
    const artist = artistById.get(id);
    return artist ? [{ id: artist.id, name: artist.name, uri: artist.uri }] : [];
  });
}

function toAlbumTrack(def: TrackDef, album: AlbumDef, index: number): AlbumTrack {
  return {
    id: def.id,
    uri: `spotify:track:${def.id}`,
    name: def.name,
    artists: artistRefs([...album.artistIds, ...(def.guestIds ?? [])]),
    durationMs: def.durationMs,
    trackNumber: index + 1,
    discNumber: 1,
    explicit: false,
    isPlayable: true,
  };
}

function toAlbumDetail(album: AlbumDef): AlbumDetail {
  const albumTracks = (album.tracks ?? []).map((t, i) => toAlbumTrack(t, album, i));
  return {
    id: album.id,
    uri: `spotify:album:${album.id}`,
    name: album.name,
    artists: artistRefs(album.artistIds),
    images: [],
    albumType: album.albumType,
    releaseDate: album.releaseDate,
    releaseDatePrecision: album.precision,
    totalTracks: album.totalTracks,
    tracks: albumTracks,
    tracksComplete: Boolean(album.tracks),
    totalDurationMs: albumTracks.reduce((sum, t) => sum + t.durationMs, 0),
    label: album.label ?? null,
    copyrights: album.copyrights ?? [],
  };
}

export const PREVIEW_ALBUMS: AlbumDetail[] = ALBUMS.map(toAlbumDetail);
const albumById = new Map(PREVIEW_ALBUMS.map((a) => [a.id, a]));

function toIdentity(def: TrackDef, album: AlbumDetail): TrackIdentity {
  return {
    spotifyTrackId: def.id,
    uri: `spotify:track:${def.id}`,
    title: def.name,
    artists: album.artists,
    album: { id: album.id, name: album.name, uri: album.uri, images: [] },
    durationMs: def.durationMs,
    explicit: false,
  };
}

const trackDefs: Array<{ def: TrackDef; album: AlbumDetail }> = [
  ...ALBUMS.flatMap((album) => (album.tracks ?? []).map((def) => ({ def, album: albumById.get(album.id)! }))),
  ...LOOSE_TRACKS.map(({ albumId, track }) => ({ def: track, album: albumById.get(albumId)! })),
];

export const PREVIEW_TRACKS: TrackIdentity[] = trackDefs.map(({ def, album }) => toIdentity(def, album));
const trackByUri = new Map(PREVIEW_TRACKS.map((t) => [t.uri, t]));

export function previewTrack(uri: string): TrackIdentity | undefined {
  return trackByUri.get(uri);
}

export function previewAlbum(id: string): AlbumDetail | undefined {
  return albumById.get(id);
}

export function previewArtist(id: string): ArtistDetail | undefined {
  return artistById.get(id);
}

export function previewAlbumTracks(albumId: string): TrackIdentity[] {
  return PREVIEW_TRACKS.filter((t) => t.album.id === albumId);
}

/* ── Lyrics (original test lines) ───────────────────────────────────────── */

const LINE_SETS: Record<Exclude<LyricSet, null | 'instrumental'>, { texts: readonly string[]; language: string }> = {
  en: { texts: TEST_LINES_EN, language: 'en' },
  ja: { texts: TEST_LINES_JA, language: 'ja' },
  mixed: { texts: TEST_LINES_KO_MIXED, language: 'ko' },
};

export const PREVIEW_LYRICS: Record<string, TimedLyrics> = Object.fromEntries(
  trackDefs.flatMap(({ def }): Array<[string, TimedLyrics]> => {
    if (!def.lyrics) return [];
    if (def.lyrics === 'instrumental') return [[def.id, { lines: [], instrumental: true }]];
    const set = LINE_SETS[def.lyrics];
    return [[def.id, { language: set.language, lines: buildTimedLines(set.texts, def.durationMs) }]];
  }),
);

/* ── Library surfaces ───────────────────────────────────────────────────── */

const uri = (id: string) => `spotify:track:${id}`;

const LEMON = '04TshWXkhV1qkqHzf31Hn6';
const KANDEN = '6H0PLsSYMzDOqhLgyOlzIj';
const KICK_BACK = '7oYCBKvdjrqp5vDbhDBuac';
const GIRLS_NEVER_DIE = '45OflED18VsURGw2z0Y6Cv';
const RISING = '6QCPweR3aP6nj7P43WpiZs';
const YELLOW = '3AJwUDP919kvQ9QcozQPxg';
const SCIENTIST = '75JFxkI2RXiU7L9VXzMkle';
const VIVA = '1mea3bSkSGXuIRvnydlB5b';
const CLOCKS = '0BCPKOYdS2jbQ8iyB56Zns';
const KAIJUU = '1pCcNaCodPssCc8Aq68gPS';
const EARFQUAKE = '5hVghJ4KaYES3BFUATCYn0';

/** [track id, minutes ago] */
export const PREVIEW_RECENTLY_PLAYED: Array<[string, number]> = [
  [KANDEN, 6],
  [GIRLS_NEVER_DIE, 19],
  [VIVA, 44],
  [KAIJUU, 71],
  [pv('TestPress', 1), 132],
  [SCIENTIST, 205],
  [KICK_BACK, 1470],
  [EARFQUAKE, 1530],
  [RISING, 2900],
  [pv('Rush', 1), 4400],
];

interface PreviewPlaylist extends PlaylistSummary {
  trackUris: string[];
}

const playlist = (id: string, name: string, description: string | null, trackIds: string[]): PreviewPlaylist => ({
  id,
  uri: `spotify:playlist:${id}`,
  name,
  description,
  images: [],
  ownerName: 'You',
  itemCount: trackIds.length,
  trackUris: trackIds.map(uri),
});

export const PREVIEW_PLAYLISTS: PreviewPlaylist[] = [
  playlist('0ArcNotedSongs01', 'Noted songs', 'Every track with a Listening Note in the archive.', [
    LEMON,
    KANDEN,
    KICK_BACK,
    GIRLS_NEVER_DIE,
    RISING,
    YELLOW,
    SCIENTIST,
    VIVA,
    KAIJUU,
    EARFQUAKE,
  ]),
  playlist('0ArcLateDesk0001', 'Late desk', 'Quiet records for the last hour of work.', [
    pv('TestPress', 1),
    pv('Parachutes', 1),
    pv('Stray', 14),
    pv('Rush', 11),
    pv('TestPress', 4),
  ]),
  playlist('0ArcMorningIdx01', 'Morning index', null, [pv('Viva', 8), GIRLS_NEVER_DIE, pv('Stray', 2), pv('TestPress', 6)]),
];

export const PREVIEW_SAVED_ALBUM_IDS = [
  '052EiTRYh35MuDVJN9Emdh',
  '1FEdDqMaOL8oZYzI4n27GM',
  '0RHX9XECH8IVI3LNgWDpmQ',
  '1CEODgTmTwLyabvwd7HBty',
  '2HfY1kPSmmYfR13OSKYH5T',
  '6ZG5lRT77aJ3btmArcykra',
  '4dKFBa0YCH4636ZtY4L2p7',
  '5zi7WsKlIiUXv09tbGLKsE',
  '0ArcTestPressing01',
];

/** Liked Songs, most recently liked first. */
export const PREVIEW_LIKED_TRACK_URIS = [
  uri(LEMON),
  uri(GIRLS_NEVER_DIE),
  uri(SCIENTIST),
  uri(KANDEN),
  uri(VIVA),
  uri(RISING),
  uri(YELLOW),
  uri(KICK_BACK),
  uri(KAIJUU),
  uri(EARFQUAKE),
  uri(pv('TestPress', 1)),
  uri(pv('Stray', 6)),
  uri(CLOCKS),
  uri(pv('Assemble24', 3)),
];

export const PREVIEW_INITIALLY_SAVED_URIS = [...PREVIEW_LIKED_TRACK_URIS];

export const PREVIEW_FOLLOWED_ARTIST_IDS = [KENSHI, TRIPLES, COLDPLAY, VAUNDY, TYLER, ENSEMBLE];

/* ── Palettes (preview has no artwork; these colour the plates and accent) ── */

const palette = (dominant: string, secondary: string, accent: string, light: string, dark: string): AlbumPalette => ({
  dominant,
  secondary,
  accent,
  light,
  dark,
});

/** The v7 reference accents for its three subjects, plus restrained plate colours for the rest. */
export const PREVIEW_PALETTES: Array<[albumId: string, palette: AlbumPalette]> = [
  ['4dKFBa0YCH4636ZtY4L2p7', palette('#b91f2e', '#20302d', '#d9c6a6', '#e7dec9', '#101315')],
  ['5zi7WsKlIiUXv09tbGLKsE', palette('#d88fae', '#2d292b', '#f6d8e4', '#f0d9df', '#161416')],
  ['20r762YmB5HeofjMCiPMLv', palette('#b0302a', '#2a1a18', '#f0c9c4', '#f1dedb', '#1a1110')],
  ['75ol9OP8bJaRqzGimpFHDm', palette('#c0486a', '#2a2130', '#7fb4d6', '#efe1e4', '#1b141a')],
  ['155OAoTAYR4Uu0LpSMvy5W', palette('#c9a13a', '#2b2a22', '#3f6e63', '#f1ead3', '#17160f')],
  ['0PanG8trSzqFIX7pZmCVFG', palette('#b3392f', '#1e1c1c', '#d8d2c4', '#eeeae2', '#121111')],
  ['1xdgLmTFMSyJyI5DJOOX7T', palette('#a8693a', '#2a2219', '#e2c99a', '#f2e8d6', '#17120d')],
  ['4oKs5WMY4xKsxFgdeY5bKw', palette('#5f7f9a', '#1f2328', '#d9c7a1', '#ecebe5', '#121518')],
  ['1FEdDqMaOL8oZYzI4n27GM', palette('#e76046', '#e1caa7', '#e9eff0', '#ece2d1', '#2a211d')],
  ['6ArYgWdHk7mcG4knENgPN5', palette('#4f6fb3', '#dfe4ef', '#e76046', '#e9edf5', '#1b2233')],
  ['052EiTRYh35MuDVJN9Emdh', palette('#3f6f8f', '#e5e1d6', '#c9a86a', '#ece9e1', '#16222b')],
  ['2HfY1kPSmmYfR13OSKYH5T', palette('#b8452f', '#2b2623', '#e0c9a0', '#efe4d6', '#1a1512')],
  ['4Ezkdjk13wY1bdXc5kDJHG', palette('#c9a227', '#2a2a24', '#f1e3a4', '#f4efd9', '#161611')],
  ['6ZG5lRT77aJ3btmArcykra', palette('#c89b2b', '#151515', '#e8d9a8', '#f1ead6', '#0d0d0d')],
  ['0RHX9XECH8IVI3LNgWDpmQ', palette('#6f6a61', '#d9d4c8', '#a79c86', '#ebe7de', '#1c1b19')],
  ['1CEODgTmTwLyabvwd7HBty', palette('#8c3a2b', '#d8c7a3', '#2f4a63', '#efe6d4', '#1d1510')],
];

/** Where the preview starts: a noted track, one minute in. */
export const PREVIEW_START = {
  contextUri: 'spotify:album:052EiTRYh35MuDVJN9Emdh',
  trackUri: uri(LEMON),
  positionMs: 57_000,
};
