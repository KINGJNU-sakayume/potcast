import { describe, expect, it } from 'vitest';
import { applySay, clipKey, clipPath, clipText, fnv1a64, isNarrationManifest, isRecordedVoice, NARRATION_ENGINE } from './clip';

const SAY = [
  { from: 'GONE', to: '곤' },
  { from: 'GONE, GONE', to: '곤 곤' },
  { from: 'Run', to: '런' },
  { from: 'EARFQUAKE', to: '어스퀘이크' },
  { from: '2019년', to: '이천십구 년' },
  { from: '핫 100', to: '핫 백' },
];

describe('readings', () => {
  it('replaces what is written with how it is said', () => {
    expect(applySay("두 번째 곡 'EARFQUAKE'는 2019년 싱글이에요.", SAY)).toBe("두 번째 곡 '어스퀘이크'는 이천십구 년 싱글이에요.");
    expect(applySay('빌보드 핫 100에서', SAY)).toBe('빌보드 핫 백에서');
  });

  it('prefers the longest reading and never replaces a replacement', () => {
    expect(applySay("'GONE, GONE'이에요. GONE.", SAY)).toBe("'곤 곤'이에요. 곤.");
    expect(applySay('런', [{ from: '런', to: 'Run' }, ...SAY])).toBe('Run');
  });

  it('matches an English word or a number only as a whole', () => {
    expect(applySay('Running은 Run이 아니에요.', SAY)).toBe('Running은 런이 아니에요.');
    expect(applySay('12019년', SAY)).toBe('12019년');
    expect(applySay('EARFQUAKES', SAY)).toBe('EARFQUAKES');
  });

  it('leaves the text alone when there are no readings', () => {
    expect(applySay('그대로.', [])).toBe('그대로.');
  });

  it('takes characters that mean something in a pattern literally', () => {
    expect(applySay('Run-D.M.C.의 곡 (A+B)?', [{ from: 'Run-D.M.C.', to: '런 디엠씨' }, { from: '(A+B)?', to: '에이 비' }])).toBe('런 디엠씨의 곡 에이 비');
  });
});

describe('what a recorded voice is given', () => {
  it('has the readings applied and the title marks removed, and keeps the sounds a host makes', () => {
    expect(clipText("『IGOR』의 'EARFQUAKE'는 좀 심했죠. <laugh>", [{ from: 'IGOR', to: '이고르' }, ...SAY])).toBe('이고르의 어스퀘이크는 좀 심했죠. <laugh>');
  });
});

describe('clip names', () => {
  it('hashes the same everywhere', () => {
    // FNV-1a's 64-bit offset basis, and its published test vector for the bytes 61 00 ("a" as one UTF-16 unit).
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('089be207b544f1e4');
    expect(fnv1a64('가')).not.toBe(fnv1a64('나'));
  });

  it('depends on the engine, the voice and the text', () => {
    const key = clipKey('F4', '안녕하세요.');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(clipKey('F4', '안녕하세요.')).toBe(key);
    expect(clipKey('M5', '안녕하세요.')).not.toBe(key);
    expect(clipKey('F4', '안녕하세요!')).not.toBe(key);
    expect(key).toBe(fnv1a64(`${NARRATION_ENGINE.id}\nF4\n안녕하세요.`));
  });

  it('spreads clips over folders by the start of their name', () => {
    expect(clipPath('ab12cd34ef567890')).toBe('clips/ab/ab12cd34ef567890.mp3');
  });
});

describe('the site index', () => {
  it('is recognised by its shape', () => {
    expect(isNarrationManifest({ version: 1, engine: { id: 'x', name: 'X' }, clips: {}, samples: {} })).toBe(true);
    expect(isNarrationManifest({ version: 2, engine: { id: 'x', name: 'X' }, clips: {} })).toBe(false);
    expect(isNarrationManifest('<!doctype html>')).toBe(false);
    expect(isNarrationManifest(null)).toBe(false);
  });

  it('knows the preset voices', () => {
    expect(isRecordedVoice('F4')).toBe(true);
    expect(isRecordedVoice('F6')).toBe(false);
  });
});
