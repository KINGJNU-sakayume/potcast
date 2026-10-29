import { describe, expect, it } from 'vitest';
import { expectedLyricsLanguage, lyricsMatchLanguage, mayBeRomanised, originalScriptShare } from './languageDetect';

describe('originalScriptShare / mayBeRomanised', () => {
  const romanised = ['neon naege manheun geol jul su isseo', 'nae mami neoreul hyanghae georeoga', 'saranghae oneuldo naeil'];
  const hangul = ['네온 내게 많은 걸 줄 수 있어', '내 마음이 너를 향해 걸어가', '사랑해 오늘도 내일'];
  const english = ["I just can't stop thinking about you", 'and the way that you move with me', 'you know I love you baby'];

  it('measures how much of the lyrics is in Korean / Japanese script', () => {
    expect(originalScriptShare(romanised)).toBe(0);
    expect(originalScriptShare(hangul)).toBe(1);
    expect(originalScriptShare(['どこへ行こう', 'hello world', 'さよなら', 'goodbye'])).toBe(0.5);
    expect(originalScriptShare(['どこへ行こう', '안녕', 'さよなら'], 'ja')).toBeCloseTo(2 / 3);
    expect(originalScriptShare([])).toBe(0);
  });

  it('flags only Latin-script lyrics that do not read as English as possibly romanised', () => {
    expect(mayBeRomanised(romanised)).toBe(true);
    expect(mayBeRomanised(english)).toBe(false);
    expect(mayBeRomanised(hangul)).toBe(false);
    // Too little text to judge.
    expect(mayBeRomanised(['neon naege manheun'])).toBe(false);
  });
});


describe('expectedLyricsLanguage / lyricsMatchLanguage', () => {
  const base = { title: 'Song', artists: [{ name: 'Artist' }], album: { name: 'Album' } };

  it('reads the expected language from kana / Hangul metadata, then the ISRC country', () => {
    expect(expectedLyricsLanguage({ ...base, title: 'ひまわり' })).toBe('ja');
    expect(expectedLyricsLanguage({ ...base, artists: [{ name: '엔믹스' }] })).toBe('ko');
    expect(expectedLyricsLanguage({ ...base, isrc: 'KRX012345678' })).toBe('ko');
    expect(expectedLyricsLanguage({ ...base, isrc: 'JPX012345678' })).toBe('ja');
    expect(expectedLyricsLanguage({ ...base, isrc: 'GBX012345678' })).toBeUndefined();
    expect(expectedLyricsLanguage(base)).toBeUndefined();
  });

  it('rejects lyrics with no line in the expected language but accepts English hooks inside real lyrics', () => {
    expect(lyricsMatchLanguage(['romanised one', 'romanised two'], 'ko')).toBe(false);
    expect(lyricsMatchLanguage(['english hook', '안녕하세요', 'english hook two'], 'ko')).toBe(true);
    expect(lyricsMatchLanguage(['anything'], undefined)).toBe(true);
  });
});
