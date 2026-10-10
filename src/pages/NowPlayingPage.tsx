import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../app/pageTitle';
import { useSession } from '../app/sessionContext';
import { usePageSurface } from '../app/surface';
import { useAlbum } from '../catalogue/queries';
import { ArtistLinks } from '../components/ArtistLinks';
import { CoverImage } from '../components/CoverImage';
import { useNote } from '../components/NoteContext';
import { LyricsBlock } from '../components/player/LyricsBlock';
import { PlaybackNotice } from '../components/player/PlaybackNotice';
import { Progress, Transport } from '../components/player/Transport';
import { TransportExtras } from '../components/player/TransportExtras';
import { SongNotePreview, songNotePayload } from '../components/SongNote';
import { StateView } from '../components/StateView';
import { getSongNote } from '../editorial/lookup';
import { formatTrackNumber, joinArtistNames } from '../lib/format';
import { pickImageUrl } from '../lib/images';
import { useTimedLyrics } from '../lyrics/useTimedLyrics';
import { useEngine, usePlayerSelector, usePlayerSnapshot } from '../playback/hooks';
import { detectLineLanguage } from '../translation/languageDetect';

/**
 * The desktop Now Playing (v7.5, after player1): a big cover with the title
 * and artist · album beneath it on the left; on the right the lyrics — the
 * line just sung, the current line with its translation, the next two — the
 * one-line Listening note, then the seek bar and the transport line. The page
 * takes the playing album's colour. The full note opens in the shell's
 * right-hand column: on a 16:9 window the lyrics then run across and the album
 * drops to the bottom-left corner; on 21:9 the two columns simply stay.
 */
export function NowPlayingPage() {
  const snapshot = usePlayerSnapshot();
  const hydrated = usePlayerSelector((s) => s.hydrated);
  const track = snapshot.track;
  const album = useAlbum(track?.album.id || undefined);
  const lyricsState = useTimedLyrics(track);
  const { note, openNote, closeNote } = useNote();
  usePageTitle('Now Playing', track?.title ?? null);
  usePageSurface(track?.album.id ? { key: track.album.id, imageUrl: pickImageUrl(track.album.images, 64) } : null);

  const trackId = track?.spotifyTrackId;
  const noteId = trackId ? `track:${trackId}` : null;
  const noteOpen = Boolean(noteId && note?.id === noteId);
  // A new track closes the previous track's note.
  const openNoteId = useRef<string | undefined>(undefined);
  openNoteId.current = note?.id;
  useEffect(() => {
    const id = openNoteId.current;
    if (id?.startsWith('track:') && id !== noteId) closeNote();
  }, [noteId, closeNote]);

  if (!hydrated) return <NowPlayingLoading />;
  if (!track) return <NothingPlaying />;

  const detail = album.data;
  const albumName = detail?.name ?? track.album.name;
  const albumTrack = detail?.tracks.find((item) => item.id === track.spotifyTrackId || item.uri === track.uri);
  const lyricLanguage = lyricsState.status === 'ready' ? lyricsState.lyrics.language : undefined;
  const songNote = getSongNote({ id: track.spotifyTrackId, title: track.title, artistNames: track.artists.map((a) => a.name) });
  const titleLang = lyricLanguage ?? detectLineLanguage(track.title);
  const artistNames = joinArtistNames(track.artists) || 'Unknown artist';
  const noteContext = {
    title: track.title,
    titleLang,
    subtitle: `${artistNames} · ${albumName}${albumTrack ? ` · Track ${formatTrackNumber(albumTrack.trackNumber)}` : ''}`,
  };

  return (
    <div className="view active">
      <div className={noteOpen ? 'np note-open' : 'np'}>
        <div className="np-main">
          <div className="np-grid">
            <section className="np-object" aria-label="Now playing">
              <figure className="np-art">
                <div className="np-cover">
                  <CoverImage
                    images={track.album.images}
                    size={640}
                    alt={`${albumName} album cover`}
                    title={albumName}
                    subtitle={artistNames}
                    paletteKey={track.album.id}
                    priority
                  />
                </div>
                <figcaption className="np-caption">
                  <h1 lang={titleLang} title={track.title}>
                    {track.title}
                  </h1>
                  <div className="artist-line">
                    <ArtistLinks artists={track.artists} />
                    {track.album.id && (
                      <>
                        <span className="sep" aria-hidden="true">
                          {' · '}
                        </span>
                        <Link className="linkish" to={`/album/${track.album.id}`} lang={detectLineLanguage(albumName)}>
                          {albumName}
                        </Link>
                      </>
                    )}
                  </div>
                </figcaption>
              </figure>
            </section>

            <LyricsBlock key={track.spotifyTrackId} track={track} lyricsState={lyricsState} />

            <SongNotePreview
              note={songNote}
              {...noteContext}
              className="np-note"
              expanded={noteOpen}
              onOpen={() => {
                if (noteOpen) closeNote();
                else if (songNote && noteId) openNote({ ...songNotePayload(songNote, noteContext), id: noteId });
              }}
            />

            <div className="player-controls">
              <Progress />
              <div className="transport-row">
                <Transport />
                <TransportExtras />
              </div>
              <PlaybackNotice />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NowPlayingLoading() {
  const { mode } = useSession();
  return (
    <StateView label="Now playing" title={mode === 'preview' ? 'Opening the preview…' : 'Reading playback…'}>
      <p>{mode === 'preview' ? 'Loading the sample archive.' : 'ARC is reading the current playback state from Spotify.'}</p>
    </StateView>
  );
}

function NothingPlaying() {
  const sdk = usePlayerSelector((s) => s.sdk);
  const engine = useEngine();

  let title = 'No active track';
  let body = 'Start a track from your library, Search or another Spotify device. ARC follows the real playback session.';
  if (sdk.kind === 'loading') {
    title = 'Starting browser playback…';
    body = 'Connecting this browser to Spotify as the ARC Music Browser device. Music started on another device will appear here.';
  } else if (sdk.kind === 'error') {
    title = 'Browser playback unavailable';
    body = `${sdk.message} Start music on another Spotify device and it will appear here.`;
  }

  return (
    <StateView
      label="Now playing"
      title={title}
      actions={
        <>
          <Link className="plain-action" to="/library">
            Browse your library
          </Link>
          {sdk.kind === 'ready' && (
            <button
              type="button"
              className="plain-action"
              onClick={() => {
                engine.activateAudio();
                void engine.transferToBrowser(true);
              }}
            >
              Resume in this browser
            </button>
          )}
          <button type="button" className="plain-action" onClick={() => void engine.resync()}>
            Check again
          </button>
        </>
      }
    >
      <p>{body}</p>
      <PlaybackNotice />
    </StateView>
  );
}
