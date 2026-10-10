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
const ENSEMBLE = '0ArcPreviewEnsemble';

export const PREVIEW_ARTISTS: ArtistDetail[] = [
  { id: KENSHI, name: 'Kenshi Yonezu' },
  { id: TRIPLES, name: 'tripleS' },
  { id: COLDPLAY, name: 'Coldplay' },
  { id: VAUNDY, name: 'Vaundy' },
  { id: TYLER, name: 'Tyler, The Creator' },
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
