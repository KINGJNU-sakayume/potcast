import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEpisodeState, usePlaybackToggle } from '../../episode/EpisodeProvider';
import { joinArtistNames } from '../../lib/format';
import { useEngine, usePlayerSnapshot, useProgressProperty } from '../../playback/hooks';
import { detectLineLanguage } from '../../translation/languageDetect';
import { CoverImage } from '../CoverImage';
import { NextIcon, PlayIcon } from '../icons';

/**
 * Away from Now Playing: the playing track above the tab bar, in the album's colour. Tap to go back to it.
 * While an episode is running it shows the episode and leads back to it (the hosts may be talking with no track on).
 */
export function MiniPlayer() {
  const snapshot = usePlayerSnapshot();
  const engine = useEngine();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const episode = useEpisodeState();
  const { paused, episode: episodeHolds, toggle } = usePlaybackToggle();
  const ref = useRef<HTMLDivElement>(null);
  useProgressProperty(ref);

  const track = snapshot.track;
  const running = episode.status === 'playing' || episode.status === 'paused' ? episode.episode : null;
  const release = running?.release ?? null;
  if (running && release) {
    const to = `/episode/${release.id}`;
    // The episode page has its own controls.
    if (pathname === to) return null;
    return (
      <div ref={ref} className="m-mini m-stage" role="region" aria-label="Episode">
        <button type="button" className="m-mini-open" aria-label={`Episode: ${running.title}. Back to the episode`} onClick={() => navigate(to)}>
          <CoverImage images={release.images} size={40} alt="" title={release.name} paletteKey={release.id} className="m-mini-cover" />
          <span className="m-mini-text">
            <span className="m-mini-title" lang="ko">
              {running.title}
            </span>
            <span className="m-mini-sub">{track && !snapshot.paused ? track.title : `Episode · ${release.name}`}</span>
          </span>
        </button>
        <button type="button" className="m-ctl ink m-mini-play" aria-label={paused ? 'Continue episode' : 'Pause episode'} onClick={toggle}>
          <PlayIcon paused={paused} />
        </button>
        <span />
      </div>
    );
  }
  if (!track) return null;
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
        disabled={!episodeHolds && (paused ? snapshot.disallows.resuming : snapshot.disallows.pausing)}
        onClick={toggle}
      >
        <PlayIcon paused={paused} />
      </button>
      <button type="button" className="m-ctl ink" aria-label="Next track" disabled={snapshot.disallows.skippingNext} onClick={() => void engine.next()}>
        <NextIcon />
      </button>
    </div>
  );
}
