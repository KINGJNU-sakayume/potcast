import type { DeviceInfo, TrackIdentity } from '../domain/types';
import type { SongNote } from '../editorial/types';
import type { Ducking, PlaybackEngine } from '../playback/engine';
import { monotonicNow, positionAt } from '../playback/playbackClock';
import type { PlayerStore } from '../playback/playerStore';
import { NO_DISALLOWS, type PlayRequest, type PlayerSnapshot, type QueueSnapshot } from '../playback/types';
import { sleep, type NarrationMode, type Narrator, type SpeakOptions, type Utterance } from './narrator';
import { resolveEpisode } from './resolve';
import { parseEpisodeScript } from './script';
import type { Episode, EpisodeTrack } from './types';

/** Fixtures shared by the episode tests: scripts, a simulated player and a narrator. */

export const HEAD = `---
album: test-album
title: Test episode
hosts:
  a: 진행
  b: 해설
---
`;

export function track(key: string, durationMs: number, title = key.toUpperCase()): EpisodeTrack {
  return { key, id: `id-${key}`, uri: `spotify:track:${key}`, title, durationMs };
}

/** A song note whose translation has one segment per `[startMs, endMs]`. */
export function timedNote(key: string, durationMs: number, segments: Array<[number, number]>): SongNote {
  return {
    key,
    artist: 'test-artist',
    trackIds: [],
    titles: [key],
    short: 'cue',
    translation: {
      brief: { sourceLanguage: 'en', targetLanguage: 'ko', register: 'haeche', speaker: 's', addressee: 'a', written: '2026-10-10' },
      about: 'about',
      timeline: {
        schemaVersion: 2,
        timing: { lrclibId: 1, durationMs },
        segments: segments.map(([startMs, endMs], i) => ({ startMs, endMs, translation: `line ${i + 1}` })),
      },
    },
  };
}

export function episodeFrom(body: string, tracks: readonly EpisodeTrack[], songs: readonly SongNote[] = []): Episode {
  return resolveEpisode(parseEpisodeScript('./notes/episodes/test-album.md', `${HEAD}\n${body}`), tracks, songs);
}

/* ── A player and a narrator for the runner tests ──────────────────────── */

const STAGE_DEVICE: DeviceInfo = {
  id: 'stage',
  name: 'Stage',
  type: 'Computer',
  isActive: true,
  isRestricted: false,
  isThisBrowser: true,
  volumePercent: 60,
  supportsVolume: true,
};

export function identity(item: EpisodeTrack): TrackIdentity {
  return {
    spotifyTrackId: item.id,
    uri: item.uri,
    title: item.title,
    artists: [],
    album: { id: 'album', name: 'Album', uri: 'spotify:album:album', images: [] },
    durationMs: item.durationMs,
  };
}

/**
 * A simulated player over a fixed set of tracks, driven by the (fake) clock:
 * it plays the requested URIs in order and stops after the last one, like
 * Spotify with a list of tracks. Everything the runner asks of it is logged.
 */
export class StageEngine implements PlaybackEngine {
  readonly kind = 'preview' as const;
  /** Transport commands in order, e.g. `play one@47000`, `seek 72000`, `pause`, `resume`. */
  readonly commands: string[] = [];
  /** Every gain the runner set. */
  readonly gains: number[] = [];
  duckingMode: Ducking = 'smooth';
  /** How long a play request takes to produce sound. */
  latencyMs = 0;
  /** When true, play requests are accepted and nothing ever starts. */
  dead = false;
  /** What Spotify would put on after the requested tracks run out. */
  autoplay: EpisodeTrack | null = null;
  /** The listener's repeat mode is "repeat one": a track starts over at its end. */
  repeatOne = false;
  /** The listener's shuffle mode. */
  shuffle = false;

