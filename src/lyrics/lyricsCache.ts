import type { TrackIdentity } from '../domain/types';
import { BoundedCache } from '../lib/boundedCache';
import type { LyricsProvider, LyricsRequestOptions, TimedLyrics } from './types';

const FOUND_TTL_MS = 30 * 24 * 60 * 60_000;
const MISSING_TTL_MS = 3 * 24 * 60 * 60_000;

/**
 * Wraps a provider with a persistent cache keyed by provider + track ID.
 * "No lyrics" results are cached briefly so they are retried later; transient
 * errors are never cached. The whole result is stored, including `timing`
 * (LRCLIB record ID and duration) that curated translations check against;
 * v2 entries are the first to carry it.
 */
export function withLyricsCache(
  provider: LyricsProvider,
  cache: BoundedCache<TimedLyrics | null> = new BoundedCache({ prefix: 'arc.lyrics.v2:', maxEntries: 150 }),
): LyricsProvider {
  return {
    id: provider.id,
    label: provider.label,
    async getTimedLyrics(track: TrackIdentity, options?: LyricsRequestOptions) {
      // A lookup pinned to a curated translation's LRCLIB record is cached apart from the plain search.
      const key = `${provider.id}:${track.spotifyTrackId}${options?.lrclibId ? `@${options.lrclibId}` : ''}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const result = await provider.getTimedLyrics(track, options);
      cache.set(key, result, result ? FOUND_TTL_MS : MISSING_TTL_MS);
      return result;
    },
  };
}
