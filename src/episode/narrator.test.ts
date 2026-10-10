import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptionNarrator, isAbortError, SpeechNarrator, type NarrationSettings } from './narrator';
import { estimateSpeechMs } from './speechText';
import { chooseVoices, koreanVoices } from './voices';

function voice(name: string, lang = 'ko-KR', localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name };
}

interface FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

/** A speech engine that starts and ends utterances only when the test says so. */
function fakeSynth() {
  const queue: FakeUtterance[] = [];
  const synth = {
    /** What the engine reports about itself; the tests set these as a browser would. */
    speaking: false,
    pending: false,
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      queue.push(utterance as unknown as FakeUtterance);
    }),
    cancel: vi.fn(() => {
      synth.speaking = false;
      for (const utterance of queue.splice(0)) utterance.onerror?.({ error: 'canceled' });
    }),
    resume: vi.fn(),
  };
  const create = (text: string) =>
    ({ text, voice: null, lang: '', rate: 1, pitch: 1, volume: 1, onstart: null, onend: null, onerror: null }) as unknown as SpeechSynthesisUtterance;
  return { synth, create, queue };
}

const SUNHI = voice('Microsoft SunHi Online (Natural) - Korean (Korea)', 'ko-KR', false);
const INJOON = voice('Microsoft InJoon Online (Natural) - Korean (Korea)', 'ko-KR', false);
const HEAMI = voice('Microsoft Heami - Korean (Korean)');

