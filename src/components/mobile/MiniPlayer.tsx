import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { joinArtistNames } from '../../lib/format';
import { useEngine, usePlayerSnapshot, useProgressProperty } from '../../playback/hooks';
import { detectLineLanguage } from '../../translation/languageDetect';
import { CoverImage } from '../CoverImage';
import { NextIcon, PlayIcon } from '../icons';

/** Away from Now Playing: the playing track above the tab bar, in the album's colour. Tap to go back to it. */
export function MiniPlayer() {
  const snapshot = usePlayerSnapshot();
  const engine = useEngine();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useProgressProperty(ref);

  const track = snapshot.track;
  if (!track) return null;
  const paused = snapshot.paused;
  const artists = joinArtistNames(track.artists) || 'Unknown artist';

  return (
    <div ref={ref} className="m-mini m-stage" role="region" aria-label="Now playing">
      <button type="button" className="m-mini-open" aria-label={`${track.title} by ${artists}. Open Now Playing`} onClick={() => navigate('/now-playing')}>
        <CoverImage images={track.album.images} size={40} alt="" title={track.album.name} paletteKey={track.album.id} className="m-mini-cover" />
        <span className="m-mini-text">
          <span className="m-mini-title" lang={detectLineLanguage(track.title)}>
            {track.title}
          </span>
          <span className="m-mini-sub">
            {artists} · {track.album.name}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="m-ctl ink m-mini-play"
        aria-label={paused ? 'Play' : 'Pause'}
        disabled={paused ? snapshot.disallows.resuming : snapshot.disallows.pausing}
        onClick={() => {
          engine.activateAudio();
          void engine.togglePlay();
        }}
      >
        <PlayIcon paused={paused} />
      </button>
      <button type="button" className="m-ctl ink" aria-label="Next track" disabled={snapshot.disallows.skippingNext} onClick={() => void engine.next()}>
        <NextIcon />
      </button>
    </div>
  );
}
