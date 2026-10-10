import { useRef, useState } from 'react';
import { formatDuration, formatDurationForSpeech } from '../../lib/format';
import { useEngine, usePlaybackPosition, usePlayerSnapshot, useProgressProperty } from '../../playback/hooks';
import { NextIcon, PlayIcon, PreviousIcon, ShuffleIcon } from '../icons';
import { Slider } from '../Slider';

/**
 * The seek bar with current and total time, above the transport. Position
 * comes from the central playback clock — there is no independent timer here.
 */
export function Progress() {
  const snapshot = usePlayerSnapshot();
  const position = usePlaybackPosition();
  const engine = useEngine();
  const sliderRef = useRef<HTMLDivElement>(null);
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  useProgressProperty(sliderRef);

  const duration = snapshot.durationMs;
  const seekDisabled = !snapshot.track || duration <= 0 || snapshot.disallows.seeking;

  return (
    <div className="progress-wrap">
      <span aria-hidden="true">{formatDuration(previewMs ?? position)}</span>
      <Slider
        ref={sliderRef}
        live
        className="seek-slider"
        label="Seek"
        value={duration > 0 ? position / duration : 0}
        disabled={seekDisabled}
        step={duration > 0 ? Math.min(1, 5000 / duration) : 0.05}
        bigStep={duration > 0 ? Math.min(1, 30000 / duration) : 0.2}
        scale={duration / 1000}
        valueText={(fraction) => `${formatDurationForSpeech(fraction * duration)} of ${formatDurationForSpeech(duration)}`}
        onPreview={(fraction) => setPreviewMs(fraction === null ? null : fraction * duration)}
        onCommit={(fraction) => void engine.seek(Math.min(fraction * duration, Math.max(0, duration - 750)))}
      />
      <span aria-hidden="true">{formatDuration(duration)}</span>
    </div>
  );
}

/** Shuffle, previous, play / pause and next: the left half of Now Playing's transport line. */
export function Transport() {
  const snapshot = usePlayerSnapshot();
  const engine = useEngine();
  const hasTrack = Boolean(snapshot.track);
  const paused = snapshot.paused;
  const playDisabled = !hasTrack || (paused ? snapshot.disallows.resuming : snapshot.disallows.pausing);

  return (
    <div className="transport">
      <button
        type="button"
        className="ctl toggle"
        title="Shuffle"
        aria-label="Shuffle"
        aria-pressed={snapshot.shuffle}
        disabled={!hasTrack || snapshot.disallows.togglingShuffle}
        onClick={() => void engine.setShuffle(!snapshot.shuffle)}
      >
        <ShuffleIcon />
      </button>
      <button
        type="button"
        className="ctl"
        title="Previous"
        aria-label="Previous track"
        disabled={!hasTrack || snapshot.disallows.skippingPrev}
        onClick={() => void engine.previous()}
      >
        <PreviousIcon />
      </button>
      <button
        type="button"
        className="play"
        title={paused ? 'Play (Space)' : 'Pause (Space)'}
        aria-label={paused ? 'Play' : 'Pause'}
        aria-keyshortcuts="Space"
        disabled={playDisabled}
        onClick={() => {
          engine.activateAudio();
          void engine.togglePlay();
        }}
      >
        <PlayIcon paused={paused} />
      </button>
      <button
        type="button"
        className="ctl"
        title="Next"
        aria-label="Next track"
        disabled={!hasTrack || snapshot.disallows.skippingNext}
        onClick={() => void engine.next()}
      >
        <NextIcon />
      </button>
    </div>
  );
}
