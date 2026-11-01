import { groupEditions } from '../discography/editions';
import type { AlbumSummary } from '../domain/types';
import { normaliseTitle } from '../editorial/lookup';
import type { ArtistDigProject, DigData, DigRelease, DigTrack, ReleaseMembership, ReviewStatus } from './types';

export function inScope(project: ArtistDigProject, membership: ReleaseMembership, release: DigRelease): boolean {
  if (membership.override !== 'auto') return membership.override === 'include';
  if (!project.scope[membership.group]) return false;
  if (project.studioOnly && membership.group === 'album') {
    // Spotify has no studio flag. Explicit manual overrides always win over this conservative heuristic.
    return membership.studio ?? !/\b(live|concert|soundtrack|greatest hits|best of|compilation)\b|ライヴ|ライブ|베스트|라이브/i.test(release.name);
  }
  return true;
}

const completeTracks = (release: DigRelease) => release.tracksComplete && release.totalTracks !== null && release.trackIds.length === release.totalTracks;

/** Recording identity needs credits AND duration, never just normalized title. */
export function sameRecording(a: DigTrack, b: DigTrack): boolean {
  if (a.id === b.id) return true;
  return a.durationMs > 0 && b.durationMs > 0 && Math.abs(a.durationMs - b.durationMs) <= 1500 &&
    normaliseTitle(a.name) === normaliseTitle(b.name) && a.artists.length > 0 &&
    a.artists.map((x) => x.id).sort().join(',') === b.artists.map((x) => x.id).sort().join(',');
}

/** Existing edition grouping supplies candidates; full sequences verify a match before counting one edition. */
function verifiedEdition(a: DigRelease, b: DigRelease, tracks: Map<string, DigTrack>): boolean {
  if (!completeTracks(a) || !completeTracks(b) || a.albumType !== b.albumType || a.artists.length === 0 ||
    a.artists.map((x) => x.id).sort().join(',') !== b.artists.map((x) => x.id).sort().join(',')) return false;
  const smaller = a.trackIds.length <= b.trackIds.length ? a : b;
  const larger = smaller === a ? b : a;
  if (smaller.trackIds.length < 2) return smaller.trackIds.length === 1 && larger.trackIds.includes(smaller.trackIds[0]!);
  return smaller.trackIds.every((id, i) => {
    const x = tracks.get(id);
    const y = tracks.get(larger.trackIds[i]!);
    return x && y && sameRecording(x, y);
  });
}

export interface DigProgress {
  total: number;
  reviewed: number;
  listened: number;
  reviewRatio: number;
  listenRatio: number;
  known: boolean;
  reviewComplete: boolean;
  allListened: boolean;
  completedAlbums: number;
  totalAlbums: number;
  releases: DigRelease[];
  trackIds: string[];
  next: { albumId: string; track: DigTrack } | null;
  aliases: Map<string, string[]>;
}

export function progressFor(project: ArtistDigProject, data: DigData): DigProgress {
  const tracks = new Map(data.tracks.map((track) => [track.id, track]));
  const states = new Map(data.states.map((state) => [state.id, state.status]));
  const memberships = data.memberships.filter((m) => m.artistId === project.id);
  const releaseMap = new Map(data.releases.map((r) => [r.id, r]));
  const candidates = memberships.flatMap((m) => {
    const release = releaseMap.get(m.albumId);
    return release && inScope(project, m, release) ? [release] : [];
  });
  const chosen: DigRelease[] = [];
  for (const group of groupEditions(candidates.map((r): AlbumSummary => ({ ...r })))) {
    const primary = releaseMap.get(group.primary.id)!;
    chosen.push(primary);
    for (const edition of group.editions) {
      const release = releaseMap.get(edition.id)!;
      // Manually included editions deliberately add bonus tracks; normal editions fold only after verification.
      if (memberships.find((m) => m.albumId === release.id)?.override === 'include' || !verifiedEdition(primary, release, tracks)) chosen.push(release);
    }
  }
  chosen.sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999') || a.id.localeCompare(b.id));
  const aliases = new Map<string, string[]>();
  const targets: Array<{ id: string; albumId: string }> = [];
  let unknown = 0;
  let known = project.catalogueComplete && chosen.length > 0;
  for (const release of chosen) {
    known = known && completeTracks(release) && release.trackIds.every((id) => tracks.has(id));
    unknown += Math.max(0, (release.totalTracks ?? release.trackIds.length + 1) - release.trackIds.length);
    for (const id of release.trackIds) {
      const track = tracks.get(id);
      if (!track) { unknown++; continue; }
      // Different IDs only share state when the full recording signature agrees.
      const existing = targets.find((t) => { const other = tracks.get(t.id); return other && sameRecording(track, other); });
      const canonical = existing?.id ?? id;
      if (!existing) targets.push({ id, albumId: release.id });
      const ids = aliases.get(canonical) ?? [];
      if (!ids.includes(id)) ids.push(id);
      // A reviewed deluxe may satisfy its original edition even when that deluxe is folded away.
      for (const candidate of candidates) {
        if (candidate.id === release.id || !verifiedEdition(release, candidate, tracks)) continue;
        for (const otherId of candidate.trackIds) {
          const other = tracks.get(otherId);
          if (other && sameRecording(track, other) && !ids.includes(otherId)) ids.push(otherId);
        }
      }
      aliases.set(canonical, ids);
    }
  }
  const statusOf = (id: string): ReviewStatus => {
    const values = (aliases.get(id) ?? [id]).map((x) => states.get(x) ?? 'none');
    return values.includes('listened') ? 'listened' : values.includes('skipped') ? 'skipped' : 'none';
  };
  const listened = targets.filter((t) => statusOf(t.id) === 'listened').length;
  const reviewed = targets.filter((t) => statusOf(t.id) !== 'none').length;
  const total = targets.length + unknown;
  const next = targets.find((t) => statusOf(t.id) === 'none');
  const albums = chosen.filter((r) => r.albumType === 'album');
  return {
    total, listened, reviewed, known,
    // An incomplete catalogue cannot report a misleading 100%.
    reviewRatio: total ? Math.min(reviewed / total, known ? 1 : 0.99) : 0,
    listenRatio: total ? Math.min(listened / total, known ? 1 : 0.99) : 0,
    reviewComplete: known && total > 0 && reviewed === total,
    allListened: known && total > 0 && listened === total,
    completedAlbums: albums.filter((r) => completeTracks(r) && r.trackIds.length > 0 && r.trackIds.every((id) => {
      const canonical = targets.find((t) => aliases.get(t.id)?.includes(id))?.id ?? id;
      return statusOf(canonical) !== 'none';
    })).length,
    totalAlbums: albums.length,
    releases: chosen, trackIds: targets.map((t) => t.id), aliases,
    next: next ? { albumId: next.albumId, track: tracks.get(next.id)! } : null,
  };
}

export function historyByDay(events: DigData['events'], timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const groups = new Map<string, DigData['events']>();
  for (const event of [...events].sort((a, b) => b.listenedAt.localeCompare(a.listenedAt))) {
    const day = format.format(new Date(event.listenedAt));
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  return groups;
}
