import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../app/pageTitle';
import { useAlbum, useArtist } from '../catalogue/queries';
import { CoverImage, Portrait } from '../components/CoverImage';
import { useNote } from '../components/NoteContext';
import { songNotePayload } from '../components/SongNote';
import { albumNotes } from '../editorial/albums';
import { artistNotes } from '../editorial/artists';
import { songNotes } from '../editorial/songs';
import type { AlbumNote, ArtistNote, EditorialBody, SongNote } from '../editorial/types';
import type { ImageRef } from '../domain/types';
import { formatTrackNumber, pluralise } from '../lib/format';
import { usePlay, usePlayerSelector } from '../playback/hooks';
import { detectLineLanguage } from '../translation/languageDetect';

interface SongEntry {
  song: SongNote;
  /** Position in the album note's tracklist; null for a song on no album note. */
  track: number | null;
}

/** An album's Listening notes in tracklist order; `album: null` holds the songs on no album note. */
interface SongGroup {
  album: AlbumNote | null;
  songs: SongEntry[];
}

interface ArtistEntry {
  artist: ArtistNote;
  albums: AlbumNote[];
  /** Every Listening note, in the order of `songGroups`. */
  songs: SongNote[];
  songGroups: SongGroup[];
}

const byTitle = (a: SongNote, b: SongNote) => a.titles[0]!.localeCompare(b.titles[0]!);

/** The artist's songs under their albums (oldest first, tracklist order), then the songs on no album note, A–Z. */
function groupSongs(albums: readonly AlbumNote[], songs: readonly SongNote[]): SongGroup[] {
  const byKey = new Map(songs.map((song) => [song.key, song]));
  const placed = new Set<string>();
  const groups: SongGroup[] = [];
  for (const album of albums) {
    const entries: SongEntry[] = [];
    (album.tracks ?? []).forEach((key, index) => {
      const song = byKey.get(key);
      if (!song || placed.has(key)) return;
      placed.add(key);
      entries.push({ song, track: index + 1 });
    });
    if (entries.length > 0) groups.push({ album, songs: entries });
  }
  const rest = songs.filter((song) => !placed.has(song.key)).sort(byTitle);
  if (rest.length > 0) groups.push({ album: null, songs: rest.map((song) => ({ song, track: null })) });
  return groups;
}

/** Every note in the archive, grouped under its artist. Pure data: no Spotify request. */
export function buildArchiveIndex(
  artists: readonly ArtistNote[] = artistNotes,
  albums: readonly AlbumNote[] = albumNotes,
  songs: readonly SongNote[] = songNotes,
): { entries: ArtistEntry[] } {
  const entries = [...artists]
    .sort((a, b) => a.names[0]!.localeCompare(b.names[0]!, 'en', { sensitivity: 'base' }))
    .map((artist) => {
      const own = albums.filter((a) => a.artist === artist.key).sort((a, b) => (a.releaseYear ?? 0) - (b.releaseYear ?? 0));
      const songGroups = groupSongs(
        own,
        songs.filter((s) => s.artist === artist.key),
      );
      return { artist, albums: own, songs: songGroups.flatMap((group) => group.songs.map((entry) => entry.song)), songGroups };
    });
  return { entries };
}

/** A note's stored artwork URL, else what Spotify has (loaded only when the note has none). */
function storedImage(url: string | undefined): ImageRef[] | null {
  return url ? [{ url, width: null, height: null }] : null;
}

function ReadMore({ kind, note, title, subtitle }: { kind: 'ARTIST' | 'ALBUM'; note: EditorialBody; title: string; subtitle?: string }) {
  const { openNote } = useNote();
  if (!note.full?.trim()) return null;
  const heading = 'Editorial note';
  const label = kind === 'ALBUM' ? 'Album' : 'Artist';
  return (
    <button
      type="button"
      className="row-play"
      aria-label={`Read the note on ${title}`}
      onClick={() =>
        openNote({
          context: `${heading} / ${label}`,
          title,
          subtitle,
          copy: note.full ?? '',
          titleLang: detectLineLanguage(title),
          written: note.written,
          updated: note.updated,
          sources: note.sources,
        })
      }
    >
      Read
    </button>
  );
}

