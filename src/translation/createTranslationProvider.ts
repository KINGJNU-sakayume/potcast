import type { TranslationProviderId } from '../app/config';
import { BrowserTranslationProvider } from './providers/BrowserTranslationProvider';
import { HttpTranslationProvider } from './providers/HttpTranslationProvider';
import { MockTranslationProvider } from './providers/MockTranslationProvider';
import type { TranslationProvider } from './TranslationProvider';

/** Selects the translation provider for a Spotify session. Swap providers here. */
export function createTranslationProvider(id: TranslationProviderId, endpoint: string | null): TranslationProvider | null {
  switch (id) {
    case 'browser':
      return new BrowserTranslationProvider();
    case 'http':
      return endpoint ? new HttpTranslationProvider(endpoint) : null;
    case 'mock':
      return new MockTranslationProvider();
    case 'none':
      return null;
  }
}
