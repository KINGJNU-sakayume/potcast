import type { DeviceInfo, TrackIdentity } from '../domain/types';
import { shuffled } from '../lib/shuffle';
import { parseSpotifyUri } from '../lib/spotifyUri';
import type { PlaybackEngine } from '../playback/engine';
import { monotonicNow, positionAt } from '../playback/playbackClock';
import type { PlayerStore } from '../playback/playerStore';
import { NO_DISALLOWS, type PlayRequest, type PlayerSnapshot, type QueueSnapshot } from '../playback/types';
import { PREVIEW_PLAYLISTS, PREVIEW_START, PREVIEW_TRACKS, previewAlbumTracks, previewTrack } from './previewData';

export const PREVIEW_DEVICE: DeviceInfo = {
  id: 'preview',
  name: 'Preview — no audio',
  type: 'Preview',
  isActive: true,
  isRestricted: false,
  isThisBrowser: true,
  volumePercent: 60,
  supportsVolume: true,
};

/**
 * Preview-only engine: a simulated transport over the preview catalogue so
 * the interface can be explored without Spotify. It is the only code path
 * with a local playback timeline and is never created for a Spotify session.
 */
export class PreviewPlaybackEngine implements PlaybackEngine {
  readonly kind = 'preview' as const;
  /** The context in its own order. */
  private order: TrackIdentity[] = [];
  /** Play order: `order`, or the current track followed by the rest shuffled. */
  private queue: TrackIdentity[] = [];
  private index = 0;
  private shuffle = false;
  private contextUri: string | null = null;
  private volume = 0.6;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly store: PlayerStore,
    private readonly now: () => number = monotonicNow,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.store.dispatch({ type: 'sdk/status', status: { kind: 'disabled' } });
    if (!this.store.getState().snapshot.track) {
      this.load(
        { contextUri: PREVIEW_START.contextUri, offsetUri: PREVIEW_START.trackUri },
        PREVIEW_START.positionMs,
        false,
      );
    } else {
      this.scheduleEnd();
    }
  }

  stop(): void {
    this.running = false;
    this.clearEnd();
  }

  activateAudio(): void {
    /* no audio in the preview */
  }

  async play(request: PlayRequest): Promise<void> {
    this.load(request, request.positionMs ?? 0, false);
  }

  togglePlay(): Promise<void> {
    return this.store.getState().snapshot.paused ? this.resume() : this.pause();
  }

  async pause(): Promise<void> {
    this.update({ paused: true, positionMs: this.position(), sampledAt: this.now() });
  }

  async resume(): Promise<void> {
    if (!this.current()) return;
    this.update({ paused: false, positionMs: this.position(), sampledAt: this.now() });
  }

  async next(): Promise<void> {
    if (this.index < this.queue.length - 1) this.moveTo(this.index + 1, false);
    else this.update({ paused: true, positionMs: this.current()?.durationMs ?? 0, sampledAt: this.now() });
  }

  async previous(): Promise<void> {
    if (this.position() > 3000 || this.index === 0) {
      this.update({ positionMs: 0, sampledAt: this.now() });
      return;
    }
    this.moveTo(this.index - 1, this.store.getState().snapshot.paused);
  }

  async seek(positionMs: number): Promise<void> {
    const duration = this.current()?.durationMs ?? 0;
    this.update({ positionMs: Math.min(Math.max(0, positionMs), duration), sampledAt: this.now() });
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = Math.min(1, Math.max(0, volume));
    this.update({
      volume: this.volume,
      device: { ...PREVIEW_DEVICE, volumePercent: Math.round(this.volume * 100) },
    });
  }

  async setShuffle(shuffle: boolean): Promise<void> {
    this.shuffle = shuffle;
    const current = this.current();
    if (!current) return;
    // As in Spotify: the current track keeps playing and only what follows is reordered.
    this.arrange(Math.max(0, this.order.indexOf(current)), current);
    this.moveTo(this.index, this.store.getState().snapshot.paused, this.position());
  }

  async transferToBrowser(): Promise<void> {
    /* single preview device */
  }

  async transferTo(): Promise<void> {
    /* single preview device */
  }

  async resync(): Promise<void> {
    /* state is local */
  }

  async getDevices(): Promise<DeviceInfo[]> {
    return [{ ...PREVIEW_DEVICE, volumePercent: Math.round(this.volume * 100) }];
  }

  async getQueue(): Promise<QueueSnapshot> {
    return { currentlyPlaying: this.current() ?? null, upNext: this.queue.slice(this.index + 1) };
  }

  /* ── internals ───────────────────────────────────────────────────────── */

  private resolve(request: PlayRequest): TrackIdentity[] {
    const context = parseSpotifyUri(request.contextUri);
    if (context?.type === 'album') {
      const list = previewAlbumTracks(context.id);
      if (list.length > 0) return list;
    }
    if (context?.type === 'playlist') {
      const playlist = PREVIEW_PLAYLISTS.find((p) => p.id === context.id);
      if (playlist) return playlist.trackUris.flatMap((u) => previewTrack(u) ?? []);
    }
    if (context?.type === 'artist') {
      const list = PREVIEW_TRACKS.filter((t) => t.artists.some((a) => a.id === context.id));
      if (list.length > 0) return list;
    }
    const fromUris = (request.uris ?? (request.offsetUri ? [request.offsetUri] : [])).flatMap((u) => previewTrack(u) ?? []);
    return fromUris;
  }

  private load(request: PlayRequest, positionMs: number, paused: boolean): void {
    const list = this.resolve(request);
    if (list.length === 0) {
      this.store.dispatch({
        type: 'issue/set',
        issue: { kind: 'command-failed', message: 'This item is not playable in the preview catalogue.', at: this.now() },
      });
      return;
    }
    this.order = list;
    this.contextUri = request.contextUri ?? null;
    const offset = request.offsetUri ? list.findIndex((t) => t.uri === request.offsetUri) : 0;
    // Shuffle without a chosen track starts anywhere in the context.
    const start = this.shuffle && !request.offsetUri ? Math.floor(Math.random() * list.length) : Math.max(0, offset);
    this.arrange(start, list[start]!);
    this.moveTo(this.index, paused, positionMs);
  }

  /** Builds the play order around `current`, which sits at `orderIndex` in the context. */
  private arrange(orderIndex: number, current: TrackIdentity): void {
    if (this.shuffle) {
      this.queue = [current, ...shuffled(this.order.filter((_, i) => i !== orderIndex))];
      this.index = 0;
    } else {
      this.queue = [...this.order];
      this.index = orderIndex;
    }
  }

  private moveTo(index: number, paused: boolean, positionMs = 0): void {
    this.index = index;
    const track = this.queue[index]!;
    const context = parseSpotifyUri(this.contextUri);
    const snapshot: PlayerSnapshot = {
      source: 'preview',
      track,
      context: this.contextUri ? { uri: this.contextUri, type: context?.type ?? 'context', name: null } : null,
      paused,
      shuffle: this.shuffle,
      buffering: false,
      positionMs,
      sampledAt: this.now(),
      durationMs: track.durationMs,
      volume: this.volume,
      device: { ...PREVIEW_DEVICE, volumePercent: Math.round(this.volume * 100) },
      disallows: { ...NO_DISALLOWS, skippingPrev: false, skippingNext: index >= this.queue.length - 1 },
      nextTracks: this.queue.slice(index + 1, index + 3),
    };
    this.store.dispatch({ type: 'issue/clear' });
    this.store.dispatch({ type: 'preview/state', snapshot });
    this.scheduleEnd();
  }

  private update(patch: Partial<PlayerSnapshot>): void {
    const { snapshot } = this.store.getState();
    if (!snapshot.track) return;
    this.store.dispatch({ type: 'preview/state', snapshot: { ...snapshot, ...patch } });
    this.scheduleEnd();
  }

  private current(): TrackIdentity | undefined {
    return this.queue[this.index];
  }

  private position(): number {
    return positionAt(this.store.getState().snapshot, this.now());
  }

  private scheduleEnd(): void {
    this.clearEnd();
    const { snapshot } = this.store.getState();
    if (!this.running || snapshot.paused || !snapshot.track) return;
    const remaining = Math.max(0, snapshot.durationMs - positionAt(snapshot, this.now()));
    this.endTimer = setTimeout(() => void this.next(), remaining + 50);
  }

  private clearEnd(): void {
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    this.endTimer = null;
  }
}
