import type { CatalogueSource, SessionMode } from '../catalogue/CatalogueSource';
import { createSpotifyCatalogueSource } from '../catalogue/spotifySource';
import { paletteCache } from '../palette/paletteCache';
import { createLyricsProvider } from '../lyrics/createLyricsProvider';
import { MockLyricsProvider } from '../lyrics/providers/MockLyricsProvider';
import type { LyricsProvider } from '../lyrics/types';
import type { PlaybackEngine } from '../playback/engine';
import { PlayerStore } from '../playback/playerStore';
import { SpotifyPlaybackEngine } from '../playback/spotifyEngine';
import { isHandheldBrowser } from './useIsMobile';
import { PREVIEW_LYRICS, PREVIEW_PALETTES } from '../preview/previewData';
import { PreviewPlaybackEngine } from '../preview/previewEngine';
import { createPreviewCatalogueSource } from '../preview/previewSource';
import { SpotifyClient } from '../spotify/client';
import { createTranslationProvider } from '../translation/createTranslationProvider';
import { MockTranslationProvider } from '../translation/providers/MockTranslationProvider';
import type { TranslationProvider } from '../translation/TranslationProvider';
import type { AppServices } from './services';

/** Everything a signed-in (or preview) session needs; one instance per mode. */
export interface Session {
  mode: SessionMode;
  catalogue: CatalogueSource;
  store: PlayerStore;
  engine: PlaybackEngine;
  lyrics: LyricsProvider | null;
  translation: TranslationProvider | null;
  translationTarget: string;
}

export function createSpotifySession(services: AppServices): Session {
  const auth = services.auth;
  if (!auth) throw new Error('Spotify is not configured');
  const { config } = services;
  const client = new SpotifyClient(auth);
  const store = new PlayerStore();
  return {
    mode: 'spotify',
    catalogue: createSpotifyCatalogueSource(client),
    store,
    engine: new SpotifyPlaybackEngine({
      store,
      client,
      getAccessToken: () => auth.getAccessToken(),
      refreshAccessToken: () => auth.refreshAfterUnauthorized(),
      // Spotify's Web Playback SDK does not run in phone browsers: there ARC is a remote for the Spotify app.
      ...(isHandheldBrowser() ? { isPlaybackSupported: () => false } : {}),
    }),
    lyrics: createLyricsProvider(config.lyricsProvider),
    translation: createTranslationProvider(config.translationProvider, config.translationEndpoint),
    translationTarget: config.translationTarget,
  };
}

export function createPreviewSession(services: AppServices): Session {
  for (const [albumId, palette] of PREVIEW_PALETTES) paletteCache.register(albumId, palette);
  const store = new PlayerStore();
  return {
    mode: 'preview',
    catalogue: createPreviewCatalogueSource(),
    store,
    engine: new PreviewPlaybackEngine(store),
    lyrics: new MockLyricsProvider({ byTrackId: PREVIEW_LYRICS, generic: false }),
    translation: new MockTranslationProvider(),
    translationTarget: services.config.translationTarget,
  };
}

/* ── Engine lifecycle ──────────────────────────────────────────────────── */

const retained = new WeakMap<PlaybackEngine, { count: number; timer: ReturnType<typeof setTimeout> | null }>();

/**
 * Reference-counted start/stop with a short deferred stop, so React
 * StrictMode's mount → unmount → mount does not tear down and recreate the
 * Web Playback SDK device.
 */
export function retainEngine(engine: PlaybackEngine): () => void {
  const entry = retained.get(engine) ?? { count: 0, timer: null };
  retained.set(engine, entry);
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.count += 1;
  engine.start();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.count -= 1;
    if (entry.count > 0) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (entry.count === 0) engine.stop();
    }, 300);
  };
}

/* ── Preview flag ──────────────────────────────────────────────────────── */

const PREVIEW_KEY = 'arc.preview.v1';

export function isPreviewRequested(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).has('preview') || window.sessionStorage.getItem(PREVIEW_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function setPreviewRequested(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(PREVIEW_KEY, '1');
    else window.sessionStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* storage unavailable: preview lasts for this page view */
  }
}
