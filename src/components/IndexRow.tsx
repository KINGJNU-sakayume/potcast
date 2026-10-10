import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ImageRef, TrackIdentity } from '../domain/types';
import { formatDuration, formatTrackNumber, joinArtistNames } from '../lib/format';
import { detectLineLanguage } from '../translation/languageDetect';
import { ArtistLinks } from './ArtistLinks';
import { CoverImage } from './CoverImage';
import { PlayingMark } from './PlayingMark';

/**
 * A track in an index (Library, Search, Queue): number, small cover, title,
 * artist · album and a quiet right column. The title starts playback; artist
 * and album stay separate links, so no link sits inside a button.
 */
export function TrackIndexRow({
  track,
  position,
  onPlay,
  aside,
  current,
  noted = false,
}: {
  track: TrackIdentity;
  position: number;
  onPlay?: () => void;
  aside?: ReactNode;
  current?: { playing: boolean } | null;
  /** The track has a Listening Note. */
  noted?: boolean;
}) {
  return (
    <li className={current ? 'index-row active' : 'index-row'} aria-current={current ? 'true' : undefined}>
      <span className="num" aria-hidden="true">
        {current ? <PlayingMark playing={current.playing} /> : formatTrackNumber(position)}
      </span>
      <CoverImage images={track.album.images} size={44} alt="" title={track.album.name} paletteKey={track.album.id} className="index-cover" />
      <span className="index-text">
        {onPlay ? (
          <button
            type="button"
            className="index-title"
            data-primary
            lang={detectLineLanguage(track.title)}
            aria-label={`Play ${track.title} by ${joinArtistNames(track.artists)}`}
            onClick={onPlay}
          >
            {track.title}
          </button>
        ) : (
          <span className="index-title" lang={detectLineLanguage(track.title)}>
            {track.title}
          </span>
        )}
        <span className="index-meta">
          <ArtistLinks artists={track.artists} />
          {track.album.id && (
            <>
              {' · '}
              <Link className="linkish" to={`/album/${track.album.id}`} lang={detectLineLanguage(track.album.name)}>
                {track.album.name}
              </Link>
            </>
          )}
        </span>
      </span>
      <span className="index-aside">
        {noted && (
          <span className="track-note" title="Song note">
            Note
          </span>
        )}
        {aside}
        <span>{formatDuration(track.durationMs)}</span>
      </span>
    </li>
  );
}

/** A compact horizontal release row (album, single or playlist) for indexes. */
export function ObjectRow({
  images,
  title,
  to,
  kicker,
  meta,
  paletteKey,
  onPlay,
  primary = true,
}: {
  images: readonly ImageRef[];
  title: string;
  /** Route of the object's page; playlists have none. */
  to?: string;
  kicker: ReactNode;
  meta?: ReactNode;
  paletteKey?: string;
  onPlay?: () => void;
  primary?: boolean;
}) {
  return (
    <li className="object-row">
      <CoverImage images={images} size={96} alt="" title={title} paletteKey={paletteKey} className="object-row-cover" />
      <div className="object-row-text">
        <div className="label">{kicker}</div>
        {to ? (
          <Link className="object-row-title linkish" to={to} lang={detectLineLanguage(title)} data-primary={primary || undefined}>
            {title}
          </Link>
        ) : (
          <span className="object-row-title" lang={detectLineLanguage(title)}>
            {title}
          </span>
        )}
        {meta && <div className="object-row-meta">{meta}</div>}
      </div>
      {onPlay && (
        <button type="button" className="row-play" onClick={onPlay} aria-label={`Play ${title}`} data-primary={!to || undefined}>
          Play
        </button>
      )}
    </li>
  );
}
