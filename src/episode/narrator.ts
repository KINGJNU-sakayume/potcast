import { estimateSpeechMs, speechText } from './speechText';
import type { VoiceChoice } from './voices';

/**
 * Says the hosts' lines. The runner hands over one utterance at a time and
 * waits for it to finish; stopping an utterance rejects with an AbortError.
 *
 * - `voice`: the browser's speech synthesis says the line.
 * - `captions`: there is no usable voice (none installed for Korean, or the
 *   browser's speech does not respond), so the line is only shown, for as
 *   long as it would take to say. An episode therefore always runs.
 */
export type NarrationMode = 'voice' | 'captions';

export interface SpeakOptions {
  /** Index of the host among the episode's hosts: picks the voice. */
  voiceSlot: number;
  signal: AbortSignal;
}

export interface Narrator {
  mode(): NarrationMode;
  /** Called when `mode()` may have changed. */
  subscribe(listener: () => void): () => void;
  /** Call inside a click or key handler: some browsers only let speech start from one. */
  unlock(): void;
  speak(text: string, options: SpeakOptions): Promise<void>;
}

export interface NarrationSettings {
  /** Speech rate; 1 is the voice's normal pace. */
  rate: number;
  /** One per host. */
  voices: VoiceChoice[];
}

export function abortError(): DOMException {
  return new DOMException('The episode moved on.', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Resolves after `ms`; rejects with an AbortError as soon as the signal aborts. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** No speech at all: every line is shown for the time it would take to say. */
export class CaptionNarrator implements Narrator {
  constructor(private readonly settings: () => Pick<NarrationSettings, 'rate'> = () => ({ rate: 1 })) {}

  mode(): NarrationMode {
    return 'captions';
  }

  subscribe(): () => void {
    return () => undefined;
  }

  unlock(): void {
    /* nothing to unlock */
  }

  speak(text: string, { signal }: SpeakOptions): Promise<void> {
    return sleep(estimateSpeechMs(text, this.settings().rate), signal);
  }
}

/** How long a voice may take to start before the line falls back to captions. */
const START_TIMEOUT_MS = 4000;
/** After this many utterances in a row that never started, speech is given up for the session. */
const MAX_FAILURES = 2;

type SpeechSynth = Pick<SpeechSynthesis, 'speak' | 'cancel'>;

/**
 * The browser's own speech (Web Speech API): free, nothing to set up, and the
 * voice depends on the browser. Every utterance is watched, because browsers
 * sometimes never start one or never report its end: a voice that stays
 * silent turns into captions instead of stalling the episode.
 */
export class SpeechNarrator implements Narrator {
  private failures = 0;
  private gaveUp = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly synth: SpeechSynth,
    private readonly createUtterance: (text: string) => SpeechSynthesisUtterance,
    private readonly settings: () => NarrationSettings,
  ) {}

  mode(): NarrationMode {
    return this.gaveUp || !this.settings().voices.some((choice) => choice.voice) ? 'captions' : 'voice';
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  unlock(): void {
    try {
      // Clears anything a previous page left queued, then says nothing once from inside the gesture.
      this.synth.cancel();
      const silent = this.createUtterance(' ');
      silent.volume = 0;
      this.synth.speak(silent);
    } catch {
      /* speech is unavailable: lines fall back to captions */
    }
  }

  speak(text: string, { voiceSlot, signal }: SpeakOptions): Promise<void> {
    const { rate, voices } = this.settings();
    const choice = voices[voiceSlot] ?? voices[0];
    const estimate = estimateSpeechMs(text, rate);
    if (signal.aborted) return Promise.reject(abortError());
    if (this.gaveUp || !choice?.voice) return sleep(estimate, signal);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let started = false;
      let startTimer: ReturnType<typeof setTimeout> | null = null;
      let endTimer: ReturnType<typeof setTimeout> | null = null;

      const settle = (outcome: 'done' | 'aborted') => {
        if (settled) return;
        settled = true;
        if (startTimer) clearTimeout(startTimer);
        if (endTimer) clearTimeout(endTimer);
        signal.removeEventListener('abort', onAbort);
        if (outcome === 'aborted') reject(abortError());
        else resolve();
      };
      const onAbort = () => {
        try {
          this.synth.cancel();
        } catch {
          /* already stopped */
        }
        settle('aborted');
      };
      /** The voice did not speak: show the line for its time instead, and stop trying after a few of these. */
      const fallBack = () => {
        if (settled) return;
        this.failures += 1;
        if (this.failures >= MAX_FAILURES && !this.gaveUp) {
          this.gaveUp = true;
          for (const listener of this.listeners) listener();
        }
        try {
          this.synth.cancel();
        } catch {
          /* already stopped */
        }
        if (startTimer) clearTimeout(startTimer);
        startTimer = null;
        sleep(estimate, signal).then(
          () => settle('done'),
          () => settle('aborted'),
        );
      };

      const utterance = this.createUtterance(speechText(text));
      utterance.voice = choice.voice;
      utterance.lang = choice.voice!.lang;
      utterance.rate = rate;
      utterance.pitch = choice.pitch;
      utterance.onstart = () => {
        started = true;
        this.failures = 0;
        if (startTimer) clearTimeout(startTimer);
        startTimer = null;
        // Some browsers never report the end of an utterance; move on well after it must have ended.
        endTimer = setTimeout(() => settle('done'), estimate * 2.5 + 6000);
      };
      utterance.onend = () => settle('done');
      utterance.onerror = (event) => {
        // `interrupted` and `canceled` follow our own cancel(); the abort handler has settled those.
        if (signal.aborted || event.error === 'interrupted' || event.error === 'canceled') return;
        if (started) settle('done');
        else fallBack();
      };

      signal.addEventListener('abort', onAbort, { once: true });
      startTimer = setTimeout(() => {
        if (!started) fallBack();
      }, START_TIMEOUT_MS);
      try {
        this.synth.speak(utterance);
      } catch {
        fallBack();
      }
    });
  }
}
