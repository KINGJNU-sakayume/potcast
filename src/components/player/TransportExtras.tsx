import { useRef } from 'react';
import { useShell } from '../../app/shellContext';
import { useSavedState, useToggleSaved } from '../../catalogue/queries';
import { useEngine, usePlayerSnapshot } from '../../playback/hooks';
import { ExpandIcon, HeartIcon, QueueIcon, VolumeIcon } from '../icons';
import { Slider } from '../Slider';
import { DevicePicker } from './DevicePicker';

/**
 * The right half of Now Playing's transport line: like, queue, the playback
 * device, volume and Focus Mode, as quiet icon buttons.
 */
export function TransportExtras() {
  const shell = useShell();

  return (
    <div className="transport-extras">
      <LikeButton />
      <button type="button" className="ctl" title="Queue" aria-label="Queue" onClick={shell.openQueue}>
        <QueueIcon />
      </button>
      <DevicePicker />
      <Volume />
      {shell.toggleFocus && (
        <button
          type="button"
          className="ctl"
          title="Focus Mode (F)"
          aria-label={shell.focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}
          aria-pressed={Boolean(shell.focusMode)}
          aria-keyshortcuts="F"
          onClick={shell.toggleFocus}
        >
          <ExpandIcon />
        </button>
      )}
    </div>
  );
}

/** Like / unlike the current track (PUT | DELETE /me/library). */
function LikeButton() {
  const track = usePlayerSnapshot().track;
  const saved = useSavedState(track?.uri);
  const toggle = useToggleSaved();
  const isSaved = saved.data === true;
  const unknown = !track || saved.isPending || saved.isError;
  return (
    <button
      type="button"
      className="ctl"
      title={isSaved ? 'Liked' : 'Like'}
      aria-pressed={isSaved}
      aria-label={isSaved ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      disabled={unknown || toggle.isPending}
      onClick={() => {
        if (track) toggle.mutate({ uri: track.uri, saved: !isSaved });
      }}
    >
      <HeartIcon filled={isSaved} />
    </button>
  );
}

/** Mute and volume of the active device. */
export function Volume() {
  const snapshot = usePlayerSnapshot();
  const engine = useEngine();
  const restoreTo = useRef(0.6);
  const volume = snapshot.volume ?? 0;
  const supported = Boolean(snapshot.track) && snapshot.volume !== null && snapshot.device?.supportsVolume !== false;
  const muted = volume <= 0.001;

  return (
    <div className="volume">
      <button
        type="button"
        className="icon-button"
        aria-label={muted ? 'Unmute' : 'Mute'}
        disabled={!supported}
        onClick={() => {
          if (muted) {
            void engine.setVolume(restoreTo.current || 0.6);
          } else {
            restoreTo.current = volume;
            void engine.setVolume(0);
          }
        }}
      >
        <VolumeIcon muted={muted} />
      </button>
      <Slider
        className="volume-slider"
        label="Volume"
        value={volume}
        disabled={!supported}
        step={0.05}
        bigStep={0.2}
        scale={100}
        valueText={(fraction) => `${Math.round(fraction * 100)} percent`}
        commitDelayMs={250}
        onCommit={(fraction) => void engine.setVolume(fraction)}
      />
    </div>
  );
}
