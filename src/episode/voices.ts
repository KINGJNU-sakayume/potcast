import { useSyncExternalStore } from 'react';

/**
 * The browser's speech voices (Web Speech API). The list is filled in a
 * moment after the page loads and can change, so it is read through a small
 * store. Which voices exist depends on the browser and the system: Edge
 * offers natural-sounding Korean voices of its own, Chrome one network voice
 * plus whatever Windows or macOS has installed.
 */

type Synth = Pick<SpeechSynthesis, 'getVoices' | 'addEventListener' | 'removeEventListener'>;

function browserSynth(): Synth | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis ? window.speechSynthesis : null;
}

const EMPTY: SpeechSynthesisVoice[] = [];
let cached: SpeechSynthesisVoice[] = EMPTY;

function read(): SpeechSynthesisVoice[] {
  let next: SpeechSynthesisVoice[];
  try {
    next = browserSynth()?.getVoices() ?? [];
  } catch {
    next = [];
  }
  const same = next.length === cached.length && next.every((voice, i) => voice.voiceURI === cached[i]!.voiceURI);
  if (!same) cached = next.length === 0 ? EMPTY : next;
  return cached;
}

export const voiceCatalog = {
  subscribe(listener: () => void): () => void {
    const synth = browserSynth();
    if (!synth || typeof synth.addEventListener !== 'function') return () => undefined;
    const onChange = () => {
      read();
      listener();
    };
    synth.addEventListener('voiceschanged', onChange);
    return () => synth.removeEventListener('voiceschanged', onChange);
  },
  getSnapshot: read,
};

export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(voiceCatalog.subscribe, voiceCatalog.getSnapshot, () => EMPTY);
}

export function isKorean(voice: Pick<SpeechSynthesisVoice, 'lang'>): boolean {
  return /^ko(?:[-_]|$)/i.test(voice.lang);
}

/** Higher sounds better: the neural voices first, the old system voices last. */
function quality(voice: SpeechSynthesisVoice): number {
  const name = voice.name;
  let score = 0;
  if (/natural|neural/i.test(name)) score += 4;
  if (/premium|enhanced|siri/i.test(name)) score += 3;
  if (/google/i.test(name)) score += 2;
  if (/online/i.test(name)) score += 1;
  if (/compact/i.test(name)) score -= 1;
  return score;
}

/** The Korean voices, best first. */
export function koreanVoices(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices
    .filter(isKorean)
    .map((voice, index) => ({ voice, index }))
    .sort((a, b) => quality(b.voice) - quality(a.voice) || a.index - b.index)
    .map((entry) => entry.voice);
}

export interface VoiceChoice {
  /** Null when the browser has no Korean voice: the line is shown, not spoken. */
  voice: SpeechSynthesisVoice | null;
  /** 1 is the voice as it is; the second host is lowered when both share one voice. */
  pitch: number;
}

/**
 * A voice for each host: the listener's own choice when that voice still
 * exists, otherwise the best Korean voices in order. With a single voice the
 * second host speaks lower, so the two can still be told apart.
 */
export function chooseVoices(
  hostCount: number,
  voices: readonly SpeechSynthesisVoice[],
  preferred: ReadonlyArray<string | null | undefined> = [],
): VoiceChoice[] {
  const korean = koreanVoices(voices);
  const chosen: Array<SpeechSynthesisVoice | null> = [];
  for (let i = 0; i < hostCount; i += 1) {
    const wanted = preferred[i] ? voices.find((voice) => voice.voiceURI === preferred[i]) : undefined;
    chosen.push(wanted ?? null);
  }
  for (let i = 0; i < hostCount; i += 1) {
    if (chosen[i]) continue;
    chosen[i] = korean.find((voice) => !chosen.includes(voice)) ?? korean[0] ?? null;
  }
  return chosen.map((voice, i) => ({
    voice,
    pitch: voice !== null && chosen.indexOf(voice) < i ? 0.8 : 1,
  }));
}
