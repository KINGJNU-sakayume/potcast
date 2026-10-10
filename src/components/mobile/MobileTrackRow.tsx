import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSavedState, useToggleSaved } from '../../catalogue/queries';
import type { TrackIdentity } from '../../domain/types';
import { getSongNote } from '../../editorial/lookup';
import { joinArtistNames } from '../../lib/format';
import { usePlay } from '../../playback/hooks';
import { detectLineLanguage } from '../../translation/languageDetect';
import { BottomSheet } from '../BottomSheet';
import { CoverImage } from '../CoverImage';
import { AlbumIcon, ArchiveIcon, ArtistIcon, HeartIcon, MoreIcon, PlayIcon } from '../icons';
import { useNote } from '../NoteContext';
import { PlayingMark } from '../PlayingMark';
import { songNotePayload } from '../SongNote';

export const songNoteFor = (track: TrackIdentity) =>
  getSongNote({ id: track.spotifyTrackId, title: track.title, artistNames: track.artists.map((a) => a.name) });

/**
 * A track on a phone list: cover, title, artist · album, and on the right the
 * playing mark, the NOTE mark and ⋯ for the track's menu. Tapping the row plays.
 */
export function MobileTrackRow({
  track,
  onPlay,
  current,
  meta,
}: {
  track: TrackIdentity;
  onPlay: () => void;
  current?: { playing: boolean } | null;
  /** Replaces "artist · album" (e.g. with when it was played). */
  meta?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const noted = songNoteFor(track) !== null;
  const artists = joinArtistNames(track.artists);
  return (
    <li className={current ? 'm-row is-playing' : 'm-row'} aria-current={current ? 'true' : undefined}>
      <button type="button" className="m-row-hit" onClick={onPlay} aria-label={`Play ${track.title} by ${artists}`}>
        <CoverImage images={track.album.images} size={48} alt="" title={track.album.name} paletteKey={track.album.id} className="m-row-cover" />
        <span className="m-row-text">
          <span className="m-row-title" lang={detectLineLanguage(track.title)}>
            {track.title}
          </span>
          <span className="m-row-meta">{meta ?? `${artists} · ${track.album.name}`}</span>
        </span>
      </button>
      <span className="m-row-aside">
        {current && <PlayingMark playing={current.playing} />}
        {noted && <span className="track-note">Note</span>}
        <button type="button" className="m-ctl dim" aria-label={`More for ${track.title}`} aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          <MoreIcon />
        </button>
      </span>
      {menuOpen && <TrackMenu track={track} onPlay={onPlay} onClose={() => setMenuOpen(false)} />}
    </li>
  );
}

/** ⋯ on a track: play, its listening note, its album and artist, like. */
function TrackMenu({ track, onPlay, onClose }: { track: TrackIdentity; onPlay: () => void; onClose: () => void }) {
  const navigate = useNavigate();
  const { openNote } = useNote();
  const saved = useSavedState(track.uri);
  const toggle = useToggleSaved();
  const note = songNoteFor(track);
  const isSaved = saved.data === true;
  const artist = track.artists.find((a) => a.id);
  const go = (path: string) => {
    onClose();
    navigate(path);
  };
  return (
    <BottomSheet open onClose={onClose} label="Track" closeLabel="Close track menu">
      <div className="m-menu-head">
        <CoverImage images={track.album.images} size={56} alt="" title={track.album.name} paletteKey={track.album.id} className="m-menu-cover" />
        <span className="m-row-text">
          <span className="m-row-title" lang={detectLineLanguage(track.title)}>
            {track.title}
          </span>
          <span className="m-row-meta">
            {joinArtistNames(track.artists)} · {track.album.name}
          </span>
        </span>
      </div>
      <button
        type="button"
        className="m-menu-item"
        onClick={() => {
          onClose();
          onPlay();
        }}
      >
        <PlayIcon paused />
        Play
      </button>
      {note && (
        <button
          type="button"
          className="m-menu-item"
          onClick={() => {
            onClose();
            openNote(
              songNotePayload(note, {
                title: track.title,
                titleLang: detectLineLanguage(track.title),
                subtitle: `${joinArtistNames(track.artists)} · ${track.album.name}`,
              }),
            );
          }}
        >
          <ArchiveIcon />
          Read listening note
        </button>
      )}
      {track.album.id && (
        <button type="button" className="m-menu-item" onClick={() => go(`/album/${track.album.id}`)}>
          <AlbumIcon />
          Go to album
        </button>
      )}
      {artist && (
        <button type="button" className="m-menu-item" onClick={() => go(`/artist/${artist.id}`)}>
          <ArtistIcon />
          Go to artist
        </button>
      )}
      <button
        type="button"
        className="m-menu-item"
        disabled={saved.isPending || saved.isError || toggle.isPending}
        onClick={() => toggle.mutate({ uri: track.uri, saved: !isSaved })}
      >
        <HeartIcon filled={isSaved} />
        {isSaved ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      </button>
    </BottomSheet>
  );
}

/** Plays a track from a list, in its album when it has one. */
export function usePlayTrack() {
  const play = usePlay();
  return (track: TrackIdentity, uris?: string[]) =>
    play(
      uris ? { uris, offsetUri: track.uri } : track.album.uri ? { contextUri: track.album.uri, offsetUri: track.uri } : { uris: [track.uri] },
      { openNowPlaying: true },
    );
}
