import type { TimedLyricLine } from '../../lyrics/types';
import {
  TranslationUnavailableError,
  type TranslationAvailability,
  type TranslationProvider,
} from '../TranslationProvider';

/**
 * On-device translation through the browser Translator API (shipped in
 * Chromium-based browsers). No key, no network request with lyric text.
 * Unsupported browsers report `unavailable` and the lyrics stay untranslated.
 */

type NativeAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface NativeTranslator {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?(): void;
}

interface NativeTranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<NativeAvailability>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<NativeTranslator>;
}

function nativeApi(): NativeTranslatorApi | null {
  const candidate = (globalThis as { Translator?: NativeTranslatorApi }).Translator;
  return candidate && typeof candidate.create === 'function' && typeof candidate.availability === 'function'
    ? candidate
    : null;
}

function baseLanguage(tag: string): string {
  return tag.split('-')[0]!.toLowerCase();
}

export class BrowserTranslationProvider implements TranslationProvider {
  readonly id = 'browser';
  readonly label = 'On-device translation';
  private readonly translators = new Map<string, Promise<NativeTranslator>>();

  static isSupported(): boolean {
    return nativeApi() !== null;
  }

  async availability(sourceLanguage: string | undefined, targetLanguage: string): Promise<TranslationAvailability> {
    const api = nativeApi();
    if (!api || !sourceLanguage) return 'unavailable';
    try {
      const result = await api.availability({
        sourceLanguage: baseLanguage(sourceLanguage),
        targetLanguage: baseLanguage(targetLanguage),
      });
      if (result === 'available') return 'available';
      return result === 'unavailable' ? 'unavailable' : 'needs-download';
    } catch {
      return 'unavailable';
    }
  }

  /** Creating a translator whose model must be downloaded requires a user gesture. */
  async prepare(sourceLanguage: string, targetLanguage: string): Promise<void> {
    await this.translatorFor(sourceLanguage, targetLanguage);
  }

  async translateLines(
    lines: TimedLyricLine[],
    sourceLanguage: string | undefined,
    targetLanguage: string,
  ): Promise<string[]> {
    if (!nativeApi()) throw new TranslationUnavailableError('This browser has no built-in translator.', 'unsupported');
    if (!sourceLanguage) throw new TranslationUnavailableError('The lyric language could not be determined.', 'unsupported');
    const availability = await this.availability(sourceLanguage, targetLanguage);
    if (availability === 'unavailable') {
      throw new TranslationUnavailableError('This language pair is not supported on this device.', 'unsupported');
    }
    let translator: NativeTranslator;
    try {
      translator = await this.translatorFor(sourceLanguage, targetLanguage);
    } catch {
      throw new TranslationUnavailableError('The translation model needs to be downloaded first.', 'needs-download');
    }
    const output: string[] = [];
    for (const line of lines) {
      output.push(line.text.trim() ? await translator.translate(line.text) : '');
    }
    return output;
  }

  private translatorFor(sourceLanguage: string, targetLanguage: string): Promise<NativeTranslator> {
    const api = nativeApi();
    if (!api) return Promise.reject(new Error('Translator API unavailable'));
    const key = `${baseLanguage(sourceLanguage)}>${baseLanguage(targetLanguage)}`;
    let translator = this.translators.get(key);
    if (!translator) {
      translator = api.create({
        sourceLanguage: baseLanguage(sourceLanguage),
        targetLanguage: baseLanguage(targetLanguage),
      });
      this.translators.set(key, translator);
      translator.catch(() => this.translators.delete(key));
    }
    return translator;
  }
}
