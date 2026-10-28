/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
  readonly VITE_SPOTIFY_REDIRECT_URI?: string;
  readonly VITE_LYRICS_PROVIDER?: string;
  readonly VITE_TRANSLATION_PROVIDER?: string;
  readonly VITE_TRANSLATION_ENDPOINT?: string;
  readonly VITE_TRANSLATION_TARGET?: string;
  readonly VITE_ENABLE_PREVIEW?: string;
  /** Set on the branch preview build (deploy-preview.yml): the branch it was built from. */
  readonly VITE_PREVIEW_LABEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
