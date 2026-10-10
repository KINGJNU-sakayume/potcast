import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { detectLineLanguage } from '../../translation/languageDetect';
import { PlayIcon } from '../icons';

/**
 * A big-cover tile for the desktop Library: the artwork (it opens the page),
 * a play button over its corner, the title as the one link to read, and a
 * quiet meta line with the Note mark.
 */
export function CoverTile({
  art,
  title,
  to,
  meta,
  noted = false,
  round = false,
  onPlay,
}: {
  art: ReactNode;
  title: string;
  /** Route of the object's page; playlists have none. */
  to?: string;
  meta?: ReactNode;
  noted?: boolean;
  round?: boolean;
  onPlay?: () => void;
}) {
  return (
    <li className={round ? 'cover-tile round' : 'cover-tile'}>
      <div className="cover-tile-art">
        {to ? (
          <Link to={to} tabIndex={-1} aria-hidden="true">
            {art}
          </Link>
        ) : (
          art
        )}
        {onPlay && (
          <button type="button" className="cover-tile-play" aria-label={`Play ${title}`} onClick={onPlay}>
            <PlayIcon paused />
          </button>
        )}
      </div>
      {to ? (
        <Link className="cover-tile-title linkish" to={to} lang={detectLineLanguage(title)}>
          {title}
        </Link>
      ) : (
        <span className="cover-tile-title" lang={detectLineLanguage(title)}>
          {title}
        </span>
      )}
      {(meta || noted) && (
        <div className="cover-tile-meta">
          <span>{meta}</span>
          {noted && <span className="track-note">Note</span>}
        </div>
      )}
    </li>
  );
}
