import { abortError, isAbortError, type NarrationMode, type Narrator, type SpeakOptions, type Utterance } from '../narrator';
import { clipKey, clipText } from './clip';
import type { NarrationLibrary } from './library';

/** How long a clip may take to arrive before the line is said another way. */
const LOAD_TIMEOUT_MS = 6000;
/** How long the player may take to start a clip it already has. */
const START_TIMEOUT_MS = 4000;
/** After this many clips in a row that would not play, recordings are given up for the session. */
const MAX_FAILURES = 3;
/** A clip picked up after a pause goes back this far, so the word it stopped in is heard whole. */
const RESUME_BACK_MS = 250;

/** The part of an audio element the narrator uses. */
export type ClipPlayer = Pick<
  HTMLAudioElement,
  'src' | 'currentTime' | 'playbackRate' | 'defaultPlaybackRate' | 'muted' | 'preload' | 'play' | 'pause' | 'addEventListener' | 'removeEventListener'
>;

/** A moment of silence as a WAV file: played once inside a click, it lets the element play by itself afterwards. */
function silence(): string {
  const samples = 400;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

function browserPlayer(): ClipPlayer | null {
  return typeof Audio === 'function' ? new Audio() : null;
}

const clampRate = (rate: number): number => Math.min(2, Math.max(0.5, Number.isFinite(rate) ? rate : 1));

/**
 * Plays the hosts' lines from recordings (see clip.ts for how a line finds
 * its clip). One audio element is reused for every clip, which is what lets
 * a phone keep playing them without a tap each time.
 *
 * It never leaves a line unsaid: a line without a clip, a clip that does not
 * arrive, a browser that refuses to play — each hands that one line to the
 * `fallback` narrator (the browser's voice, or captions).
 */
export class RecordedNarrator implements Narrator {
  private player: ClipPlayer | null | undefined;
  private failures = 0;
  private gaveUp = false;
  /** The clip the player is on. */
  private playing: string | null = null;
  /** Where a clip was stopped by a pause. */
  private stopped: { key: string; atMs: number } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly library: NarrationLibrary,
    private readonly fallback: Narrator,
    private readonly settings: () => { rate: number },
    private readonly createPlayer: () => ClipPlayer | null = browserPlayer,
  ) {}

  mode(): NarrationMode {
    return !this.gaveUp && this.library.getManifest() ? 'recorded' : this.fallback.mode();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    const unsubscribeLibrary = this.library.subscribe(listener);
    const unsubscribeFallback = this.fallback.subscribe(listener);
    return () => {
      this.listeners.delete(listener);
      unsubscribeLibrary();
      unsubscribeFallback();
    };
  }

  unlock(): void {
    this.fallback.unlock();
    // Without recordings there is nothing to unlock, and no reason to touch an audio element at all.
    if (this.gaveUp || !this.library.getManifest()) return;
    const player = this.audio();
    if (!player || this.playing) return;
    try {
      player.muted = true;
      player.src = silence();
      const started: Promise<void> | undefined = player.play();
      const settle = () => {
        // A clip may have started in the meantime: leave that one alone.
        if (this.playing) return;
        player.pause();
        player.muted = false;
      };
      if (started && typeof started.then === 'function') started.then(settle, settle);
      else settle();
    } catch {
      player.muted = false;
    }
  }

  prepare(upcoming: readonly Utterance[]): void {
    if (this.gaveUp || !this.library.getManifest()) return;
    this.library.prepare(upcoming.flatMap((utterance) => this.keyOf(utterance) ?? []));
  }

  durationMs(utterance: Utterance): number | undefined {
    if (this.gaveUp) return undefined;
    const key = this.keyOf(utterance);
    const ms = key ? this.library.clipMs(key) : undefined;
    return ms === undefined ? undefined : ms / clampRate(this.settings().rate);
  }

  speak(text: string, options: SpeakOptions): Promise<void> {
    const key = this.keyOf({ text, ...options });
    const ms = key ? this.library.clipMs(key) : undefined;
    if (!key || ms === undefined || this.gaveUp || !this.audio()) {
      this.stopped = null;
      return this.fallback.speak(text, options);
    }
    return this.play(key, ms, text, options);
  }

  private audio(): ClipPlayer | null {
    if (this.player === undefined) {
      try {
        this.player = this.createPlayer();
        if (this.player) this.player.preload = 'auto';
      } catch {
        this.player = null;
      }
    }
    return this.player;
  }

  private keyOf(utterance: Utterance): string | null {
    return utterance.voice ? clipKey(utterance.voice, clipText(utterance.text, utterance.say ?? [])) : null;
  }

  /** The recording did not play: this line goes to the fallback, and after a few of these so does every other. */
  private failed(text: string, options: SpeakOptions): Promise<void> {
    this.failures += 1;
    if (this.failures >= MAX_FAILURES && !this.gaveUp) {
      this.gaveUp = true;
      for (const listener of this.listeners) listener();
    }
    return this.fallback.speak(text, options);
  }

  private async play(key: string, ms: number, text: string, options: SpeakOptions): Promise<void> {
    const { signal } = options;
    if (signal.aborted) throw abortError();
    const resumeAtMs = options.resume && this.stopped?.key === key ? Math.max(0, this.stopped.atMs - RESUME_BACK_MS) : 0;
    this.stopped = null;

    let url: string;
    try {
      url = await this.fetched(key, signal);
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw abortError();
      return this.failed(text, options);
    }
    if (signal.aborted) throw abortError();

    const player = this.audio()!;
    const rate = clampRate(this.settings().rate);
    const outcome = await new Promise<'done' | 'aborted' | 'failed'>((resolve) => {
      let settled = false;
      let started = false;
      let startTimer: ReturnType<typeof setTimeout> | null = null;
      let endTimer: ReturnType<typeof setTimeout> | null = null;

      const settle = (result: 'done' | 'aborted' | 'failed') => {
        if (settled) return;
        settled = true;
        if (startTimer) clearTimeout(startTimer);
        if (endTimer) clearTimeout(endTimer);
        player.removeEventListener('ended', onEnded);
        player.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
        if (this.playing === key) this.playing = null;
        resolve(result);
      };
      const onEnded = () => {
        if (started) settle('done');
      };
      // An error part-way through has still said most of the line: move on rather than say it twice.
      const onError = () => settle(started ? 'done' : 'failed');
      const onAbort = () => {
        this.stopped = { key, atMs: player.currentTime * 1000 };
        player.pause();
        settle('aborted');
      };

      player.addEventListener('ended', onEnded);
      player.addEventListener('error', onError);
      signal.addEventListener('abort', onAbort, { once: true });
      startTimer = setTimeout(() => {
        if (started) return;
        player.pause();
        settle('failed');
      }, START_TIMEOUT_MS);

      this.playing = key;
      try {
        player.muted = false;
        player.src = url;
        // Loading a new source puts the rate back to the default one.
        player.defaultPlaybackRate = rate;
        player.playbackRate = rate;
        if (resumeAtMs > 0) player.currentTime = resumeAtMs / 1000;
        Promise.resolve(player.play()).then(
          () => {
            if (settled) return;
            started = true;
            this.failures = 0;
            if (startTimer) clearTimeout(startTimer);
            // The end may never be reported: move on well after the clip must have finished.
            endTimer = setTimeout(() => settle('done'), (Math.max(0, ms - resumeAtMs) / rate) * 1.5 + 3000);
          },
          () => settle('failed'),
        );
      } catch {
        settle('failed');
      }
    });

    if (outcome === 'aborted') throw abortError();
    if (outcome === 'failed') {
      if (signal.aborted) throw abortError();
      return this.failed(text, options);
    }
  }

  /** The clip's URL, or a rejection when it has not arrived in time or the line was stopped. */
  private fetched(key: string, signal: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const finish = (act: () => void) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        act();
      };
      const onAbort = () => finish(() => reject(abortError()));
      const timer = setTimeout(() => finish(() => reject(new Error(`Clip ${key} did not arrive in time.`))), LOAD_TIMEOUT_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      this.library.clip(key).then(
        (url) => finish(() => resolve(url)),
        (error) => finish(() => reject(error)),
      );
    });
  }
}
