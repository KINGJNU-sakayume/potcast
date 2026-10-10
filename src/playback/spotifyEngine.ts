import { SpotifyAuthError } from '../auth/authService';
import type { DeviceInfo, TrackIdentity } from '../domain/types';
import { readJson, writeJson } from '../lib/storage';
import { parseSpotifyUri } from '../lib/spotifyUri';
import type { SpotifyClient } from '../spotify/client';
import * as api from '../spotify/endpoints';
import { isSpotifyApiError } from '../spotify/errors';
import { mapDevice, mapTrackIdentity } from '../spotify/mappers';
import type { PlaybackEngine } from './engine';
import { describeSkipLoop } from './playbackHelp';
import { monotonicNow, positionAt, remainingAt } from './playbackClock';
import type { PlayerAction } from './playerReducer';
import type { PlayerStore } from './playerStore';
import { probeProtectedAudio } from './protectedAudio';
import {
  createWebPlaybackAdapter,
  isPlaybackSupported,
  type WebPlaybackCallbacks,
  type WebPlaybackDevice,
  type WebPlaybackFactory,
} from './spotifyPlaybackSdk';
import { BROWSER_DEVICE_NAME, browserDevice, mapRemotePlayback, mapSdkState } from './stateMapping';
import type { PlayerSnapshot, PlayRequest, PlaybackIssue, QueueSnapshot, SdkErrorReason } from './types';

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface VisibilitySource {
  isVisible(): boolean;
  subscribe(listener: () => void): () => void;
}

const browserTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

