import { listKeys, readJson, removeKey, writeJson } from './storage';

interface Envelope<T> {
  v: T;
  /** Stored at (epoch ms). */
  t: number;
  /** Expires at (epoch ms). */
  e: number;
}

export interface BoundedCacheOptions {
  /** localStorage key prefix, e.g. `arc.lyrics.v1:`. */
  prefix: string;
  /** Maximum number of entries kept; oldest entries are evicted first. */
  maxEntries: number;
  now?: () => number;
}

/**
 * A small persistent cache on top of localStorage with per-entry TTL and a
 * size bound. Values must be JSON-serialisable. Used for lyrics, translations
 * and extracted palettes — never for credentials.
 */
export class BoundedCache<T> {
  private readonly prefix: string;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: BoundedCacheOptions) {
    this.prefix = options.prefix;
    this.maxEntries = options.maxEntries;
    this.now = options.now ?? Date.now;
  }

  /** Returns `undefined` for a miss; `null` is a valid cached value (negative cache). */
  get(key: string): T | undefined {
    const envelope = readJson<Envelope<T>>(this.prefix + key);
    if (!envelope || typeof envelope.e !== 'number') return undefined;
    if (envelope.e <= this.now()) {
      removeKey(this.prefix + key);
      return undefined;
    }
    return envelope.v;
  }

  set(key: string, value: T, ttlMs: number): void {
    const now = this.now();
    const envelope: Envelope<T> = { v: value, t: now, e: now + ttlMs };
    if (!writeJson(this.prefix + key, envelope)) {
      // Storage full: evict aggressively and retry once.
      this.evict(Math.floor(this.maxEntries / 2));
      writeJson(this.prefix + key, envelope);
      return;
    }
    this.evict(this.maxEntries);
  }

  delete(key: string): void {
    removeKey(this.prefix + key);
  }

  clear(): void {
    for (const key of listKeys(this.prefix)) removeKey(key);
  }

  private evict(limit: number): void {
    const keys = listKeys(this.prefix);
    if (keys.length <= limit) return;
    const stamped = keys.map((key) => ({ key, t: readJson<Envelope<T>>(key)?.t ?? 0 }));
    stamped.sort((a, b) => a.t - b.t);
    for (const { key } of stamped.slice(0, keys.length - limit)) removeKey(key);
  }
}
