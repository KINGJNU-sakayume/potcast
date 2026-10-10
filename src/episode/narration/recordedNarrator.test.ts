import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAbortError, type Narrator, type SpeakOptions } from '../narrator';
import { clipKey } from './clip';
import { NarrationLibrary } from './library';
import { RecordedNarrator, type ClipPlayer } from './recordedNarrator';

const HELLO = clipKey('F4', '안녕하세요.');
const TITLE = clipKey('M5', '이고르를 들어요.');

/** An audio element that starts and ends clips only when the test says so. */
class FakePlayer implements ClipPlayer {
  src = '';
  currentTime = 0;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  muted = false;
  preload: ClipPlayer['preload'] = '';
  paused = true;
  /** Every source that was played, in order. */
  readonly played: string[] = [];
  /** Set to make the next play() fail, as a browser that blocks autoplay does. */
  refuse = false;
  /** Set to leave play() pending, as a browser that never starts does. */
  hang = false;
  private readonly listeners = new Map<string, Set<() => void>>();

  play = vi.fn((): Promise<void> => {
    if (this.hang) return new Promise(() => undefined);
    if (this.refuse) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    this.paused = false;
    this.played.push(this.src);
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  addEventListener = ((type: string, listener: () => void) => {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }) as ClipPlayer['addEventListener'];
  removeEventListener = ((type: string, listener: () => void) => {
    this.listeners.get(type)?.delete(listener);
  }) as ClipPlayer['removeEventListener'];

  emit(type: 'ended' | 'error'): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
  listening(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

/** The narrator behind the recordings: logs what it is asked to say and takes a second over each line. */
class Fallback implements Narrator {
  readonly spoken: string[] = [];
  unlocks = 0;
  mode() {
    return 'voice' as const;
  }
  subscribe() {
    return () => undefined;
  }
  unlock() {
    this.unlocks += 1;
  }
  speak(text: string, { signal }: SpeakOptions): Promise<void> {
    this.spoken.push(text);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('stopped', 'AbortError'));
      });
    });
  }
}

async function stage(options: { manifest?: boolean; clips?: Record<string, number>; rate?: number; fetchClip?: () => Promise<Response> } = {}) {
  const clips = options.clips ?? { [HELLO]: 2000, [TITLE]: 3000 };
  const library = new NarrationLibrary('/n/', {
    fetch: async (url) => {
      if (url.endsWith('index.json')) {
        return options.manifest === false ? new Response('', { status: 404 }) : new Response(JSON.stringify({ version: 1, engine: { id: 'e', name: 'E' }, clips, samples: {} }));
      }
      return options.fetchClip ? options.fetchClip() : new Response(new Uint8Array([1]));
    },
    createObjectURL: () => 'blob:clip',
    revokeObjectURL: () => undefined,
  });
  await library.load();
  const player = new FakePlayer();
  const fallback = new Fallback();
  const settings = { rate: options.rate ?? 1 };
  const narrator = new RecordedNarrator(library, fallback, () => settings, () => player);
  return { narrator, player, fallback, library, settings };
}

