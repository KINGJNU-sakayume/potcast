import { useSyncExternalStore } from 'react';
import type { NarrationManifest } from './clip';
import { narrationLibrary } from './library';

/** The site's index of recorded lines, or null while it loads and on a site without recordings. */
export function useNarrationManifest(): NarrationManifest | null {
  return useSyncExternalStore(narrationLibrary.subscribe, narrationLibrary.getManifest, () => null);
}
