import { useMemo } from 'react';
import { usePlayerSelector } from './hooks';
import type { PlayerState } from './types';

/**
 * Where the music plays, said one way everywhere: the transport's device
 * button, the episode's transport and Settings all read it from here, so
 * one moment never shows “No device” in one place and “Browser device ready”
 * in another.
 */
export interface DeviceStatus {
  /** The device's name as the button shows it. */
  label: string;
  /** A few words on its state, or null when the label says enough. */
  detail: string | null;
  tone: 'playing' | 'ready' | 'waiting' | 'none' | 'failed';
}

export const THIS_BROWSER = 'This browser';

export function describeDevice(state: Pick<PlayerState, 'snapshot' | 'sdk' | 'issue'>): DeviceStatus {
  const { snapshot, sdk, issue } = state;
  const failed = issue?.kind === 'playback-failed';
  const device = snapshot.device;
  if (device) {
    const here = device.isThisBrowser || snapshot.source === 'sdk';
    return {
      label: here ? THIS_BROWSER : device.name,
      detail: here && failed ? 'can’t play' : null,
      tone: here && failed ? 'failed' : 'playing',
    };
  }
  switch (sdk.kind) {
    case 'ready':
      return failed
        ? { label: THIS_BROWSER, detail: 'can’t play', tone: 'failed' }
        : { label: THIS_BROWSER, detail: 'ready', tone: 'ready' };
    case 'loading':
      return { label: THIS_BROWSER, detail: 'connecting…', tone: 'waiting' };
    case 'reconnecting':
      return { label: THIS_BROWSER, detail: 'reconnecting…', tone: 'waiting' };
    case 'disabled':
      return { label: 'Spotify app', detail: 'this page is its remote', tone: 'none' };
    case 'error':
      return { label: 'No device', detail: sdk.message, tone: 'none' };
  }
}

/** The device status, re-read whenever the device, the browser player or a playback failure changes. */
export function useDeviceStatus(): DeviceStatus {
  const snapshotDevice = usePlayerSelector((s) => s.snapshot.device);
  const source = usePlayerSelector((s) => s.snapshot.source);
  const sdk = usePlayerSelector((s) => s.sdk);
  const issue = usePlayerSelector((s) => s.issue);
  return useMemo(
    () => describeDevice({ snapshot: { device: snapshotDevice, source } as PlayerState['snapshot'], sdk, issue }),
    [snapshotDevice, source, sdk, issue],
  );
}
