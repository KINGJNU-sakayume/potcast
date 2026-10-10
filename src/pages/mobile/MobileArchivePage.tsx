import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../../app/pageTitle';
import { AlbumIcon, PlayIcon } from '../../components/icons';
import { useNote, type NotePayload } from '../../components/NoteContext';
import { songNotePayload } from '../../components/SongNote';
import { albumNotes } from '../../editorial/albums';
import { songNotes } from '../../editorial/songs';
import type { AlbumNote, ArtistNote, SongNote } from '../../editorial/types';
import { pluralise } from '../../lib/format';
import { usePlay } from '../../playback/hooks';
import { detectLineLanguage } from '../../translation/languageDetect';
import { buildArchiveIndex } from '../ArchivePage';
import { MobileChips } from './MobileParts';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'albums', label: 'Album notes' },
  { id: 'songs', label: 'Listening notes' },
] as const;
type ArchiveFilter = (typeof FILTERS)[number]['id'];

function artistPayload(artist: ArtistNote): NotePayload {
  const title = artist.names[0]!;
  return {
    context: 'Editorial note / Artist',
    title,
    subtitle: artist.origin,
    copy: artist.full ?? '',
    titleLang: detectLineLanguage(title),
    written: artist.written,
    updated: artist.updated,
    sources: artist.sources,
  };
}

function albumPayload(album: AlbumNote, artistName: string): NotePayload {
  const title = album.titles[0]!;
  return {
    context: 'Editorial note / Album',
    title,
    subtitle: [artistName, album.releaseYear].filter(Boolean).join(' · '),
    copy: album.full ?? '',
    titleLang: detectLineLanguage(title),
    written: album.written,
    updated: album.updated,
    sources: album.sources,
  };
}

function AlbumRow({ album, artistName, showArtist = false }: { album: AlbumNote; artistName: string; showArtist?: boolean }) {
  const { openNote } = useNote();
  const title = album.titles[0]!;
  const albumId = album.albumIds[0];
  return (
    <li className="m-arc-row">
      <button type="button" className="m-arc-hit" aria-haspopup="dialog" disabled={!album.full?.trim()} onClick={() => openNote(albumPayload(album, artistName))}>
        <span className="m-arc-kind">{[album.releaseYear ?? 'Album', showArtist ? artistName : 'Album'].join(' · ')}</span>
        <span className="m-arc-title" lang={detectLineLanguage(title)}>
          {title}
        </span>
        <span className="m-arc-preview" lang="ko">
          {album.short}
        </span>
      </button>
      {albumId && (
        <Link className="m-ctl" to={`/album/${albumId}`} aria-label={`Open ${title}`}>
          <AlbumIcon />
        </Link>
      )}
    </li>
  );
}

function SongRow({ song, artistName, showArtist = false }: { song: SongNote; artistName: string; showArtist?: boolean }) {
  const { openNote } = useNote();
  const play = usePlay();
  const title = song.titles[0]!;
  const trackId = song.trackIds[0];
  const readable = Boolean(song.full?.trim() || song.translation);
  return (
    <li className="m-arc-row">
      <button
        type="button"
        className="m-arc-hit"
        aria-haspopup="dialog"
        disabled={!readable}
        onClick={() => openNote(songNotePayload(song, { title, subtitle: artistName, titleLang: detectLineLanguage(title) }))}
      >
        <span className="m-arc-kind">
          {showArtist ? artistName : 'Song'}
          {song.translation && ' · 번역'}
        </span>
        <span className="m-arc-title" lang={detectLineLanguage(title)}>
          {title}
        </span>
        {song.short && (
          <span className="m-arc-preview" lang="ko">
            {song.short}
          </span>
        )}
      </button>
      {trackId && (
        <button type="button" className="m-ctl" aria-label={`Play ${title}`} onClick={() => play({ uris: [`spotify:track:${trackId}`] }, { openNowPlaying: true })}>
          <PlayIcon paused />
        </button>
      )}
    </li>
  );
}

/**
 * The phone's Archive: every artist with a note as a card that opens onto its
 * album and listening notes, or one flat list of album or listening notes.
 * Built from the local notes only, so it works offline.
 */
export function MobileArchivePage() {
  usePageTitle('Archive');
  const { openNote } = useNote();
  const { entries } = buildArchiveIndex();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.find((f) => f.id === params.get('show'))?.id ?? 'all') as ArchiveFilter;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const nameOf = new Map(entries.map((entry) => [entry.artist.key, entry.artist.names[0]!]));
  const totals = [pluralise(entries.length, 'artist'), pluralise(albumNotes.length, 'album note'), pluralise(songNotes.length, 'listening note')];

  return (
    <div className="m-page">
      <header className="m-page-head">
        <div>
          <div className="label">Personal music archive</div>
          <h1>Archive</h1>
          <p>{totals.join(' · ')}</p>
        </div>
      </header>
      <MobileChips label="Archive filter" options={FILTERS} value={filter} onChange={(id) => setParams(id === 'all' ? {} : { show: id }, { replace: true })} />
      <div className="m-page-body">
        {filter === 'all' &&
          entries.map(({ artist, albums, songs }) => {
            const name = artist.names[0]!;
            const artistId = artist.artistIds[0];
            const expanded = open.has(artist.key);
            const count = [albums.length ? pluralise(albums.length, 'album') : null, songs.length ? pluralise(songs.length, 'song') : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <section key={artist.key} className="m-arc-card" aria-labelledby={`m-arc-${artist.key}`}>
                <h2 id={`m-arc-${artist.key}`} lang={detectLineLanguage(name)}>
                  {artistId ? <Link to={`/artist/${artistId}`}>{name}</Link> : name}
                </h2>
                {artist.origin && <div className="m-arc-origin">{artist.origin}</div>}
                {artist.short && (
                  <p className="m-arc-short" lang="ko">
                    {artist.short}
                  </p>
                )}
                <div className="m-arc-tools">
                  {artist.full?.trim() ? (
                    <button type="button" className="note-more" aria-haspopup="dialog" onClick={() => openNote(artistPayload(artist))}>
                      Read artist note →
                    </button>
                  ) : (
                    <span />
                  )}
                  {count && (
                    <button
                      type="button"
                      className="text-toggle"
                      aria-expanded={expanded}
                      onClick={() =>
                        setOpen((current) => {
                          const next = new Set(current);
                          if (next.has(artist.key)) next.delete(artist.key);
                          else next.add(artist.key);
                          return next;
                        })
                      }
                    >
                      {count} {expanded ? '▴' : '▾'}
                    </button>
                  )}
                </div>
                {expanded && (
                  <ul className="m-arc-list">
                    {albums.map((album) => (
                      <AlbumRow key={album.key} album={album} artistName={name} />
                    ))}
                    {songs.map((song) => (
                      <SongRow key={song.key} song={song} artistName={name} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        {filter === 'albums' && (
          <ul className="m-arc-list flat">
            {[...albumNotes]
              .sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0))
              .map((album) => (
                <AlbumRow key={album.key} album={album} artistName={nameOf.get(album.artist) ?? album.artist} showArtist />
              ))}
          </ul>
        )}
        {filter === 'songs' && (
          <ul className="m-arc-list flat">
            {entries.flatMap(({ artist, songs }) =>
              songs.map((song) => <SongRow key={song.key} song={song} artistName={artist.names[0]!} showArtist />),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
