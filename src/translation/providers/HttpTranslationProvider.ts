import type { TimedLyricLine } from '../../lyrics/types';
import { TranslationUnavailableError, type TranslationProvider } from '../TranslationProvider';

/**
 * Posts lyric lines to your own serverless function, which holds any
 * DeepL / Papago / Google credentials server-side.
 *
 * Request:  POST {endpoint}  { "lines": string[], "sourceLanguage": string | null, "targetLanguage": string }
 * Response: 200 { "translations": string[] }  — same length and order as `lines`
 */
export class HttpTranslationProvider implements TranslationProvider {
  readonly id = 'http';
  readonly label = 'Translation service';

  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  async translateLines(
    lines: TimedLyricLine[],
    sourceLanguage: string | undefined,
    targetLanguage: string,
  ): Promise<string[]> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((line) => line.text),
          sourceLanguage: sourceLanguage ?? null,
          targetLanguage,
        }),
      });
    } catch {
      throw new TranslationUnavailableError('The translation service is unreachable.');
    }
    if (!response.ok) throw new TranslationUnavailableError(`The translation service responded ${response.status}.`);
    const body = (await response.json().catch(() => null)) as { translations?: unknown } | null;
    if (!body || !Array.isArray(body.translations) || body.translations.length !== lines.length) {
      throw new TranslationUnavailableError('The translation service returned an unexpected response.');
    }
    return body.translations.map((value) => (typeof value === 'string' ? value : ''));
  }
}