function PlayTrack({ trackIds, title }: { trackIds: readonly string[]; title: string }) {
  const play = usePlay();
  const id = trackIds[0];
  if (!id) return null;
  return (
    <button type="button" className="row-play" aria-label={`Play ${title}`} onClick={() => play({ uris: [`spotify:track:${id}`] }, { openNowPlaying: true })}>
      Play
    </button>
  );
}

function ReadSong({ song, title, subtitle }: { song: SongNote; title: string; subtitle?: string }) {
  const { openNote } = useNote();
  if (!song.full?.trim() && !song.translation) return null;
  return (
    <button
      type="button"
      className="row-play"
      aria-label={`Read the note on ${title}`}
      onClick={() => openNote(songNotePayload(song, { title, subtitle, titleLang: detectLineLanguage(title) }))}
    >
      Read
    </button>
  );
}

/** One row per song: its Listening note (which carries the song's translation note, if any). */
function SongRow({ song, track, artistName }: SongEntry & { artistName: string }) {
  const title = song.titles[0]!;
  return (
    <li className="archive-row">
      <span className="archive-kind">
        {track === null ? 'Song' : formatTrackNumber(track)}
        {song.translation && ' · 번역'}
      </span>
      <span className="archive-text">
        <b lang={detectLineLanguage(title)}>{title}</b>
        {song.short && (
          <span className="archive-preview" lang="ko">
            {song.short}
          </span>
        )}
      </span>
      <span className="archive-actions">
        <ReadSong song={song} title={title} subtitle={artistName} />
        <PlayTrack trackIds={song.trackIds} title={title} />
      </span>
    </li>
  );
}

function AlbumCard({ album, artistName }: { album: AlbumNote; artistName: string }) {
  const title = album.titles[0]!;
  const albumId = album.albumIds[0];
  const stored = storedImage(album.cover);
  const fetched = useAlbum(stored ? undefined : albumId);
  return (
    <li className="archive-card">
      <CoverImage
        images={stored ?? fetched.data?.images ?? []}
        size={136}
        alt=""
        title={title}
        subtitle={artistName}
        paletteKey={albumId}
        className="archive-card-cover"
      />
      <div className="archive-card-text">
        <span className="archive-kind">{[album.releaseYear, 'Album'].filter(Boolean).join(' · ')}</span>
        <b lang={detectLineLanguage(title)}>
          {albumId ? (
            <Link className="linkish" to={`/album/${albumId}`}>
              {title}
            </Link>
          ) : (
            title
          )}
        </b>
        <span className="archive-card-preview" lang="ko">
          {album.short}
        </span>
        <span className="archive-actions">
          <ReadMore kind="ALBUM" note={album} title={title} subtitle={[artistName, album.releaseYear].filter(Boolean).join(' · ')} />
        </span>
      </div>
    </li>
  );
}

function ArtistPortrait({ artist, name }: { artist: ArtistNote; name: string }) {
  const stored = storedImage(artist.image);
  const fetched = useArtist(stored ? undefined : artist.artistIds[0]);
  return (
    <div className="archive-artist-portrait">
      <Portrait images={stored ?? fetched.data?.images ?? []} name={name} size={240} />
    </div>
  );
}

function entryCount({ albums, songs }: ArtistEntry): string {
  return [albums.length ? pluralise(albums.length, 'album note') : null, songs.length ? pluralise(songs.length, 'listening note') : null]
    .filter(Boolean)
    .join(' · ');
}