const hello = (signal: AbortSignal, extra: Partial<SpeakOptions> = {}): SpeakOptions => ({ voiceSlot: 0, voice: 'F4', signal, ...extra });
const tick = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a recorded line', () => {
  it('is played from its clip and is over when the clip ends', async () => {
    const { narrator, player, fallback } = await stage();
    const done = vi.fn();
    void narrator.speak('안녕하세요.', hello(new AbortController().signal)).then(done);
    await tick();
    expect(player.played).toEqual(['blob:clip']);
    expect(player.muted).toBe(false);
    expect(done).not.toHaveBeenCalled();
    player.emit('ended');
    await tick();
    expect(done).toHaveBeenCalled();
    expect(fallback.spoken).toEqual([]);
    expect(player.listening()).toBe(0);
  });

  it('finds its clip through the episode\'s readings', async () => {
    const { narrator, player, fallback } = await stage();
    void narrator.speak('『IGOR』를 들어요.', { voiceSlot: 1, voice: 'M5', say: [{ from: 'IGOR', to: '이고르' }], signal: new AbortController().signal });
    await tick();
    expect(player.played).toHaveLength(1);
    expect(fallback.spoken).toEqual([]);
  });

  it('is played at the listener\'s pace', async () => {
    const { narrator, player } = await stage({ rate: 1.25 });
    void narrator.speak('안녕하세요.', hello(new AbortController().signal));
    await tick();
    expect(player.playbackRate).toBe(1.25);
    expect(player.defaultPlaybackRate).toBe(1.25);
    expect(narrator.durationMs({ text: '안녕하세요.', voiceSlot: 0, voice: 'F4' })).toBe(1600);
    expect(narrator.durationMs({ text: '없는 줄.', voiceSlot: 0, voice: 'F4' })).toBeUndefined();
  });

  it('moves on by itself when the end is never reported', async () => {
    const { narrator } = await stage();
    const done = vi.fn();
    void narrator.speak('안녕하세요.', hello(new AbortController().signal)).then(done);
    await vi.advanceTimersByTimeAsync(5900);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toHaveBeenCalled();
  });

  it('stops when the episode moves on', async () => {
    const { narrator, player } = await stage();
    const controller = new AbortController();
    const result = narrator.speak('안녕하세요.', hello(controller.signal));
    const caught = result.catch((error: unknown) => error);
    await tick();
    controller.abort();
    expect(isAbortError(await caught)).toBe(true);
    expect(player.paused).toBe(true);
    expect(player.listening()).toBe(0);
  });

  it('carries on where a pause stopped it, a moment earlier', async () => {
    const { narrator, player } = await stage();
    const first = new AbortController();
    const stopped = narrator.speak('안녕하세요.', hello(first.signal)).catch(() => undefined);
    await tick();
    player.currentTime = 1.2;
    first.abort();
    await stopped;

    void narrator.speak('안녕하세요.', hello(new AbortController().signal, { resume: true }));
    await tick();
    expect(player.currentTime).toBeCloseTo(0.95);
    expect(player.played).toHaveLength(2);
  });

  it('starts over when it is asked for afresh, or when another line was stopped', async () => {
    const { narrator, player } = await stage();
    const first = new AbortController();
    const stopped = narrator.speak('안녕하세요.', hello(first.signal)).catch(() => undefined);
    await tick();
    player.currentTime = 1.2;
    first.abort();
    await stopped;
    player.currentTime = 0;

    // A jump back to the line: from the top.
    const second = new AbortController();
    const again = narrator.speak('안녕하세요.', hello(second.signal)).catch(() => undefined);
    await tick();
    expect(player.currentTime).toBe(0);
    player.currentTime = 0.7;
    second.abort();
    await again;
    player.currentTime = 0;

    // Resuming a different line than the one that was stopped: from the top as well.
    void narrator.speak('이고르를 들어요.', { voiceSlot: 1, voice: 'M5', resume: true, signal: new AbortController().signal });
    await tick();
    expect(player.currentTime).toBe(0);
  });
});

