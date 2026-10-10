import { compareReleaseDates } from './dates';
import { editionKey, groupIncludes, type EditionGroup } from './editions';

export type ReleaseOrder = 'asc' | 'desc';

/** Edition groups oldest first (or newest first), by the original's date, then title. */
export function sortChronologically(groups: readonly EditionGroup[], order: ReleaseOrder = 'asc'): EditionGroup[] {
  const sorted = [...groups].sort(
    (a, b) => compareReleaseDates(a.primary.releaseDate, b.primary.releaseDate) || a.primary.name.localeCompare(b.primary.name),
  );
  return order === 'asc' ? sorted : sorted.reverse();
}

/**
 * The artist's own sequence (an artist note's `discography:` list), in list
 * order. Each entry is a Spotify album ID of any edition or a release title,
 * which matches every edition of it. Entries Spotify doesn't list are skipped.
 */
export function curatedSequence(groups: readonly EditionGroup[], entries: readonly string[]): EditionGroup[] {
  const sequence: EditionGroup[] = [];
  for (const entry of entries) {
    const key = editionKey(entry);
    const group = groups.find((g) => groupIncludes(g, entry)) ?? groups.find((g) => editionKey(g.primary.name) === key);
    if (group && !sequence.includes(group)) sequence.push(group);
  }
  return sequence;
}

export interface YearSection {
  /** Null for releases without a date. */
  year: number | null;
  groups: EditionGroup[];
}

/** Consecutive releases of the same year, in the order given. */
export function sectionsByYear(groups: readonly EditionGroup[]): YearSection[] {
  const sections: YearSection[] = [];
  for (const group of groups) {
    const match = group.primary.releaseDate ? /^(\d{4})/.exec(group.primary.releaseDate) : null;
    const year = match ? Number(match[1]) : null;
    const last = sections[sections.length - 1];
    if (last && last.year === year) last.groups.push(group);
    else sections.push({ year, groups: [group] });
  }
  return sections;
}

export interface AdjacentReleases {
  /** 1-based position of the release in the chronology. */
  position: number;
  total: number;
  previous: EditionGroup | null;
  next: EditionGroup | null;
}

/** The releases before and after `albumId` (or any of its editions) in an oldest-first chronology. */
export function adjacentReleases(chronology: readonly EditionGroup[], albumId: string): AdjacentReleases | null {
  const index = chronology.findIndex((group) => groupIncludes(group, albumId));
  if (index < 0) return null;
  return {
    position: index + 1,
    total: chronology.length,
    previous: chronology[index - 1] ?? null,
    next: chronology[index + 1] ?? null,
  };
}
