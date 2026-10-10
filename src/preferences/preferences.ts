import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../lib/storage';

export interface Preferences {
  translationEnabled: boolean;
  /** Episodes: under a talk-over the music is turned down (`duck`) or stopped (`pause`). */
  episodeTalkOver: 'duck' | 'pause';
  /** How loud the music stays under a talk-over, as a fraction of the listener's volume. */
  episodeDuckLevel: number;
  /** The hosts' pace; 1 is the voice's own. */
  episodeRate: number;
  /** The voice (voiceURI) chosen for each host; null lets ARC pick. */
  episodeVoices: Array<string | null>;
}

const KEY = 'arc.preferences.v1';
export const DEFAULT_PREFERENCES: Preferences = {
  translationEnabled: true,
  episodeTalkOver: 'duck',
  episodeDuckLevel: 0.2,
  episodeRate: 1,
  episodeVoices: [null, null],
};
const DEFAULTS = DEFAULT_PREFERENCES;

let current: Preferences = { ...DEFAULTS, ...(readJson<Partial<Preferences>>(KEY) ?? {}) };
const listeners = new Set<() => void>();

export const preferencesStore = {
  get: (): Preferences => current,
  set(patch: Partial<Preferences>): void {
    current = { ...current, ...patch };
    writeJson(KEY, current);
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const preferences = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.get);
  return [preferences, preferencesStore.set];
}
