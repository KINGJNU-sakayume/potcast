import type { CatalogueSource } from '../catalogue/CatalogueSource';
import type { AlbumSummary, ReleaseGroup } from '../domain/types';

/** Development Mode returns 10 releases per request; 30 pages covers all but the largest "Appears on" lists. */
export const MAX_DISCOGRAPHY_PAGES = 30;
const PAGE_SIZE = 50;

export interface Discography {
  releases: AlbumSummary[];
  /** Spotify's count for the group. */
  total: number;
  /** False when the page cap stopped the walk early. */
  complete: boolean;
}

/** Walks every page of one release group, so the timeline can be ordered as a whole. */
export async function loadDiscography(
  catalogue: CatalogueSource,
  artistId: string,
  group: ReleaseGroup,
  signal?: AbortSignal,
): Promise<Discography> {
  const releases: AlbumSummary[] = [];
  let total = 0;
  for (let pageIndex = 0; pageIndex < MAX_DISCOGRAPHY_PAGES; pageIndex += 1) {
    const page = await catalogue.getArtistReleases(artistId, [group], { offset: releases.length, limit: PAGE_SIZE }, signal);
    total = page.total;
    releases.push(...page.items);
    if (!page.hasMore || page.items.length === 0) return { releases, total, complete: true };
  }
  return { releases, total, complete: releases.length >= total };
}
