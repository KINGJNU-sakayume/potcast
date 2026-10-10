import type { TrackIdentity } from '../domain/types';
import { shuffled } from '../lib/shuffle';
import type { CatalogueSource } from './CatalogueSource';

/** Tracks per request (the Web API page maximum). */
export const SHUFFLE_BLOCK = 50;
/** Blocks per draw: up to 250 tracks — many hours of listening — in at most five parallel requests. */
export const SHUFFLE_BLOCKS = 5;

/**
 * Draws a shuffled selection from Liked Songs. The Web API offers no context
 * URI for Liked Songs, so shuffled playback plays an explicit track list. A
 * library larger than one draw is sampled as random blocks spread across the
 * whole collection, so every draw is a different selection — not only the
 * most recent likes.
 */
export async function drawLikedShuffle(
  catalogue: CatalogueSource,
  total: number,
  random: () => number = Math.random,
  signal?: AbortSignal,
): Promise<TrackIdentity[]> {
  const blockCount = Math.ceil(total / SHUFFLE_BLOCK);
  const blocks = shuffled(
    Array.from({ length: blockCount }, (_, index) => index),
    random,
  ).slice(0, SHUFFLE_BLOCKS);
  const pages = await Promise.all(
    blocks.map((block) => catalogue.getLikedTracks({ offset: block * SHUFFLE_BLOCK, limit: SHUFFLE_BLOCK }, signal)),
  );
  const seen = new Set<string>();
  const tracks = pages
    .flatMap((page) => page.items)
    .filter((track) => {
      if (seen.has(track.uri)) return false;
      seen.add(track.uri);
      return true;
    });
  return shuffled(tracks, random);
}