/** The chosen artist: the artist note and portrait, album notes as cards, then the Listening notes under their albums. */
function ArtistSection({ entry }: { entry: ArtistEntry }) {
  const { artist, albums, songs, songGroups } = entry;
  const name = artist.names[0]!;
  const artistId = artist.artistIds[0];
  return (
    <section className="archive-artist" aria-labelledby={`archive-${artist.key}`}>
      <div className="archive-artist-head">
        <div className="archive-artist-copy">
          <div className="label">Editorial note / Artist</div>
          <h2 id={`archive-${artist.key}`} lang={detectLineLanguage(name)}>
            {name}
          </h2>
          {artist.origin && <div className="archive-origin">{artist.origin}</div>}
          {artist.short && (
            <p className="archive-short" lang="ko">
              {artist.short}
            </p>
          )}
          <div className="archive-head-actions">
            <ReadMore kind="ARTIST" note={artist} title={name} subtitle={artist.origin} />
            {artistId && (
              <Link className="row-play" to={`/artist/${artistId}`}>
                Artist page →
              </Link>
            )}
          </div>
        </div>
        <ArtistPortrait artist={artist} name={name} />
      </div>

      {albums.length > 0 && (
        <div className="archive-group">
          <h3 className="archive-group-head">
            Album notes <span>{albums.length}</span>
          </h3>
          <ul className="archive-cards">
            {albums.map((album) => (
              <AlbumCard key={album.key} album={album} artistName={name} />
            ))}
          </ul>
        </div>
      )}

      {songs.length > 0 && (
        <div className="archive-group">
          <h3 className="archive-group-head">
            Listening notes <span>{songs.length}</span>
          </h3>
          {songGroups.map(({ album, songs: entries }) => {
            const heading = album ? album.titles[0]! : 'Other songs';
            return (
              <section key={album?.key ?? 'other'} className="archive-song-group" aria-label={heading}>
                <h4 className="archive-song-group-head">
                  {album?.releaseYear && <span className="archive-kind">{album.releaseYear}</span>}
                  <b lang={detectLineLanguage(heading)}>{heading}</b>
                  <span className="archive-kind">{pluralise(entries.length, 'note')}</span>
                </h4>
                <ul className="archive-rows">
                  {entries.map((songEntry) => (
                    <SongRow key={songEntry.song.key} {...songEntry} artistName={name} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The archive's own index, like the back of a book (v7.5): every artist with
 * a note on the left; the chosen artist's note, album notes and Listening
 * notes on the right. Notes open in the right-hand column. The chosen artist
 * lives in the address (`?artist=`). Built from the local notes, so it works
 * offline. Artwork is the note's `cover` / `image` URL; without one, the
 * chosen artist's covers and portrait come from Spotify when connected, and
 * the archive plates stand in otherwise.
 */
export function ArchivePage() {
  usePageTitle('Archive');
  const { entries } = buildArchiveIndex();
  const [params, setParams] = useSearchParams();
  const track = usePlayerSelector((s) => s.snapshot.track);
  const playingArtist = track?.artists.map((a) => a.id).filter(Boolean) ?? [];
  const chosen =
    entries.find((e) => e.artist.key === params.get('artist')) ??
    entries.find((e) => e.artist.artistIds.some((id) => playingArtist.includes(id))) ??
    entries[0];
  const totals = [
    pluralise(entries.length, 'artist'),
    pluralise(albumNotes.length, 'album note'),
    pluralise(songNotes.length, 'listening note'),
  ];

  return (
    <div className="view active">
      <div className="library-page archive-page">
        <div className="library-shell">
          <header className="library-head">
            <div className="artist-number">Personal music archive</div>
            <h1>Archive</h1>
            <p>{totals.join(' · ')} · works offline</p>
          </header>
          <div className="archive-layout">
            <nav className="archive-index" aria-label="Artists with notes">
              <ul>
                {entries.map((entry) => {
                  const name = entry.artist.names[0]!;
                  const current = entry === chosen;
                  return (
                    <li key={entry.artist.key}>
                      <button
                        type="button"
                        className="archive-index-item"
                        aria-current={current ? 'true' : undefined}
                        onClick={() => setParams({ artist: entry.artist.key }, { replace: true })}
                      >
                        <b lang={detectLineLanguage(name)}>{name}</b>
                        {entry.artist.origin && <span>{entry.artist.origin}</span>}
                        <small>{entryCount(entry)}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
            {chosen && <ArtistSection key={chosen.artist.key} entry={chosen} />}
          </div>
        </div>
      </div>
    </div>
  );
}
