import { usePlayerSelector } from '../../playback/hooks';
import { BottomSheet } from '../BottomSheet';
import { DeviceChoices } from '../player/DevicePicker';
import { Volume } from '../player/TransportExtras';

/** Opens the Spotify app (iOS asks once); the phone then appears as a Connect device. */
export const SPOTIFY_APP_URL = 'spotify:';

/**
 * The phone is a remote: Spotify's Web Playback SDK does not run in phone
 * browsers, so audio comes from the Spotify app or another device. This sheet
 * shows where playback is, moves it, and sets that device's volume.
 */
export function DeviceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const device = usePlayerSelector((s) => s.snapshot.device);
  const hasTrack = usePlayerSelector((s) => s.snapshot.track !== null);
  return (
    <BottomSheet open={open} onClose={onClose} label="Devices" labelledBy="m-device-title" closeLabel="Close devices" bodyClassName="m-device-sheet">
      <h2 id="m-device-title" className="m-sheet-title">
        Play on
      </h2>
      <p className="m-sheet-sub">{device ? <>Playing on <b>{device.isThisBrowser ? 'this browser' : device.name}</b></> : 'No Spotify device is active.'}</p>
      <div className="device-panel-inline">
        <DeviceChoices onChosen={onClose} browserNote={false} />
      </div>
      {hasTrack && device?.supportsVolume !== false && device && (
        <div className="m-device-volume">
          <span className="label">Volume · {device.name}</span>
          <Volume />
        </div>
      )}
      <p className="m-explain">
        <b>Phone browsers can’t play Spotify audio.</b> ARC controls the Spotify app on this phone, or any other device signed in to your account.
        Open Spotify once and this phone joins the list.
      </p>
      <div className="m-actions">
        <a className={device ? 'plain-action' : 'plain-action primary'} href={SPOTIFY_APP_URL}>
          Open Spotify app
        </a>
      </div>
    </BottomSheet>
  );
}
