import type { DeviceInfo } from '../domain/types';
import type { PlayRequest, QueueSnapshot } from './types';

/**
 * Playback commands. Implementations write every state change into the
 * session's PlayerStore; the UI never keeps its own copy of playback state.
 */
export interface PlaybackEngine {
  readonly kind: 'spotify' | 'preview';
  /** Idempotent; paired with stop(). Safe under React StrictMode remounts. */
  start(): void;
  stop(): void;

  play(request: PlayRequest): Promise<void>;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  /** 0–1 */
  setVolume(volume: number): Promise<void>;
  /** Spotify's shuffle mode; it stays on for whatever plays next, as in Spotify's own apps. */
  setShuffle(shuffle: boolean): Promise<void>;

  transferToBrowser(play?: boolean): Promise<void>;
  transferTo(deviceId: string, play?: boolean): Promise<void>;
  /** Re-reads the authoritative playback state. */
  resync(): Promise<void>;

  getDevices(): Promise<DeviceInfo[]>;
  getQueue(): Promise<QueueSnapshot>;

  /** Call synchronously from a click/keydown handler before any playback request. */
  activateAudio(): void;
}
