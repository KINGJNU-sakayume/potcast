import type { DeviceInfo, TrackIdentity } from '../domain/types';

/**
 * Where the current snapshot comes from:
 * - `sdk`: this browser's Web Playback SDK device (event driven)
 * - `remote`: another Spotify Connect device, read via GET /me/player
 * - `preview`: the offline preview catalogue (never used once Spotify is connected)
 * - `none`: nothing is playing on any device
 */
export type PlaybackSource = 'sdk' | 'remote' | 'preview' | 'none';

export interface PlaybackDisallows {
  pausing: boolean;
  resuming: boolean;
  seeking: boolean;
  skippingNext: boolean;
  skippingPrev: boolean;
  togglingShuffle: boolean;
}

export const NO_DISALLOWS: PlaybackDisallows = {
  pausing: false,
  resuming: false,
  seeking: false,
  skippingNext: false,
  skippingPrev: false,
  togglingShuffle: false,
};

export interface PlaybackContextInfo {
  uri: string;
  type: string;
  name: string | null;
}

/** The single source of truth for "what is playing". */
export interface PlayerSnapshot {
  source: PlaybackSource;
  track: TrackIdentity | null;
  context: PlaybackContextInfo | null;
  paused: boolean;
  /** Spotify's shuffle mode: the context plays in random order. */
  shuffle: boolean;
  /** The SDK is buffering: the position does not advance. */
  buffering: boolean;
  /** Playback position at `sampledAt`. */
  positionMs: number;
  /** Monotonic clock time (ms) at which `positionMs` was observed. */
  sampledAt: number;
  durationMs: number;
  /** 0–1, or null when the device does not report volume. */
  volume: number | null;
  device: DeviceInfo | null;
  disallows: PlaybackDisallows;
  nextTracks: TrackIdentity[];
}

export type SdkErrorReason = 'unsupported' | 'load' | 'initialization' | 'authentication' | 'account' | 'playback';

export type SdkStatus =
  | { kind: 'disabled' }
  | { kind: 'loading' }
  | { kind: 'ready'; deviceId: string }
  | { kind: 'reconnecting'; deviceId: string | null; attempt: number }
  | { kind: 'error'; reason: SdkErrorReason; message: string };

export type PlaybackIssueKind =
  | 'no-active-device'
  | 'premium-required'
  | 'restricted'
  | 'rate-limited'
  | 'autoplay-blocked'
  | 'network'
  | 'unauthorized'
  | 'command-failed'
  /** This browser's player keeps skipping tracks it cannot play (usually DRM); playback was stopped. */
  | 'playback-failed';

export interface PlaybackIssue {
  kind: PlaybackIssueKind;
  message: string;
  /** Monotonic time. */
  at: number;
  retryAfterMs?: number;
  /** Steps the listener can take, one per line. */
  hints?: string[];
  /** What Spotify itself reported, for diagnosis. */
  detail?: string;
}

export interface PlayerState {
  /** False until the first real playback state has been resolved. */
  hydrated: boolean;
  snapshot: PlayerSnapshot;
  sdk: SdkStatus;
  issue: PlaybackIssue | null;
  /** Monotonic time of the latest user command; remote reads requested earlier are stale. */
  lastCommandAt: number;
  /** Monotonic time at which the most recently applied remote read was requested. */
  lastRemoteRequestAt: number;
}

export interface PlayRequest {
  /** Album, playlist or artist URI. */
  contextUri?: string;
  /** Explicit track URIs (used when there is no context). */
  uris?: string[];
  /** Start at this track within the context. */
  offsetUri?: string;
  positionMs?: number;
}

export interface QueueSnapshot {
  currentlyPlaying: TrackIdentity | null;
  upNext: TrackIdentity[];
}
