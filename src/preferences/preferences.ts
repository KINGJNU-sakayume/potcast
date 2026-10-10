import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../lib/storage';

export interface Preferences {
  translationEnabled: boolean;
}

const KEY = 'arc.preferences.v1';
const DEFAULTS: Preferences = { translationEnabled: true };

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
