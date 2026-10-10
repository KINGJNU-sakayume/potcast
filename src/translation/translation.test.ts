import { describe, expect, it, vi } from 'vitest';
import { BoundedCache } from '../lib/boundedCache';
import type { TimedLyrics } from '../lyrics/types';
import { detectLineLanguage, detectLineLanguages, detectLyricsLanguage, sameLanguage } from './languageDetect';
import { HttpTranslationProvider } from './providers/HttpTranslationProvider';
import { MockTranslationProvider } from './providers/MockTranslationProvider';
import { translateLyrics } from './translateLyrics';
import { TranslationUnavailableError, type TranslationProvider } from './TranslationProvider';

const lyrics = (texts: string[], language?: string): TimedLyrics => ({
  language,
  lines: texts.map((text, i) => ({ startMs: i * 1000, text })),
});

const freshCache = () => new BoundedCache<string[]>({ prefix: `test.tr.${Math.random()}:`, maxEntries: 20 });

describe('language detection', () => {
  it('detects Japanese, Korean, Chinese and Latin-script lines', () => {
    expect(detectLineLanguage('窓の外で街が静かに光る')).toBe('ja');
    expect(detectLineLanguage('우리는 같은 박자로 걷는다')).toBe('ko');
    expect(detectLineLanguage('你好世界')).toBe('zh');
    expect(detectLineLanguage('Hold the line')).toBe('en');
    expect(detectLineLanguage('♪ ♪')).toBeUndefined();
  });

  it('treats kanji-only lines inside a Japanese song as Japanese', () => {
    const lines = ['窓の外で街が光る', '言葉', '夜が来た'];
    expect(detectLyricsLanguage(lines)).toBe('ja');
    expect(detectLineLanguages(lines)).toEqual(['ja', 'ja', 'ja']);
  });

  it('compares BCP 47 tags by base language', () => {
    expect(sameLanguage('ko', 'ko-KR')).toBe(true);
    expect(sameLanguage('ja', 'ko')).toBe(false);
  });
});

describe('translateLyrics', () => {
  it('skips lyrics already in the target language', async () => {
    const provider = new MockTranslationProvider();
    const result = await translateLyrics(provider, 't', lyrics(['우리는 같은 박자로 걷는다']), 'ko', freshCache());
    expect(result).toEqual({ status: 'not-needed' });
  });

  it('translates only the lines that need it (mixed Korean / English)', async () => {
    const provider = new MockTranslationProvider();
    const result = await translateLyrics(
      provider,
      't',
      lyrics(['우리는 같은 박자로 걷는다', 'Twenty-four lights in a row']),
      'ko',
      freshCache(),
    );
    expect(result).toEqual({ status: 'ready', lines: ['', '한 줄로 늘어선 스물네 개의 불빛'] });
  });

  it('caches by track, language pair and lyric text', async () => {
    const translateLines = vi.fn(async (lines: { text: string }[]) => lines.map((l) => `[${l.text}]`));
    const provider: TranslationProvider = { id: 'fake', label: 'Fake', translateLines };
    const cache = freshCache();
    await translateLyrics(provider, 'track-a', lyrics(['Hello there']), 'ko', cache);
    await translateLyrics(provider, 'track-a', lyrics(['Hello there']), 'ko', cache);
    expect(translateLines).toHaveBeenCalledTimes(1);
    await translateLyrics(provider, 'track-a', lyrics(['A different version']), 'ko', cache);
    expect(translateLines).toHaveBeenCalledTimes(2);
  });

  it('reports models that need a download, and failures, without throwing', async () => {
    const needsDownload: TranslationProvider = {
      id: 'dl',
      label: 'DL',
      availability: async () => 'needs-download',
      translateLines: vi.fn(),
    };
    await expect(translateLyrics(needsDownload, 't', lyrics(['Hello']), 'ko', freshCache())).resolves.toEqual({
      status: 'needs-download',
      sourceLanguage: 'en',
    });

    const failing: TranslationProvider = {
      id: 'fail',
      label: 'Fail',
      translateLines: async () => {
        throw new TranslationUnavailableError('service down');
      },
    };
    await expect(translateLyrics(failing, 't', lyrics(['Hello']), 'ko', freshCache())).resolves.toEqual({
      status: 'unavailable',
      message: 'service down',
    });
  });
});

describe('HttpTranslationProvider', () => {
  it('posts lines to the configured endpoint and validates the response', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ translations: ['하나', '둘'] }), { status: 200 }));
    const provider = new HttpTranslationProvider('https://example.test/translate', fetchMock);
    const result = await provider.translateLines(
      [
        { startMs: 0, text: 'one' },
        { startMs: 1, text: 'two' },
      ],
      'en',
      'ko',
    );
    expect(result).toEqual(['하나', '둘']);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      lines: ['one', 'two'],
      sourceLanguage: 'en',
      targetLanguage: 'ko',
    });
  });

  it('rejects mismatched responses', async () => {
    const provider = new HttpTranslationProvider(
      'https://example.test/translate',
      vi.fn(async () => new Response(JSON.stringify({ translations: ['only one'] }), { status: 200 })),
    );
    await expect(provider.translateLines([{ startMs: 0, text: 'a' }, { startMs: 1, text: 'b' }], 'en', 'ko')).rejects.toBeInstanceOf(
      TranslationUnavailableError,
    );
  });
});
