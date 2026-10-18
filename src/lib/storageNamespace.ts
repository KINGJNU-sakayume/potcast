/**
 * Storage namespace for this app.
 *
 * Every app published under kingjnu-sakayume.github.io shares one origin, so they
 * share one localStorage. player1, player2 and potcast all used the `arc.` prefix
 * and overwrote each other's Spotify session and settings. This app now keeps
 * everything under `potcast.`.
 *
 * On first load, settings found under the old `arc.` keys are carried over when the
 * new key is still empty. Shared settings are copied (not removed) because
 * player1, player2 may still read them; keys only this app ever wrote are moved.
 * The Spotify session is not carried over: it cannot be told which app's Client ID
 * issued it, so a single new sign-in is needed.
 */

export const STORAGE_PREFIX = 'potcast.';

export function storageKey(name: string): string {
  return STORAGE_PREFIX + name;
}

const LEGACY_PREFIX = 'arc.';
const COPIED_FROM_LEGACY = [
  'preferences.v1',
  'player.volume.v1',
  'player.browser-playback.v1',
  'player.remote-device.v1',
] as const;
const MOVED_FROM_LEGACY = [
  'episode.bookmarks.v1',
] as const;

export function adoptLegacyStorage(storage: Storage | null = safeLocalStorage()): void {
  if (!storage) return;
  try {
    for (const name of [...COPIED_FROM_LEGACY, ...MOVED_FROM_LEGACY]) {
      const legacy = storage.getItem(LEGACY_PREFIX + name);
      if (legacy === null) continue;
      if (storage.getItem(storageKey(name)) === null) storage.setItem(storageKey(name), legacy);
      if ((MOVED_FROM_LEGACY as readonly string[]).includes(name)) storage.removeItem(LEGACY_PREFIX + name);
    }
  } catch {
    /* storage unavailable or full: start with defaults */
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Runs when the first module that builds a key is imported, i.e. before any of
// them reads its initial value (preferences are read at import time).
adoptLegacyStorage();
