/**
 * Defensive Web Storage access. Storage can be unavailable (privacy modes,
 * disabled cookies) or full; the app must keep working without persistence.
 */

type StorageKind = 'local' | 'session';

function getStorage(kind: StorageKind): Storage | null {
  try {
    const storage = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, kind: StorageKind = 'local'): T | null {
  const storage = getStorage(kind);
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, kind: StorageKind = 'local'): boolean {
  const storage = getStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string, kind: StorageKind = 'local'): void {
  const storage = getStorage(kind);
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function listKeys(prefix: string, kind: StorageKind = 'local'): string[] {
  const storage = getStorage(kind);
  if (!storage) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}
