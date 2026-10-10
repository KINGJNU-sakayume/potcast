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
const START_TIMEOUT_MS = 5000;
/** After this many utterances in a row that never started, speech is given up for the session. */
const MAX_FAILURES = 2;
/** Chrome drops an utterance handed over right after cancel(): the next one waits this long. */
const CANCEL_SETTLE_MS = 180;
/** How often a started utterance is checked for having ended without saying so. */
const END_POLL_MS = 300;

type SpeechSynth = Pick<SpeechSynthesis, 'speak' | 'cancel' | 'resume' | 'speaking' | 'pending'>;

const clock = (): number => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/**
 * The browser's own speech (Web Speech API): free, nothing to set up, and the
 * voice depends on the browser. Every utterance is watched, because browsers
 * sometimes never start one or never report its end: a voice that stays
 * silent turns into captions instead of stalling the episode.
 *
 * Three Chrome habits are worked around here:
 * - an utterance spoken right after `cancel()` is silently dropped, so one is
 *   never handed over within a moment of a cancel;
 * - an utterance nothing else refers to can be collected before it ends, and
 *   then never reports its end, so the one being said is held on to;
 * - `end` can still go missing, so a started utterance is also polled.
 */
export class SpeechNarrator implements Narrator {
  private failures = 0;
  private gaveUp = false;
  private lastCancelAt = Number.NEGATIVE_INFINITY;
  /** The utterance being said, kept reachable until it has ended. */
  private live: SpeechSynthesisUtterance | null = null;
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
      // Something left speaking or queued (an earlier page, a "Hear it" sample) would hold the first line back.
      if (this.synth.speaking || this.synth.pending) this.cancel();
      // Chrome can be left paused by a tab switch; resuming when nothing is paused does nothing.
      this.synth.resume();
    } catch {
      /* speech is unavailable: lines fall back to captions */
    }
  }

  private cancel(): void {
    this.lastCancelAt = clock();
    try {
      this.synth.cancel();
    } catch {
      /* already stopped */
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
      let handOver: ReturnType<typeof setTimeout> | null = null;
      let startTimer: ReturnType<typeof setTimeout> | null = null;
      let endTimer: ReturnType<typeof setTimeout> | null = null;
      let poll: ReturnType<typeof setInterval> | null = null;
      let quietPolls = 0;

      const settle = (outcome: 'done' | 'aborted') => {
        if (settled) return;
        settled = true;
        if (handOver) clearTimeout(handOver);
        if (startTimer) clearTimeout(startTimer);
        if (endTimer) clearTimeout(endTimer);
        if (poll) clearInterval(poll);
        if (this.live === utterance) this.live = null;
        signal.removeEventListener('abort', onAbort);
        if (outcome === 'aborted') reject(abortError());
        else resolve();
      };
      const onAbort = () => {
        // Only an utterance the engine already has needs cancelling.
        if (!handOver) this.cancel();
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
        this.cancel();
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
        if (settled || started) return;
        started = true;
        this.failures = 0;
        if (startTimer) clearTimeout(startTimer);
        startTimer = null;
        // The end may never be reported: notice the engine going quiet, and move on in any case
        // well after the line must have been said.
        poll = setInterval(() => {
          quietPolls = this.synth.speaking || this.synth.pending ? 0 : quietPolls + 1;
          if (quietPolls >= 2) settle('done');
        }, END_POLL_MS);
        endTimer = setTimeout(() => settle('done'), estimate * 2 + 4000);
      };
      utterance.onend = () => settle('done');
      utterance.onerror = (event) => {
        // `interrupted` and `canceled` follow our own cancel(); the abort handler has settled those.
        if (signal.aborted || event.error === 'interrupted' || event.error === 'canceled') return;
        if (started) settle('done');
        else fallBack();
      };

      const speakNow = () => {
        handOver = null;
        if (settled) return;
        this.live = utterance;
        startTimer = setTimeout(() => {
          if (!started) fallBack();
        }, START_TIMEOUT_MS);
        try {
          this.synth.speak(utterance);
        } catch {
          fallBack();
        }
      };

      signal.addEventListener('abort', onAbort, { once: true });
      const sinceCancel = clock() - this.lastCancelAt;
      if (sinceCancel < CANCEL_SETTLE_MS) handOver = setTimeout(speakNow, CANCEL_SETTLE_MS - sinceCancel);
      else speakNow();
    });
  }
}