const documentVisibility: VisibilitySource = {
  isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  subscribe: (listener) => {
    if (typeof document === 'undefined') return () => undefined;
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

/** Polling cadence. Remote devices emit no events, so their state must be read. */
export const POLL_INTERVALS = {
  /** A remote device is playing. */
  remotePlaying: 5_000,
  /** Nothing is playing / paused / no device. */
  idle: 10_000,
  /** This browser is the active device: SDK events drive state; poll only as a safety net. */
  sdkActive: 30_000,
  /** Re-reads after a Web API command (Spotify does not guarantee ordering). */
  afterCommand: [700, 2_000] as const,
};

/**
 * Runaway skipping. When the browser cannot decrypt Spotify's audio (no DRM
 * licence, protected content turned off, licence or audio requests blocked),
 * the SDK gives up on each track and moves on to the next, running through
 * the queue in silence. Either signal below triggers a check; if the position
 * is still standing, playback is stopped and the likely cause explained.
 */
export const SKIP_LOOP = {
  windowMs: 60_000,
  /** Tracks left without being played, within the window. */
  unplayedTracks: 3,
  /** `playback_error` events from the SDK, within the window. */
  errors: 2,
  /** A track left before this position (or before its last 5 s) was not played through. */
  playedMs: 10_000,
  /** A track change this soon after one of our own commands is that command's doing. */
  commandMs: 2_000,
  /** The check: after this long, is the same track still playing and `advanceMs` further on? */
  checkMs: 3_000,
  advanceMs: 1_000,
} as const;

/** Records an event at `now` and returns how many fall within the skip-loop window. */
function countRecent(times: number[], now: number): number {
  times.push(now);
  while (times.length > 0 && now - times[0]! > SKIP_LOOP.windowMs) times.shift();
  return times.length;
}

/** Audio is really playing: the same track is still current, not paused or loading, and has moved on. */
function isPlayingThrough(before: Spotify.PlaybackState | null, after: Spotify.PlaybackState): boolean {
  if (!before || after.paused || after.loading) return false;
  const sameTrack = before.track_window?.current_track?.uri === after.track_window?.current_track?.uri;
  return sameTrack && after.position - before.position >= SKIP_LOOP.advanceMs;
}

const REANCHOR_MS = 3_000;
const MAX_RECONNECT_ATTEMPTS = 5;
/** How long a play request waits for this browser's player to finish connecting. */
const SDK_READY_WAIT_MS = 10_000;
const VOLUME_KEY = 'arc.player.volume.v1';

export interface SpotifyEngineOptions {
  store: PlayerStore;
  client: SpotifyClient;
  getAccessToken(): Promise<string>;
  refreshAccessToken(): Promise<string | null>;
  createDevice?: WebPlaybackFactory;
  isPlaybackSupported?: () => boolean;
  /** Whether the browser grants DRM for audio (diagnosis only). */
  probeProtectedAudio?: () => Promise<boolean>;
  now?: () => number;
  timers?: Timers;
  visibility?: VisibilitySource;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Drives real Spotify playback. When this browser is the active device the
 * Web Playback SDK is used for transport commands and its events are the
 * source of truth; otherwise commands go through the Web API and state is
 * read from GET /me/player. It never advances playback on its own.
 */
export class SpotifyPlaybackEngine implements PlaybackEngine {
  readonly kind = 'spotify' as const;

  private readonly store: PlayerStore;
  private readonly client: SpotifyClient;
  private readonly createDevice: WebPlaybackFactory;
  private readonly supported: () => boolean;
  private readonly probeProtectedAudio: () => Promise<boolean>;
  private readonly now: () => number;
  private readonly timers: Timers;
  private readonly visibility: VisibilitySource;

  private device: WebPlaybackDevice | null = null;
  private deviceId: string | null = null;
  private volume: number;
  private running = false;
  private generation = 0;
  private pollTimer: unknown = null;
  private reanchorTimer: unknown = null;
  private reconnectTimer: unknown = null;
  private skipCheckTimer: unknown = null;
  private followUpTimers: unknown[] = [];
  private reconnectAttempts = 0;
  private authRetried = false;
  private rateLimitedUntil = 0;
  private syncInFlight: Promise<void> | null = null;
  private unsubscribeVisibility: (() => void) | null = null;
  /** The SDK's current track and the furthest position seen in it (see SKIP_LOOP). */
  private sdkTrack: { uri: string; maxPositionMs: number; durationMs: number } | null = null;
  private unplayedAt: number[] = [];
  private playbackErrorsAt: number[] = [];
  private lastPlaybackError: string | null = null;
  /** A Spotify Connect device the listener chose in this app (see transferTo). */
  private chosenDeviceId: string | null = null;
  private playRequests = 0;

  constructor(private readonly options: SpotifyEngineOptions) {
    this.store = options.store;
    this.client = options.client;
    this.createDevice = options.createDevice ?? createWebPlaybackAdapter;
    this.supported = options.isPlaybackSupported ?? isPlaybackSupported;
    this.probeProtectedAudio = options.probeProtectedAudio ?? (() => probeProtectedAudio());
    this.now = options.now ?? monotonicNow;
    this.timers = options.timers ?? browserTimers;
    this.visibility = options.visibility ?? documentVisibility;
    const storedVolume = readJson<number>(VOLUME_KEY);
    this.volume = typeof storedVolume === 'number' ? clamp01(storedVolume) : 0.6;
  }

  /* ── Lifecycle ───────────────────────────────────────────────────────── */

  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    this.unsubscribeVisibility = this.visibility.subscribe(() => this.onVisibilityChange());
    void this.connectDevice();
    void this.resync();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    this.clearTimer('pollTimer');
    this.clearTimer('reanchorTimer');
    this.clearTimer('reconnectTimer');
    this.resetSkipWatch();
    for (const timer of this.followUpTimers) this.timers.clearTimeout(timer);
    this.followUpTimers = [];
    this.unsubscribeVisibility?.();
    this.unsubscribeVisibility = null;
    this.device?.disconnect();
    this.device = null;
    this.deviceId = null;
  }

  /* ── Web Playback SDK ────────────────────────────────────────────────── */

  private async connectDevice(): Promise<void> {
    const generation = this.generation;
    if (!this.supported()) {
      this.setSdkError(
        'unsupported',
        'This browser cannot play Spotify audio (Encrypted Media Extensions are unavailable). Use another Spotify device.',
      );
      return;
    }
    this.dispatch({ type: 'sdk/status', status: { kind: 'loading' } });
    const device = this.createDevice({
      name: BROWSER_DEVICE_NAME,
      initialVolume: this.volume,
      getOAuthToken: () => this.options.getAccessToken(),
      callbacks: this.sdkCallbacks(generation),
    });
    this.device = device;
    try {
      const connected = await device.connect();
      if (generation !== this.generation) return;
      if (!connected) this.setSdkError('initialization', 'Spotify did not accept the browser player connection.');
    } catch (error) {
      if (generation !== this.generation) return;
      this.setSdkError('load', error instanceof Error ? error.message : 'Could not load the Spotify Web Playback SDK.');
    }
  }

  private sdkCallbacks(generation: number): WebPlaybackCallbacks {
    const live = () => this.running && generation === this.generation;
    return {
      onReady: (deviceId) => {
        if (!live()) return;
        // The SDK came back by itself: keep this device rather than replacing it.
        this.clearTimer('reconnectTimer');
        this.deviceId = deviceId;
        this.reconnectAttempts = 0;
        this.authRetried = false;
        this.dispatch({ type: 'sdk/status', status: { kind: 'ready', deviceId } });
        void this.resync();
      },
      onNotReady: (deviceId) => {
        if (!live()) return;
        this.dispatch({
          type: 'sdk/status',
          status: { kind: 'reconnecting', deviceId, attempt: this.reconnectAttempts + 1 },
        });
        this.scheduleReconnect();
      },
      onState: (state) => {
        if (live()) this.handleSdkState(state);
      },
      onError: (reason, message) => {
        if (live()) void this.handleSdkError(reason, message);
      },
      onAutoplayFailed: () => {
        if (!live()) return;
        this.setIssue('autoplay-blocked', 'Your browser blocked audio from starting automatically. Press play to start.');
      },
    };
  }

  private handleSdkState(state: Spotify.PlaybackState | null): void {
    if (!state) {
      // Playback was transferred to another device (or stopped).
      this.resetSkipWatch();
      this.dispatch({ type: 'sdk/inactive', now: this.now() });
      this.clearTimer('reanchorTimer');
      void this.resync();
      return;
    }
    if (!this.deviceId) return;
    this.watchTrack(state);
    this.dispatch({ type: 'sdk/state', snapshot: mapSdkState(state, this.deviceId, this.volume, this.now()) });
    if (state.paused) this.clearTimer('reanchorTimer');
    else this.scheduleReanchor();
    this.schedulePoll();
  }

  /** Re-anchors the interpolated position against the SDK's own reading while playing. */
  private scheduleReanchor(): void {
    if (this.reanchorTimer !== null) return;
    this.reanchorTimer = this.timers.setTimeout(() => {
      this.reanchorTimer = null;
      const device = this.device;
      const deviceId = this.deviceId;
      if (!device || !deviceId || !this.running) return;
      void device
        .getCurrentState()
        .catch(() => null)
        .then((state) => {
          if (!this.running || !state || this.store.getState().snapshot.source !== 'sdk') return;
          this.watchTrack(state);
          this.dispatch({ type: 'sdk/state', snapshot: mapSdkState(state, deviceId, this.volume, this.now()) });
          if (!state.paused) this.scheduleReanchor();
        });
    }, REANCHOR_MS);
  }

  private async handleSdkError(reason: SdkErrorReason, message: string): Promise<void> {
    if (reason === 'authentication' && !this.authRetried) {
      this.authRetried = true;
      const token = await this.options.refreshAccessToken();
      if (token && this.running) {
        this.reconnectNow();
        return;
      }
    }
    if (reason === 'playback') {
      this.lastPlaybackError = message;
      if (this.store.getState().issue?.kind === 'playback-failed') return;
      this.setIssue('command-failed', `Spotify could not play this item: ${message}`);
      if (countRecent(this.playbackErrorsAt, this.now()) >= SKIP_LOOP.errors) this.scheduleSkipCheck();
      return;
    }
    const friendly: Partial<Record<SdkErrorReason, string>> = {
      account: 'Browser playback requires Spotify Premium.',
      authentication: 'Spotify rejected the browser player’s credentials. Reconnect Spotify.',
      initialization: 'This browser could not start Spotify playback. Use another Spotify device.',
    };
    this.setSdkError(reason, friendly[reason] ?? message);
  }

  /* ── Runaway skipping (see SKIP_LOOP) ────────────────────────────────── */

  /** Notes each track the SDK leaves before it was played through without us having asked. */
  private watchTrack(state: Spotify.PlaybackState): void {
    const uri = state.track_window?.current_track?.uri;
    if (!uri) return;
    const previous = this.sdkTrack;
    if (previous?.uri === uri) {
      previous.maxPositionMs = Math.max(previous.maxPositionMs, state.position);
      return;
    }
    this.sdkTrack = { uri, maxPositionMs: state.position, durationMs: state.duration };
    if (!previous) return;
    const now = this.now();
    if (now - this.store.getState().lastCommandAt < SKIP_LOOP.commandMs) return;
    // Tracks that ended on their own (short ones included) were played.
    if (previous.maxPositionMs >= Math.min(SKIP_LOOP.playedMs, previous.durationMs - 5_000)) return;
    if (countRecent(this.unplayedAt, now) >= SKIP_LOOP.unplayedTracks) this.scheduleSkipCheck();
  }

  /**
   * Confirms a suspected skip loop before acting: someone skipping quickly
   * from another device or with media keys leaves a track that then plays.
   */
  private scheduleSkipCheck(): void {
    const device = this.device;
    if (this.skipCheckTimer !== null || !device) return;
    const scheduledAt = this.now();
    const before = device.getCurrentState().catch(() => null);
    this.skipCheckTimer = this.timers.setTimeout(() => {
      this.skipCheckTimer = null;
      void Promise.all([before, device.getCurrentState().catch(() => null)]).then(([first, second]) => {
        if (!this.running || device !== this.device) return;
        // Playback moved to another device, the listener acted, or audio is playing: not a loop.
        if (!second || this.store.getState().lastCommandAt > scheduledAt || isPlayingThrough(first, second)) {
          this.unplayedAt = [];
          this.playbackErrorsAt = [];
          return;
        }
        void this.stopSkipLoop();
      });
    }, SKIP_LOOP.checkMs);
  }

  private async stopSkipLoop(): Promise<void> {
    const sdkMessage = this.lastPlaybackError;
    this.resetSkipWatch();
    if (this.sdkIsActive()) await this.pause();
    const protectedAudio = await this.probeProtectedAudio().catch(() => true);
    if (!this.running) return;
    const { message, ...extra } = describeSkipLoop(protectedAudio, sdkMessage);
    this.setIssue('playback-failed', message, extra);
  }

  private resetSkipWatch(): void {
    this.clearTimer('skipCheckTimer');
    this.sdkTrack = null;
    this.unplayedAt = [];
    this.playbackErrorsAt = [];
    this.lastPlaybackError = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setSdkError('initialization', 'Lost the connection to Spotify’s browser player.');
      return;
    }
    const delay = Math.min(30_000, 2_000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.running) this.reconnectNow();
    }, delay);
  }

  private reconnectNow(): void {
    this.resetSkipWatch();
    this.device?.disconnect();
    this.device = null;
    this.deviceId = null;
    this.generation += 1;
    void this.connectDevice();
  }

  /* ── Web API state ───────────────────────────────────────────────────── */

  resync(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    const run = async (): Promise<void> => {
      const requestedAt = this.now();
      try {
        const state = await api.getPlaybackState(this.client);
        if (!this.running) return;
        this.dispatch({
          type: 'remote/state',
          snapshot: state ? mapRemotePlayback(state, this.deviceId, this.now()) : null,
          requestedAt,
        });
      } catch (error) {
        if (!this.running) return;
        this.reportError(error);
        this.dispatch({ type: 'hydrated' });
      } finally {
        this.syncInFlight = null;
        this.schedulePoll();
      }
    };
    this.syncInFlight = run();
    return this.syncInFlight;
  }

  private schedulePoll(): void {
    this.clearTimer('pollTimer');
    if (!this.running || !this.visibility.isVisible()) return;
    const { snapshot, sdk } = this.store.getState();
    const now = this.now();
    let delay: number;
    if (snapshot.source === 'sdk' && sdk.kind === 'ready') {
      delay = POLL_INTERVALS.sdkActive;
    } else if (snapshot.track && !snapshot.paused) {
      // Read again just after the track should end so the next track appears promptly.
      delay = Math.min(POLL_INTERVALS.remotePlaying, remainingAt(snapshot, now) + 600);
    } else {
      delay = POLL_INTERVALS.idle;
    }
    delay = Math.max(delay, this.rateLimitedUntil - now, 250);
    this.pollTimer = this.timers.setTimeout(() => {
      this.pollTimer = null;
      void this.resync();
    }, delay);
  }

  private onVisibilityChange(): void {
    if (!this.running) return;
    if (this.visibility.isVisible()) {
      void this.resync();
      if (this.store.getState().snapshot.source === 'sdk') this.scheduleReanchor();
    } else {
      this.clearTimer('pollTimer');
    }
  }

  /* ── Commands ────────────────────────────────────────────────────────── */

  activateAudio(): void {
    void this.device?.activateElement().catch(() => undefined);
  }

  private sdkIsActive(): boolean {
    const { snapshot, sdk } = this.store.getState();
    return snapshot.source === 'sdk' && sdk.kind === 'ready' && this.device !== null;
  }

  /** The active device is another Spotify Connect device the listener chose in this app. */
  private remoteChosen(): boolean {
    const { snapshot } = this.store.getState();
    const device = snapshot.device;
    return (
      snapshot.source === 'remote' &&
      this.chosenDeviceId !== null &&
      device?.id === this.chosenDeviceId &&
      device.isActive &&
      !device.isRestricted
    );
  }

  /**
   * This browser's SDK device ID. While the player is still connecting it waits (bounded)
   * for the SDK's `ready`, so no request goes out before the browser device exists.
   * Null when browser playback is unavailable.
   */
  private async browserDeviceId(): Promise<string | null> {
    const connecting = () => {
      const { kind } = this.store.getState().sdk;
      return kind === 'loading' || kind === 'reconnecting';
    };
    if (connecting()) {
      await new Promise<void>((resolve) => {
        const done = () => {
          unsubscribe();
          this.timers.clearTimeout(timer);
          resolve();
        };
        const unsubscribe = this.store.subscribe(() => {
          if (!connecting()) done();
        });
        const timer = this.timers.setTimeout(done, SDK_READY_WAIT_MS);
      });
    }
    const { sdk } = this.store.getState();
    return sdk.kind === 'ready' ? sdk.deviceId : null;
  }

  private positionPatch(paused: boolean): Partial<PlayerSnapshot> {
    const { snapshot } = this.store.getState();
    const now = this.now();
    return { paused, positionMs: positionAt(snapshot, now), sampledAt: now };
  }

  async play(request: PlayRequest): Promise<void> {
    const requestId = ++this.playRequests;
    // Playback started here goes to this browser by its SDK device ID, not to whichever device
    // Spotify reports as active (possibly a phone whose app was closed), unless the listener
    // chose that device.
    const browserId = this.remoteChosen() ? null : await this.browserDeviceId();
    // A newer request replaced this one while it waited for the browser player.
    if (!this.running || requestId !== this.playRequests) return;
    const { snapshot } = this.store.getState();
    const remoteActive = snapshot.source === 'remote' && snapshot.device?.isActive && !snapshot.device.isRestricted;
    let deviceId = browserId ?? undefined;

    if (!deviceId && !remoteActive) {
      // Spotify needs a target when no device is active: use any controllable device.
      const devices = await api.getDevices(this.client).catch(() => []);
      const candidate = devices.find((d) => d.id && !d.is_restricted);
      if (!candidate?.id) {
        this.setIssue(
          'no-active-device',
          'No Spotify device is available. Open Spotify on a phone or computer, or enable browser playback.',
        );
        return;
      }
      deviceId = candidate.id;
    }

    const contextType = parseSpotifyUri(request.contextUri)?.type;
    const offsetAllowed = contextType === 'album' || contextType === 'playlist';
    await this.command(
      undefined,
      () =>
        api.startPlayback(this.client, {
          deviceId,
          contextUri: request.contextUri,
          uris: request.contextUri ? undefined : request.uris,
          offset: offsetAllowed && request.offsetUri ? { uri: request.offsetUri } : undefined,
          positionMs: request.positionMs,
        }),
      true,
    );
  }

  togglePlay(): Promise<void> {
    return this.store.getState().snapshot.paused ? this.resume() : this.pause();
  }

  async pause(): Promise<void> {
    if (this.sdkIsActive()) return this.command(this.positionPatch(true), () => this.device!.pause(), false);
    return this.command(this.positionPatch(true), () => api.pausePlayback(this.client), true);
  }

  async resume(): Promise<void> {
    const { snapshot, sdk } = this.store.getState();
    if (this.sdkIsActive()) return this.command(this.positionPatch(false), () => this.device!.resume(), false);
    // As in play(): resume in this browser unless the listener chose the active device.
    if (sdk.kind === 'ready' && !this.remoteChosen()) return this.transferToBrowser(true);
    if (snapshot.source === 'remote' && snapshot.device?.isActive) {
      return this.command(this.positionPatch(false), () => api.startPlayback(this.client, {}), true);
    }
    this.setIssue('no-active-device', 'No Spotify device is active. Choose a device to resume playback.');
  }

  async next(): Promise<void> {
    if (this.sdkIsActive()) return this.command(undefined, () => this.device!.nextTrack(), false);
    return this.command(undefined, () => api.skipToNext(this.client), true);
  }

  async previous(): Promise<void> {
    if (this.sdkIsActive()) return this.command(undefined, () => this.device!.previousTrack(), false);
    return this.command(undefined, () => api.skipToPrevious(this.client), true);
  }

  async seek(positionMs: number): Promise<void> {
    const { snapshot } = this.store.getState();
    const target = Math.max(0, Math.min(positionMs, snapshot.durationMs || positionMs));
    const patch: Partial<PlayerSnapshot> = { positionMs: target, sampledAt: this.now() };
    if (this.sdkIsActive()) return this.command(patch, () => this.device!.seek(target), false);
    return this.command(patch, () => api.seekTo(this.client, target), true);
  }

  async setVolume(volume: number): Promise<void> {
    const value = clamp01(volume);
    const { snapshot } = this.store.getState();
    if (this.sdkIsActive()) {
      this.volume = value;
      writeJson(VOLUME_KEY, value);
      return this.command({ volume: value }, () => this.device!.setVolume(value), false);
    }
    if (snapshot.device && !snapshot.device.supportsVolume) {
      this.setIssue('restricted', `${snapshot.device.name} does not allow remote volume control.`);
      return;
    }
    return this.command({ volume: value }, () => api.setVolume(this.client, value * 100), true);
  }

  async setShuffle(shuffle: boolean): Promise<void> {
    // The Web Playback SDK has no shuffle command; the Web API reaches the active device, this browser included.
    return this.command({ shuffle }, () => api.setShuffle(this.client, shuffle), true);
  }

  async transferToBrowser(play = true): Promise<void> {
    const { sdk } = this.store.getState();
    if (sdk.kind !== 'ready') {
      this.setIssue('no-active-device', 'Browser playback is not ready yet.');
      return;
    }
    this.chosenDeviceId = null;
    await this.command(undefined, () => api.transferPlayback(this.client, sdk.deviceId, play), true);
  }

  async transferTo(deviceId: string, play = true): Promise<void> {
    if (deviceId === this.deviceId) return this.transferToBrowser(play);
    this.chosenDeviceId = deviceId;
    await this.command(undefined, () => api.transferPlayback(this.client, deviceId, play), true);
  }

  async getDevices(): Promise<DeviceInfo[]> {
    const devices = (await api.getDevices(this.client)).map((d) => mapDevice(d, this.deviceId));
    if (this.deviceId && !devices.some((d) => d.isThisBrowser)) {
      devices.unshift({ ...browserDevice(this.deviceId, this.volume), isActive: false });
    }
    return devices;
  }

  async getQueue(): Promise<QueueSnapshot> {
    const queue = await api.getQueue(this.client);
    return {
      currentlyPlaying: mapTrackIdentity(queue.currently_playing),
      upNext: queue.queue.map(mapTrackIdentity).filter((t): t is TrackIdentity => t !== null),
    };
  }

  /**
   * Applies an optimistic patch, runs the command and schedules follow-up
   * reads. On failure the issue is reported and the real state re-read, so the
   * UI never claims a change Spotify did not make.
   */
  private async command(
    patch: Partial<PlayerSnapshot> | undefined,
    action: () => Promise<void>,
    followUp: boolean,
  ): Promise<void> {
    this.dispatch({ type: 'command/issued', at: this.now(), patch });
    this.dispatch({
      type: 'issue/clear',
      kinds: ['command-failed', 'restricted', 'autoplay-blocked', 'no-active-device', 'playback-failed'],
    });
    try {
      await action();
    } catch (error) {
      this.reportError(error);
      void this.resync();
      return;
    }
    if (followUp) this.scheduleFollowUps();
  }

  private scheduleFollowUps(): void {
    for (const timer of this.followUpTimers) this.timers.clearTimeout(timer);
    this.followUpTimers = POLL_INTERVALS.afterCommand.map((delay) =>
      this.timers.setTimeout(() => {
        if (this.running) void this.resync();
      }, delay),
    );
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  private reportError(error: unknown): void {
    if (error instanceof SpotifyAuthError) {
      this.setIssue('unauthorized', 'Spotify authorization expired. Reconnect to continue.');
      return;
    }
    if (!isSpotifyApiError(error)) {
      this.setIssue('command-failed', 'The playback command could not be completed.');
      return;
    }
    switch (error.kind) {
      case 'no-active-device':
        this.setIssue('no-active-device', 'No Spotify device is active. Choose a device or play in this browser.');
        break;
      case 'premium-required':
        this.setIssue('premium-required', 'Spotify Premium is required to control playback.');
        break;
      case 'forbidden':
        this.setIssue('restricted', error.message || 'Spotify did not allow this action right now.');
        break;
      case 'rate-limited':
        this.rateLimitedUntil = this.now() + (error.retryAfterMs ?? 10_000);
        this.setIssue('rate-limited', 'Spotify is rate limiting requests. Playback state will refresh shortly.', {
          retryAfterMs: error.retryAfterMs,
        });
        break;
      case 'unauthorized':
        this.setIssue('unauthorized', 'Spotify authorization expired. Reconnect to continue.');
        break;
      case 'network':
        this.setIssue('network', 'Spotify is unreachable. Retrying…');
        break;
      default:
        this.setIssue('command-failed', error.message || 'The playback command could not be completed.');
    }
  }

  private setIssue(
    kind: PlaybackIssue['kind'],
    message: string,
    extra: Pick<PlaybackIssue, 'retryAfterMs' | 'hints' | 'detail'> = {},
  ): void {
    this.dispatch({ type: 'issue/set', issue: { kind, message, at: this.now(), ...extra } });
  }

  private setSdkError(reason: SdkErrorReason, message: string): void {
    this.dispatch({ type: 'sdk/status', status: { kind: 'error', reason, message } });
  }

  private clearTimer(key: 'pollTimer' | 'reanchorTimer' | 'reconnectTimer' | 'skipCheckTimer'): void {
    if (this[key] !== null) {
      this.timers.clearTimeout(this[key]);
      this[key] = null;
    }
  }

  private dispatch(action: PlayerAction): void {
    this.store.dispatch(action);
  }
}
