import { TEST_TRANSLATIONS_KO } from '../../lyrics/providers/testLines';
import type { TimedLyricLine } from '../../lyrics/types';
import { TranslationUnavailableError, type TranslationProvider } from '../TranslationProvider';

/** Development provider: translates the built-in test lines into Korean from a dictionary. */
export class MockTranslationProvider implements TranslationProvider {
  readonly id = 'mock';
  readonly label = 'Test translation';

  constructor(private readonly dictionary: Readonly<Record<string, string>> = TEST_TRANSLATIONS_KO) {}

  async translateLines(lines: TimedLyricLine[], _source: string | undefined, targetLanguage: string): Promise<string[]> {
    if (!targetLanguage.toLowerCase().startsWith('ko')) {
      throw new TranslationUnavailableError('Test translations are only available in Korean.', 'unsupported');
    }
    return lines.map((line) => this.dictionary[line.text] ?? '');
  }
}