  private queue: EpisodeTrack[] = [];
  private index = 0;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly store: PlayerStore,
    private readonly tracks: readonly EpisodeTrack[],
    private readonly now: () => number = monotonicNow,
  ) {}

  get gain(): number {
    return this.gains.at(-1) ?? 1;
  }

  snapshot(): PlayerSnapshot {
    return this.store.getState().snapshot;
  }

  position(): number {
    return positionAt(this.snapshot(), this.now());
  }

  start(): void {}
  stop(): void {
    this.clearEnd();
  }
  activateAudio(): void {}

  async play(request: PlayRequest): Promise<void> {
    const uris = request.uris ?? [];
    this.commands.push(`play ${uris.map((uri) => uri.replace('spotify:track:', '')).join('+')}@${request.positionMs ?? 0}`);
    if (this.dead) return;
    const list = uris.flatMap((uri) => this.tracks.find((item) => item.uri === uri) ?? []);
    const begin = () => {
      this.queue = list;
      this.index = 0;
      this.show({ positionMs: request.positionMs ?? 0, paused: false });
    };
    if (this.latencyMs > 0) setTimeout(begin, this.latencyMs);
    else begin();
  }

  togglePlay(): Promise<void> {
    return this.snapshot().paused ? this.resume() : this.pause();
  }

  async pause(): Promise<void> {
    this.commands.push('pause');
    this.patch({ paused: true, positionMs: this.position(), sampledAt: this.now() });
  }

  async resume(): Promise<void> {
    this.commands.push('resume');
    if (this.dead || !this.queue[this.index]) return;
    this.patch({ paused: false, positionMs: this.position(), sampledAt: this.now() });
  }

  async next(): Promise<void> {}
  async previous(): Promise<void> {}

  async seek(positionMs: number): Promise<void> {
    this.commands.push(`seek ${Math.round(positionMs)}`);
    this.patch({ positionMs, sampledAt: this.now() });
  }

  async setVolume(): Promise<void> {}
  ducking(): Ducking {
    return this.duckingMode;
  }
  async setGain(gain: number): Promise<void> {
    this.gains.push(Math.round(gain * 1000) / 1000);
  }
  async setShuffle(shuffle: boolean): Promise<void> {
    this.commands.push(`shuffle ${shuffle ? 'on' : 'off'}`);
    this.shuffle = shuffle;
    this.patch({ shuffle });
  }
  async setBrowserPlayback(): Promise<void> {}
  async transferToBrowser(): Promise<void> {}
  async transferTo(): Promise<void> {}
  async resync(): Promise<void> {}
  async getDevices(): Promise<DeviceInfo[]> {
    return [STAGE_DEVICE];
  }
  async getQueue(): Promise<QueueSnapshot> {
    return { currentlyPlaying: null, upNext: [] };
  }

  /** The listener plays something from elsewhere in the app. */
  playOutside(item: EpisodeTrack, positionMs = 0): void {
    this.queue = [item];
    this.index = 0;
    this.show({ positionMs, paused: false });
  }

  private show(state: { positionMs: number; paused: boolean }): void {
    const item = this.queue[this.index];
    if (!item) return;
    const snapshot: PlayerSnapshot = {
      source: 'preview',
      track: identity(item),
      context: null,
      paused: state.paused,
      shuffle: this.shuffle,
      buffering: false,
      positionMs: state.positionMs,
      sampledAt: this.now(),
      durationMs: item.durationMs,
      volume: 0.6,
      device: STAGE_DEVICE,
      disallows: NO_DISALLOWS,
      nextTracks: [],
    };
    this.store.dispatch({ type: 'preview/state', snapshot });
    this.scheduleEnd();
  }

  private patch(patch: Partial<PlayerSnapshot>): void {
    const snapshot = this.snapshot();
    if (!snapshot.track) return;
    this.store.dispatch({ type: 'preview/state', snapshot: { ...snapshot, ...patch } });
    this.scheduleEnd();
  }

  private scheduleEnd(): void {
    this.clearEnd();
    const snapshot = this.snapshot();
    if (snapshot.paused || !snapshot.track) return;
    this.endTimer = setTimeout(() => this.advance(), Math.max(0, snapshot.durationMs - this.position()));
  }

  private advance(): void {
    if (this.repeatOne) {
      this.show({ positionMs: 0, paused: false });
    } else if (this.index < this.queue.length - 1) {
      this.index += 1;
      this.show({ positionMs: 0, paused: false });
    } else if (this.autoplay) {
      this.queue = [this.autoplay];
      this.index = 0;
      this.show({ positionMs: 0, paused: false });
    } else {
      // The list ran out: Spotify stops on its first track, at the start.
      this.index = 0;
      this.show({ positionMs: 0, paused: true });
    }
  }

  private clearEnd(): void {
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    this.endTimer = null;
  }
}

/** Says every utterance in `utteranceMs` and logs it as `slot:text`. */
export class ScriptedNarrator implements Narrator {
  readonly spoken: string[] = [];
  /** What each utterance was handed over with, in the same order as `spoken`. */
  readonly calls: Array<Omit<SpeakOptions, 'signal'>> = [];
  /** Every list of upcoming utterances the runner announced. */
  readonly prepared: Utterance[][] = [];
  readonly unlocks: number[] = [];
  utteranceMs = 1000;
  narration: NarrationMode = 'voice';

  mode(): NarrationMode {
    return this.narration;
  }
  subscribe(): () => void {
    return () => undefined;
  }
  unlock(): void {
    this.unlocks.push(this.spoken.length);
  }
  prepare(upcoming: readonly Utterance[]): void {
    this.prepared.push([...upcoming]);
  }
  async speak(text: string, { signal, ...options }: SpeakOptions): Promise<void> {
    this.spoken.push(`${options.voiceSlot}:${text}`);
    this.calls.push(options);
    await sleep(this.utteranceMs, signal);
  }
}
