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

export const THIS_BROWSER = '이 브라우저';

export function describeDevice(state: Pick<PlayerState, 'snapshot' | 'sdk' | 'issue'>): DeviceStatus {
  const { snapshot, sdk, issue } = state;
  const failed = issue?.kind === 'playback-failed';
  const device = snapshot.device;
  if (device) {
    const here = device.isThisBrowser || snapshot.source === 'sdk';
    return {
      label: here ? THIS_BROWSER : device.name,
      detail: here && failed ? '재생할 수 없음' : null,
      tone: here && failed ? 'failed' : 'playing',
    };
  }
  switch (sdk.kind) {
    case 'ready':
      return failed
        ? { label: THIS_BROWSER, detail: '재생할 수 없음', tone: 'failed' }
        : { label: THIS_BROWSER, detail: '재생 준비됨', tone: 'ready' };
    case 'loading':
      return { label: THIS_BROWSER, detail: '연결 중…', tone: 'waiting' };
    case 'reconnecting':
      return { label: THIS_BROWSER, detail: '다시 연결 중…', tone: 'waiting' };
    case 'disabled':
      return { label: 'Spotify 앱', detail: '이 페이지는 리모컨', tone: 'none' };
    case 'error':
      return { label: '연결된 기기 없음', detail: sdk.message, tone: 'none' };
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
