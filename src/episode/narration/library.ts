import { clipPath, isNarrationManifest, type NarrationManifest } from './clip';

/** How many clips are kept in memory once fetched: the cue being said and the one after it, with room to spare. */
const KEPT_CLIPS = 64;
/** How many clips are fetched at once when preparing ahead. */
const PARALLEL_FETCHES = 4;

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface LibraryEnvironment {
  fetch: Fetcher;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

function browserEnvironment(): LibraryEnvironment | null {
  if (typeof fetch !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  return {
    fetch: (url, init) => fetch(url, init),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

/**
 * The site's recorded clips (`narration/` next to the app): which exist, how
 * long each is, and the audio itself. A clip is fetched whole and handed to
 * the player as an object URL, so a line either is ready to play or is not:
 * nothing stalls halfway through a sentence on a slow connection.
 *
 * A site built without recordings has no `narration/index.json`; the library
 * then stays empty and every line falls to the browser's own voice.
 */
export class NarrationLibrary {
  private manifest: NarrationManifest | null = null;
  private loading: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  /** Clip key → its object URL, or the fetch that will produce it. Oldest first. */
  private readonly clips = new Map<string, Promise<string>>();
  private readonly waiting: string[] = [];
  private fetching = 0;

  constructor(
    /** Ends with a slash. */
    private readonly baseUrl: string,
    private readonly environment: LibraryEnvironment | null = browserEnvironment(),
  ) {}

  /** Reads the index once; safe to call again. Never rejects. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    const environment = this.environment;
    if (!environment) return (this.loading = Promise.resolve());
    this.loading = environment
      .fetch(`${this.baseUrl}index.json`)
      // A development server answers an unknown path with the app's page: that is not an index either.
      .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
      .then((data) => {
        if (!isNarrationManifest(data)) return;
        this.manifest = data;
        for (const listener of this.listeners) listener();
      })
      .catch(() => undefined);
    return this.loading;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The index, once it has loaded and if the site has one. */
  getManifest = (): NarrationManifest | null => this.manifest;

  /** The length of a clip in milliseconds, or undefined when the site has no such clip. */
  clipMs(key: string): number | undefined {
    const ms = this.manifest?.clips[key];
    return typeof ms === 'number' && ms > 0 ? ms : undefined;
  }

  /** The clip as something an audio element can play. Rejects when it cannot be fetched. */
  clip(key: string): Promise<string> {
    const known = this.clips.get(key);
    if (known) {
      // Used again: it is the newest now.
      this.clips.delete(key);
      this.clips.set(key, known);
      return known;
    }
    const environment = this.environment;
    if (!environment) return Promise.reject(new Error('No way to fetch a clip here.'));
    const fetched = environment
      .fetch(`${this.baseUrl}${clipPath(key)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Clip ${key}: HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => environment.createObjectURL(blob));
    this.clips.set(key, fetched);
    // A failed fetch is forgotten, so the next time the line comes up it is tried again.
    fetched.catch(() => {
      if (this.clips.get(key) === fetched) this.clips.delete(key);
    });
    this.trim();
    return fetched;
  }

  /** Fetches clips that are about to be needed, a few at a time, in the order given. */
  prepare(keys: readonly string[]): void {
    for (const key of keys) {
      if (this.clipMs(key) === undefined || this.clips.has(key) || this.waiting.includes(key)) continue;
      this.waiting.push(key);
    }
    this.pump();
  }

  private pump(): void {
    while (this.fetching < PARALLEL_FETCHES && this.waiting.length > 0) {
      const key = this.waiting.shift()!;
      if (this.clips.has(key)) continue;
      this.fetching += 1;
      const done = () => {
        this.fetching -= 1;
        this.pump();
      };
      this.clip(key).then(done, done);
    }
  }

  private trim(): void {
    const environment = this.environment;
    while (this.clips.size > KEPT_CLIPS) {
      const oldest = this.clips.keys().next().value as string;
      const url = this.clips.get(oldest)!;
      this.clips.delete(oldest);
      void url.then((value) => environment?.revokeObjectURL(value)).catch(() => undefined);
    }
  }
}

function siteBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}narration/`;
}

/** The recordings of this site. */
export const narrationLibrary = new NarrationLibrary(siteBase());