function settings(voices = chooseVoices(2, [HEAMI, SUNHI, INJOON]), rate = 1): () => NarrationSettings {
  return () => ({ rate, voices });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('choosing voices', () => {
  it('ranks the natural Korean voices first and ignores other languages', () => {
    const all = [voice('Microsoft David - English (United States)', 'en-US'), HEAMI, voice('Google 한국의', 'ko-KR', false), SUNHI, voice('Kyoko', 'ja-JP')];
    expect(koreanVoices(all).map((v) => v.name)).toEqual([SUNHI.name, 'Google 한국의', HEAMI.name]);
    expect(koreanVoices([voice('Yuna', 'ko_KR')])).toHaveLength(1);
  });

  it('gives each host a different voice when there are two', () => {
    expect(chooseVoices(2, [HEAMI, SUNHI, INJOON])).toEqual([
      { voice: SUNHI, pitch: 1 },
      { voice: INJOON, pitch: 1 },
    ]);
  });

  it('lowers the second host when both must share one voice', () => {
    expect(chooseVoices(2, [HEAMI])).toEqual([
      { voice: HEAMI, pitch: 1 },
      { voice: HEAMI, pitch: 0.8 },
    ]);
  });

  it('honours the listener\'s own choice while that voice exists', () => {
    expect(chooseVoices(2, [HEAMI, SUNHI, INJOON], [null, HEAMI.voiceURI]).map((c) => c.voice?.name)).toEqual([SUNHI.name, HEAMI.name]);
    expect(chooseVoices(2, [SUNHI, INJOON], ['a voice from another computer', null]).map((c) => c.voice?.name)).toEqual([SUNHI.name, INJOON.name]);
  });

  it('has no voice to offer without a Korean one', () => {
    expect(chooseVoices(2, [voice('Samantha', 'en-US')])).toEqual([
      { voice: null, pitch: 1 },
      { voice: null, pitch: 1 },
    ]);
  });
});

describe('SpeechNarrator', () => {
  it('speaks with the host\'s voice, rate and pitch, and without the unspoken marks', async () => {
    const { synth, create, queue } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings(chooseVoices(2, [HEAMI]), 1.1));
    expect(narrator.mode()).toBe('voice');
    const done = narrator.speak("『IGOR』는 2019년 앨범이다.", { voiceSlot: 1, signal: new AbortController().signal });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ text: 'IGOR는 2019년 앨범이다.', voice: HEAMI, lang: 'ko-KR', rate: 1.1, pitch: 0.8 });
    queue[0]!.onstart?.();
    queue[0]!.onend?.();
    await expect(done).resolves.toBeUndefined();
  });

  it('stops the utterance and rejects when aborted', async () => {
    const { synth, create, queue } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings());
    const controller = new AbortController();
    const done = narrator.speak('말하는 중.', { voiceSlot: 0, signal: controller.signal });
    queue[0]!.onstart?.();
    controller.abort();
    await expect(done).rejects.toSatisfy(isAbortError);
    expect(synth.cancel).toHaveBeenCalled();
    await expect(narrator.speak('이미 멈춤.', { voiceSlot: 0, signal: controller.signal })).rejects.toSatisfy(isAbortError);
  });

  it('shows the line for its time when the voice never starts, and gives up on speech after two', async () => {
    const { synth, create } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings());
    const changed = vi.fn();
    narrator.subscribe(changed);
    const text = '소리가 나지 않는 줄.';

    let finished = false;
    void narrator.speak(text, { voiceSlot: 0, signal: new AbortController().signal }).then(() => (finished = true));
    await vi.advanceTimersByTimeAsync(5000 + estimateSpeechMs(text) - 10);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(finished).toBe(true);
    expect(narrator.mode()).toBe('voice');
    expect(changed).not.toHaveBeenCalled();

    void narrator.speak(text, { voiceSlot: 0, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(5100);
    expect(narrator.mode()).toBe('captions');
    expect(changed).toHaveBeenCalledTimes(1);

    // From here on nothing is handed to the speech engine.
    synth.speak.mockClear();
    const third = narrator.speak(text, { voiceSlot: 0, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(estimateSpeechMs(text) + 10);
    await expect(third).resolves.toBeUndefined();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('moves on when the browser never reports the end of an utterance', async () => {
    const { synth, create, queue } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings());
    const text = '끝났다는 신호가 오지 않는 줄.';
    let finished = false;
    void narrator.speak(text, { voiceSlot: 0, signal: new AbortController().signal }).then(() => (finished = true));
    synth.speaking = true;
    queue[0]!.onstart?.();
    await vi.advanceTimersByTimeAsync(3000);
    expect(finished).toBe(false);
    // The engine has gone quiet without an `end`: two looks at it are enough.
    synth.speaking = false;
    await vi.advanceTimersByTimeAsync(700);
    expect(finished).toBe(true);
    expect(narrator.mode()).toBe('voice');
  });

  it('moves on even when the engine claims to be speaking for ever', async () => {
    const { synth, create, queue } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings());
    const text = '끝나지 않는 척하는 줄.';
    let finished = false;
    void narrator.speak(text, { voiceSlot: 0, signal: new AbortController().signal }).then(() => (finished = true));
    synth.speaking = true;
    queue[0]!.onstart?.();
    await vi.advanceTimersByTimeAsync(estimateSpeechMs(text) * 2 + 3900);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(finished).toBe(true);
  });

  it('never hands an utterance over right after a cancel, which Chrome would drop', async () => {
    const { synth, create, queue } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings());
    const first = new AbortController();
    const interrupted = narrator.speak('끊기는 줄.', { voiceSlot: 0, signal: first.signal });
    queue[0]!.onstart?.();
    first.abort();
    await expect(interrupted).rejects.toSatisfy(isAbortError);
    expect(synth.cancel).toHaveBeenCalledTimes(1);

    let finished = false;
    void narrator.speak('바로 이어지는 줄.', { voiceSlot: 0, signal: new AbortController().signal }).then(() => (finished = true));
    expect(queue).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(170);
    expect(queue).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(20);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ text: '바로 이어지는 줄.' });
    queue[0]!.onstart?.();
    queue[0]!.onend?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(true);
  });

  it('drops a line that is stopped while it waits out a cancel, without cancelling again', async () => {
    const { synth, create, queue } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings());
    const first = new AbortController();
    const interrupted = narrator.speak('끊기는 줄.', { voiceSlot: 0, signal: first.signal });
    first.abort();
    await expect(interrupted).rejects.toSatisfy(isAbortError);

    const second = new AbortController();
    const waiting = narrator.speak('기다리다 멈춘 줄.', { voiceSlot: 0, signal: second.signal });
    second.abort();
    await expect(waiting).rejects.toSatisfy(isAbortError);
    await vi.advanceTimersByTimeAsync(1000);
    expect(queue).toHaveLength(0);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('is captions-only without a Korean voice', async () => {
    const { synth, create } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings(chooseVoices(2, [])));
    expect(narrator.mode()).toBe('captions');
    const done = narrator.speak('보이기만 하는 줄.', { voiceSlot: 0, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(estimateSpeechMs('보이기만 하는 줄.') + 10);
    await expect(done).resolves.toBeUndefined();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('clears what was left speaking before it starts, and survives a broken speech engine', () => {
    const { synth, create, queue } = fakeSynth();
    const narrator = new SpeechNarrator(synth, create, settings());
    narrator.unlock();
    // Nothing was speaking: no cancel (the first line would be dropped after one) and nothing queued.
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.resume).toHaveBeenCalled();
    expect(queue).toHaveLength(0);
    synth.speaking = true;
    narrator.unlock();
    expect(synth.cancel).toHaveBeenCalledTimes(1);

    const broken = {
      get speaking(): boolean {
        throw new Error('no speech');
      },
      pending: false,
      speak: () => {
        throw new Error('no speech');
      },
      cancel: () => {
        throw new Error('no speech');
      },
      resume: () => {
        throw new Error('no speech');
      },
    };
    expect(() => new SpeechNarrator(broken, create, settings()).unlock()).not.toThrow();
  });
});

describe('CaptionNarrator', () => {
  it('holds each line for the time it would take to say, faster at a higher rate', async () => {
    const narrator = new CaptionNarrator(() => ({ rate: 1.25 }));
    expect(narrator.mode()).toBe('captions');
    const text = '화면에만 보이는 줄.';
    let finished = false;
    void narrator.speak(text, { voiceSlot: 0, signal: new AbortController().signal }).then(() => (finished = true));
    await vi.advanceTimersByTimeAsync(estimateSpeechMs(text, 1.25) - 10);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(finished).toBe(true);
    expect(estimateSpeechMs(text, 1.25)).toBeLessThan(estimateSpeechMs(text));
  });
});