describe('a line without a usable recording', () => {
  it('is said by the fallback when the site has no clip for it', async () => {
    const { narrator, player, fallback } = await stage();
    const done = vi.fn();
    void narrator.speak('녹음이 없는 줄입니다.', hello(new AbortController().signal)).then(done);
    await tick();
    expect(fallback.spoken).toEqual(['녹음이 없는 줄입니다.']);
    expect(player.played).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalled();
  });

  it('is said by the fallback when the host has no recorded voice', async () => {
    const { narrator, fallback } = await stage();
    void narrator.speak('안녕하세요.', { voiceSlot: 0, signal: new AbortController().signal });
    await tick();
    expect(fallback.spoken).toEqual(['안녕하세요.']);
  });

  it('is said by the fallback when its clip cannot be fetched', async () => {
    const { narrator, player, fallback } = await stage({ fetchClip: async () => new Response('', { status: 500 }) });
    void narrator.speak('안녕하세요.', hello(new AbortController().signal));
    await tick();
    expect(player.played).toEqual([]);
    expect(fallback.spoken).toEqual(['안녕하세요.']);
  });

  it('is said by the fallback when its clip does not arrive in time', async () => {
    const { narrator, fallback } = await stage({ fetchClip: () => new Promise(() => undefined) });
    void narrator.speak('안녕하세요.', hello(new AbortController().signal));
    await vi.advanceTimersByTimeAsync(5900);
    expect(fallback.spoken).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(fallback.spoken).toEqual(['안녕하세요.']);
  });

  it('is said by the fallback when the browser refuses to play, and recordings are given up after a few', async () => {
    const { narrator, player, fallback } = await stage();
    const changed = vi.fn();
    narrator.subscribe(changed);
    player.refuse = true;
    expect(narrator.mode()).toBe('recorded');
    for (let i = 0; i < 3; i += 1) {
      const said = narrator.speak('안녕하세요.', hello(new AbortController().signal));
      await vi.advanceTimersByTimeAsync(1000);
      await said;
    }
    expect(fallback.spoken).toHaveLength(3);
    expect(narrator.mode()).toBe('voice');
    expect(changed).toHaveBeenCalledTimes(1);

    // From here on the player is left alone.
    player.refuse = false;
    void narrator.speak('안녕하세요.', hello(new AbortController().signal));
    await tick();
    expect(player.played).toEqual([]);
    expect(fallback.spoken).toHaveLength(4);
  });

  it('is said by the fallback when the player never starts', async () => {
    const { narrator, player, fallback } = await stage();
    player.hang = true;
    void narrator.speak('안녕하세요.', hello(new AbortController().signal));
    await vi.advanceTimersByTimeAsync(3900);
    expect(fallback.spoken).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(fallback.spoken).toEqual(['안녕하세요.']);
    expect(player.paused).toBe(true);
  });

  it('counts as said when the clip breaks off after it has started', async () => {
    const { narrator, player, fallback } = await stage();
    const done = vi.fn();
    void narrator.speak('안녕하세요.', hello(new AbortController().signal)).then(done);
    await tick();
    player.emit('error');
    await tick();
    expect(done).toHaveBeenCalled();
    expect(fallback.spoken).toEqual([]);
  });
});

describe('a site without recordings', () => {
  it('leaves everything to the fallback and never touches an audio element', async () => {
    const { narrator, player, fallback } = await stage({ manifest: false });
    expect(narrator.mode()).toBe('voice');
    narrator.unlock();
    expect(fallback.unlocks).toBe(1);
    expect(player.play).not.toHaveBeenCalled();
    void narrator.speak('안녕하세요.', hello(new AbortController().signal));
    await tick();
    expect(fallback.spoken).toEqual(['안녕하세요.']);
  });
});

describe('unlocking', () => {
  it('plays a moment of silence inside the click, muted, and leaves the player ready', async () => {
    const { narrator, player, fallback } = await stage();
    narrator.unlock();
    expect(fallback.unlocks).toBe(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.src.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(player.muted).toBe(true);
    await tick();
    expect(player.muted).toBe(false);
    expect(player.paused).toBe(true);
  });

  it('does not cut into a clip that started in the meantime', async () => {
    const { narrator, player } = await stage();
    narrator.unlock();
    void narrator.speak('안녕하세요.', hello(new AbortController().signal));
    await tick();
    expect(player.src).toBe('blob:clip');
    expect(player.paused).toBe(false);
    expect(player.muted).toBe(false);
  });
});

describe('preparing', () => {
  it('fetches the clips of what is about to be said', async () => {
    const { narrator, library } = await stage();
    const prepare = vi.spyOn(library, 'prepare');
    narrator.prepare([
      { text: '안녕하세요.', voiceSlot: 0, voice: 'F4' },
      { text: '목소리 없는 진행자.', voiceSlot: 1 },
    ]);
    expect(prepare).toHaveBeenCalledWith([HELLO]);
  });
});
