import { describe, expect, it } from 'vitest';
import type { TrackIdentity } from '../domain/types';
import { seeded } from '../test/random';
import type { CatalogueSource, PageRequest } from './CatalogueSource';
import { SHUFFLE_BLOCK, SHUFFLE_BLOCKS, drawLikedShuffle } from './likedShuffle';

function track(index: number): TrackIdentity {
  return {
    spotifyTrackId: `t${index}`,
    uri: `spotify:track:t${index}`,
    title: `Track ${index}`,
    artists: [],
    album: { id: '', name: '', uri: '', images: [] },
    durationMs: 1000,
  };
}

/** A library of `total` liked tracks that records every page request. */
function library(total: number) {
  const tracks = Array.from({ length: total }, (_, i) => track(i));
  const requests: PageRequest[] = [];
  const catalogue = {
    async getLikedTracks(request: PageRequest) {
      requests.push(request);
      const items = tracks.slice(request.offset, request.offset + request.limit);
      return { items, offset: request.offset, limit: request.limit, total, hasMore: request.offset + items.length < total };
    },
  } as unknown as CatalogueSource;
  return { catalogue, requests };
}

describe('drawLikedShuffle', () => {
  it('plays a small library in full, in shuffled order', async () => {
    const { catalogue, requests } = library(12);
    const result = await drawLikedShuffle(catalogue, 12, seeded(3));
    expect(requests).toEqual([{ offset: 0, limit: SHUFFLE_BLOCK }]);
    expect(result.map((t) => t.uri).sort()).toEqual(
      Array.from({ length: 12 }, (_, i) => `spotify:track:t${i}`).sort(),
    );
    expect(result.map((t) => t.spotifyTrackId)).not.toEqual(Array.from({ length: 12 }, (_, i) => `t${i}`));
  });

  it('samples a large library in a bounded number of blocks spread across the collection', async () => {
    const total = 2_000;
    const { catalogue, requests } = library(total);
    const result = await drawLikedShuffle(catalogue, total, seeded(11));
    expect(requests).toHaveLength(SHUFFLE_BLOCKS);
    expect(new Set(requests.map((r) => r.offset)).size).toBe(SHUFFLE_BLOCKS);
    for (const request of requests) {
      expect(request.offset % SHUFFLE_BLOCK).toBe(0);
      expect(request.offset).toBeLessThan(total);
    }
    // Not just the most recent likes.
    expect(requests.some((r) => r.offset >= SHUFFLE_BLOCK * SHUFFLE_BLOCKS)).toBe(true);
    expect(result).toHaveLength(SHUFFLE_BLOCK * SHUFFLE_BLOCKS);
    expect(new Set(result.map((t) => t.uri)).size).toBe(result.length);
  });

  it('draws a different selection each time', async () => {
    const { catalogue } = library(5_000);
    const random = seeded(5);
    const first = await drawLikedShuffle(catalogue, 5_000, random);
    const second = await drawLikedShuffle(catalogue, 5_000, random);
    expect(first.map((t) => t.uri)).not.toEqual(second.map((t) => t.uri));
  });

  it('returns nothing for an empty library', async () => {
    const { catalogue, requests } = library(0);
    expect(await drawLikedShuffle(catalogue, 0)).toEqual([]);
    expect(requests).toEqual([]);
  });
});
