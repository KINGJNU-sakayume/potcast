import type { TrackIdentity } from '../domain/types';
import { BoundedCache } from '../lib/boundedCache';
import type { LyricsProvider, LyricsRequestOptions, TimedLyrics } from './types';
import { storageKey } from '../lib/storageNamespace';

/** Uploads on LRCLIB are corrected and added over time, so a result is reused for days, not weeks. */
const FOUND_TTL_MS = 7 * 24 * 60 * 60_000;
/** Lyrics that are not there yet may be uploaded within hours; look again soon. */
const MISSING_TTL_MS = 6 * 60 * 60_000;

/** Earlier cache generations, removed once so their stale results (up to 30 days old) take no space and are not reused. */
const LEGACY_PREFIXES = ['lyrics.v2:', 'lyrics.v3:'];

function openDefaultCache(): BoundedCache<TimedLyrics | null> {
  for (const prefix of LEGACY_PREFIXES) new BoundedCache({ prefix: storageKey(prefix), maxEntries: 0 }).clear();
  return new BoundedCache({ prefix: storageKey('lyrics.v4:'), maxEntries: 150 });
}

/**
 * Wraps a provider with a persistent cache keyed by provider + track ID.
 * "No lyrics" results are cached briefly so they are retried later; transient
 * errors are never cached. The whole result is stored, including `timing`
 * (LRCLIB record ID and duration) that curated translations check against;
 * v2 entries are the first to carry it. v3 re-selected the upload (an original-script
 * one over a romanised one); v4 ranks uploads that cover the whole track first and
 * shortens how long results are kept, so results cached by v3 are not reused.
 * A lookup with `refresh` skips the cached result and replaces it.
 */
export function withLyricsCache(provider: LyricsProvider, cache: BoundedCache<TimedLyrics | null> = openDefaultCache()): LyricsProvider {
  return {
    id: provider.id,
    label: provider.label,
    async getTimedLyrics(track: TrackIdentity, options?: LyricsRequestOptions) {
      // A lookup pinned to a curated translation's LRCLIB record is cached apart from the plain search.
      const key = `${provider.id}:${track.spotifyTrackId}${options?.lrclibId ? `@${options.lrclibId}` : ''}`;
      if (!options?.refresh) {
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
      }
      const result = await provider.getTimedLyrics(track, options);
      cache.set(key, result, result ? FOUND_TTL_MS : MISSING_TTL_MS);
      return result;
    },
  };
}
