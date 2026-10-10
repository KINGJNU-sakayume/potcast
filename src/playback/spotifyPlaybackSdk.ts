import type { SdkErrorReason } from './types';

/**
 * Spotify Web Playback SDK adapter. Loads https://sdk.scdn.co/spotify-player.js
 * once, creates a Spotify.Player and forwards its events as plain callbacks.
 * Requires the `streaming`, `user-read-email` and `user-read-private` scopes,
 * a Premium account, and a browser with Encrypted Media Extensions.
 */

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
let sdkPromise: Promise<typeof Spotify> | null = null;

export function isPlaybackSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMediaKeySystemAccess === 'function';
}

export function loadWebPlaybackSdk(timeoutMs = 20_000): Promise<typeof Spotify> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.Spotify?.Player) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<typeof Spotify>((resolve, reject) => {
    const fail = (message: string) => {
      clearTimeout(timer);
      sdkPromise = null;
      script.remove();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail('Timed out loading the Spotify Web Playback SDK.'), timeoutMs);
    window.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timer);
      resolve(window.Spotify);
    };
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onerror = () => fail('Could not load the Spotify Web Playback SDK.');
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export interface WebPlaybackCallbacks {
  onReady(deviceId: string): void;
  onNotReady(deviceId: string): void;
  onState(state: Spotify.PlaybackState | null): void;
  onError(reason: SdkErrorReason, message: string): void;
  onAutoplayFailed(): void;
}

export interface WebPlaybackOptions {
  name: string;
  getOAuthToken(): Promise<string>;
  initialVolume: number;
  callbacks: WebPlaybackCallbacks;
}

/** The subset of the SDK player the engine uses — also implemented by test fakes. */
export interface WebPlaybackDevice {
  connect(): Promise<boolean>;
  disconnect(): void;
  getCurrentState(): Promise<Spotify.PlaybackState | null>;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  activateElement(): Promise<void>;
}

export type WebPlaybackFactory = (options: WebPlaybackOptions) => WebPlaybackDevice;

export class WebPlaybackAdapter implements WebPlaybackDevice {
  private player: Spotify.Player | null = null;
  private disposed = false;

  constructor(private readonly options: WebPlaybackOptions) {}

  async connect(): Promise<boolean> {
    const SpotifySdk = await loadWebPlaybackSdk();
    if (this.disposed) return false;
    const { callbacks } = this.options;
    const player = new SpotifySdk.Player({
      name: this.options.name,
      volume: this.options.initialVolume,
      enableMediaSession: true,
      getOAuthToken: (cb) => {
        this.options
          .getOAuthToken()
          .then(cb)
          .catch(() => callbacks.onError('authentication', 'Could not obtain a Spotify access token.'));
      },
    });
    player.addListener('ready', ({ device_id }) => callbacks.onReady(device_id));
    player.addListener('not_ready', ({ device_id }) => callbacks.onNotReady(device_id));
    // The SDK passes null when playback is transferred away from this device.
    player.addListener('player_state_changed', (state) => callbacks.onState(state ?? null));
    player.addListener('initialization_error', ({ message }) => callbacks.onError('initialization', message));
    player.addListener('authentication_error', ({ message }) => callbacks.onError('authentication', message));
    player.addListener('account_error', ({ message }) => callbacks.onError('account', message));
    player.addListener('playback_error', ({ message }) => callbacks.onError('playback', message));
    player.addListener('autoplay_failed', () => callbacks.onAutoplayFailed());
    this.player = player;
    return player.connect();
  }

  disconnect(): void {
    this.disposed = true;
    this.player?.disconnect();
    this.player = null;
  }

  getCurrentState(): Promise<Spotify.PlaybackState | null> {
    return this.player ? this.player.getCurrentState() : Promise.resolve(null);
  }

  togglePlay(): Promise<void> {
    return this.player?.togglePlay() ?? Promise.resolve();
  }

  pause(): Promise<void> {
    return this.player?.pause() ?? Promise.resolve();
  }

  resume(): Promise<void> {
    return this.player?.resume() ?? Promise.resolve();
  }

  nextTrack(): Promise<void> {
    return this.player?.nextTrack() ?? Promise.resolve();
  }

  previousTrack(): Promise<void> {
    return this.player?.previousTrack() ?? Promise.resolve();
  }

  seek(positionMs: number): Promise<void> {
    return this.player?.seek(Math.max(0, Math.round(positionMs))) ?? Promise.resolve();
  }

  setVolume(volume: number): Promise<void> {
    return this.player?.setVolume(Math.min(1, Math.max(0, volume))) ?? Promise.resolve();
  }

  /** Must run synchronously inside a user gesture so browsers allow audio. */
  activateElement(): Promise<void> {
    return this.player?.activateElement() ?? Promise.resolve();
  }
}

export const createWebPlaybackAdapter: WebPlaybackFactory = (options) => new WebPlaybackAdapter(options);
