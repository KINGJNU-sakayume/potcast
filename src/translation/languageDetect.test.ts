import { describe, expect, it } from 'vitest';
import { expectedLyricsLanguage, lyricsMatchLanguage } from './languageDetect';


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
