import type { TimedLyricLine } from '../lyrics/types';

export type TranslationAvailability = 'available' | 'needs-download' | 'unavailable';

/**
 * Replaceable lyric translation source. Implementations must return one
 * string per input line (empty string = no translation for that line).
 */
export interface TranslationProvider {
  readonly id: string;
  readonly label: string;
  translateLines(lines: TimedLyricLine[], sourceLanguage: string | undefined, targetLanguage: string): Promise<string[]>;
  /** Optional capability probe, e.g. an on-device model that must be downloaded first. */
  availability?(sourceLanguage: string | undefined, targetLanguage: string): Promise<TranslationAvailability>;
  /** Optional one-time preparation that needs a user gesture (e.g. model download). */
  prepare?(sourceLanguage: string, targetLanguage: string): Promise<void>;
}

export class TranslationUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'unsupported' | 'needs-download' | 'failed' = 'failed',
  ) {
    super(message);
    this.name = 'TranslationUnavailableError';
  }
}
