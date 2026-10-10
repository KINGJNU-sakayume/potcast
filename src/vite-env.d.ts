/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
  readonly VITE_SPOTIFY_REDIRECT_URI?: string;
  readonly VITE_LYRICS_PROVIDER?: string;
  readonly VITE_TRANSLATION_PROVIDER?: string;
  readonly VITE_TRANSLATION_ENDPOINT?: string;
  readonly VITE_TRANSLATION_TARGET?: string;
  readonly VITE_ENABLE_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
