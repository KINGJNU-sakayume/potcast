export type LyricsProviderId = 'lrclib' | 'mock' | 'none';
export type TranslationProviderId = 'browser' | 'http' | 'mock' | 'none';

export interface AppConfig {
  /** Null when the app has not been configured with a Spotify client ID. */
  spotifyClientId: string | null;
  /** Where Spotify returns after authorization: the app root (routes live in the URL hash). */
  redirectUri: string;
  /** Normalised base path, always starting and ending with `/`. */
  basePath: string;
  lyricsProvider: LyricsProviderId;
  translationProvider: TranslationProviderId;
  translationEndpoint: string | null;
  translationTarget: string;
  previewEnabled: boolean;
}

export interface RawEnv {
  VITE_SPOTIFY_CLIENT_ID?: string;
  VITE_SPOTIFY_REDIRECT_URI?: string;
  VITE_LYRICS_PROVIDER?: string;
  VITE_TRANSLATION_PROVIDER?: string;
  VITE_TRANSLATION_ENDPOINT?: string;
  VITE_TRANSLATION_TARGET?: string;
  VITE_ENABLE_PREVIEW?: string;
  BASE_URL?: string;
}

const LYRICS_PROVIDERS: readonly LyricsProviderId[] = ['lrclib', 'mock', 'none'];
const TRANSLATION_PROVIDERS: readonly TranslationProviderId[] = ['browser', 'http', 'mock', 'none'];

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const normalised = clean(value)?.toLowerCase();
  return (allowed as readonly string[]).includes(normalised ?? '') ? (normalised as T) : fallback;
}

export function normaliseBasePath(raw: string | undefined): string {
  const value = (raw ?? '/').trim();
  if (value === '' || value === '/' || value === './') return '/';
  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}

/** Pure: derives runtime configuration from Vite env values and the page origin. */
export function readConfig(env: RawEnv, origin: string): AppConfig {
  const basePath = normaliseBasePath(env.BASE_URL);
  const translationProvider = pick(env.VITE_TRANSLATION_PROVIDER, TRANSLATION_PROVIDERS, 'browser');
  const translationEndpoint = clean(env.VITE_TRANSLATION_ENDPOINT);

  return {
    spotifyClientId: clean(env.VITE_SPOTIFY_CLIENT_ID),
    redirectUri: clean(env.VITE_SPOTIFY_REDIRECT_URI) ?? `${origin}${basePath}`,
    basePath,
    lyricsProvider: pick(env.VITE_LYRICS_PROVIDER, LYRICS_PROVIDERS, 'lrclib'),
    // An `http` provider without an endpoint cannot work; degrade to none.
    translationProvider: translationProvider === 'http' && !translationEndpoint ? 'none' : translationProvider,
    translationEndpoint,
    translationTarget: clean(env.VITE_TRANSLATION_TARGET) ?? 'ko',
    previewEnabled: clean(env.VITE_ENABLE_PREVIEW)?.toLowerCase() !== 'false',
  };
}
