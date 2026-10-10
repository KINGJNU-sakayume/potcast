import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useSession } from '../../app/sessionContext';
import { useEngine, usePlayerSelector } from '../../playback/hooks';
import { describeSpotifyError } from '../../spotify/errors';
import { DeviceIcon } from '../icons';

/** Dispatched on `window` to open the desktop device popover (e.g. from "No active device"). */
export const OPEN_DEVICES_EVENT = 'arc:open-devices';

/** Shows the active Spotify Connect device and transfers playback to another one. */
export function DevicePicker() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const device = usePlayerSelector((s) => s.snapshot.device);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      rootRef.current?.querySelector<HTMLButtonElement>('.device-button')?.focus();
    };
    window.addEventListener(OPEN_DEVICES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_DEVICES_EVENT, onOpen);
  }, []);

  const label = device ? (device.isThisBrowser ? 'This browser' : device.name) : 'No device';

  return (
    <div className="device" ref={rootRef}>
      <button
        type="button"
        className="text-toggle device-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Playback device: ${device ? device.name : 'none'}. Choose device`}
        onClick={() => setOpen((value) => !value)}
      >
        <DeviceIcon />
        <span className="device-name">{label}</span>
      </button>

      {open && (
        <div id={panelId} className="device-panel" role="group" aria-label="Playback devices">
          <div className="label">Play on</div>
          <DeviceChoices onChosen={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Spotify Connect devices to move playback to; the desktop popover and the phone's device sheet both use it. */
export function DeviceChoices({ onChosen, browserNote = true }: { onChosen: () => void; browserNote?: boolean }) {
  const engine = useEngine();
  const { mode } = useSession();
  const sdk = usePlayerSelector((s) => s.sdk);
  const devices = useQuery({
    queryKey: [mode, 'devices'],
    queryFn: () => engine.getDevices(),
    staleTime: 0,
  });

  return (
    <>
      {devices.isPending ? (
        <p className="device-note">Looking for devices…</p>
      ) : devices.isError ? (
        <p className="device-note">{describeSpotifyError(devices.error).body}</p>
      ) : devices.data.length === 0 ? (
        <p className="device-note">No Spotify devices are online. Open Spotify on a phone, computer or speaker, then check again.</p>
      ) : (
        <ul className="device-list">
          {devices.data.map((d) => (
            <li key={d.id ?? d.name}>
              <button
                type="button"
                disabled={!d.id || d.isRestricted || d.isActive}
                onClick={() => {
                  if (!d.id) return;
                  engine.activateAudio();
                  void engine.transferTo(d.id, true);
                  onChosen();
                }}
              >
                <b>{d.isThisBrowser ? 'This browser' : d.name}</b>
                <span>{d.isActive ? 'Playing' : d.isRestricted ? `${d.type} · not controllable` : d.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {browserNote && sdk.kind === 'error' && <p className="device-note">Browser playback: {sdk.message}</p>}
      <button type="button" className="note-more" onClick={() => void devices.refetch()}>
        Check again
      </button>
    </>
  );
}
