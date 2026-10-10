import type { AlbumSummary } from '../domain/types';
import { normaliseTitle } from '../editorial/lookup';
import { compareReleaseDates } from './dates';

/**
 * Spotify lists every edition of a release separately (deluxe, remaster,
 * regional, anniversary). For digging they are one entry: the original, with
 * the other editions folded beneath it.
 */

/** Words that mark a bracketed or dashed title suffix as an edition, not a different release. */
const EDITION_WORDS =
  String.raw`deluxe|edition|remaster(?:ed)?|expanded|anniversary|bonus tracks?|special|collector'?s|limited|reissue|` +
  String.raw`(?:international|japan(?:ese)?|us|uk|explicit|clean|bonus track) version|初回限定盤|通常盤|完全生産限定盤|限定盤`;
const BRACKET_SUFFIX = new RegExp(String.raw`\s*[([][^)\]]*(?:${EDITION_WORDS})[^)\]]*[)\]]\s*$`, 'i');
const DASH_SUFFIX = new RegExp(String.raw`\s+[-–—]\s+[^-–—]*(?:${EDITION_WORDS})[^-–—]*$`, 'i');

/** The title every edition of a release shares: "Parachutes (Remastered 2020) [Deluxe]" → "parachutes". */
export function editionKey(title: string): string {
  let key = normaliseTitle(title);
  for (let previous = ''; previous !== key; ) {
    previous = key;
    key = key.replace(BRACKET_SUFFIX, '').replace(DASH_SUFFIX, '').trim();
  }
  return key || normaliseTitle(title);
}

export interface EditionGroup {
  /** The original: the earliest release, the unsuffixed title on a tie, then the one with more tracks. */
  primary: AlbumSummary;
  /** Other editions, oldest first. */
  editions: AlbumSummary[];
}

function originalFirst(a: AlbumSummary, b: AlbumSummary): number {
  return (
    compareReleaseDates(a.releaseDate, b.releaseDate) ||
    Number(editionKey(a.name) !== normaliseTitle(a.name)) - Number(editionKey(b.name) !== normaliseTitle(b.name)) ||
    (b.totalTracks ?? 0) - (a.totalTracks ?? 0) ||
    a.name.localeCompare(b.name)
  );
}

/** Folds editions of the same release (same edition key) together. Duplicate IDs are dropped. */
export function groupEditions(releases: readonly AlbumSummary[]): EditionGroup[] {
  const seen = new Set<string>();
  const groups = new Map<string, AlbumSummary[]>();
  for (const release of releases) {
    if (seen.has(release.id)) continue;
    seen.add(release.id);
    const key = editionKey(release.name);
    groups.set(key, [...(groups.get(key) ?? []), release]);
  }
  return [...groups.values()].map((members) => {
    const [primary, ...editions] = [...members].sort(originalFirst);
    return { primary: primary!, editions };
  });
}

export function groupIncludes(group: EditionGroup, albumId: string): boolean {
  return group.primary.id === albumId || group.editions.some((edition) => edition.id === albumId);
}
