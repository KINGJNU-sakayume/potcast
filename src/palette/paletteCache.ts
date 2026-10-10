import { BoundedCache } from '../lib/boundedCache';
import { extractAlbumPalette } from './extractAlbumPalette';
import type { AlbumPalette } from './types';

const FOUND_TTL_MS = 90 * 24 * 60 * 60_000;
const FAILED_TTL_MS = 24 * 60 * 60_000;

type Extractor = (imageUrl: string) => Promise<AlbumPalette | null>;

/**
 * Palette cache keyed by album ID (or image URL): memory → localStorage →
 * extraction. Concurrent requests for the same key share one extraction, so a
 * cover is never re-analysed on re-render.
 */
export class PaletteCache {
  private readonly memory = new Map<string, AlbumPalette | null>();
  private readonly inflight = new Map<string, Promise<AlbumPalette | null>>();
  private readonly precomputed = new Map<string, AlbumPalette>();

  constructor(
    private readonly persistent: BoundedCache<AlbumPalette | null> | null = new BoundedCache({
      prefix: 'arc.palette.v1:',
      maxEntries: 300,
    }),
    private readonly extract: Extractor = (url) => extractAlbumPalette(url),
  ) {}

  /** Registers a known palette (e.g. preview seed data) that skips extraction. */
  register(key: string, palette: AlbumPalette): void {
    this.precomputed.set(key, palette);
  }

  /** Synchronous read: undefined when not yet known. */
  peek(key: string): AlbumPalette | null | undefined {
    const known = this.precomputed.get(key);
    if (known) return known;
    if (this.memory.has(key)) return this.memory.get(key);
    const stored = this.persistent?.get(key);
    if (stored !== undefined) this.memory.set(key, stored);
    return stored;
  }

  load(key: string, imageUrl: string | null): Promise<AlbumPalette | null> {
    const cached = this.peek(key);
    if (cached !== undefined) return Promise.resolve(cached);
    if (!imageUrl) return Promise.resolve(null);
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const request = this.extract(imageUrl)
      .catch(() => null)
      .then((palette) => {
        this.memory.set(key, palette);
        this.persistent?.set(key, palette, palette ? FOUND_TTL_MS : FAILED_TTL_MS);
        return palette;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }
}

export const paletteCache = new PaletteCache();
