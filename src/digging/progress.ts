import { groupEditions } from '../discography/editions';
import type { AlbumSummary } from '../domain/types';
import { normaliseTitle } from '../editorial/lookup';
import type { ArtistDigProject, DigData, DigRelease, DigTrack, ReleaseMembership, ReviewStatus } from './types';

const studioCandidate = (membership: ReleaseMembership, release: DigRelease) => membership.studio ?? !/\b(live|concert|soundtrack|greatest hits|best of|compilation)\b|ライヴ|ライブ|베스트|라이브/i.test(release.name);

export function inScope(project: ArtistDigProject, membership: ReleaseMembership, release: DigRelease): boolean {
  if (membership.override !== 'auto') return membership.override === 'include';
  if (!project.scope[membership.group]) return false;
  if (project.studioOnly && membership.group === 'album') {
    // Spotify has no studio flag. Explicit manual overrides always win over this conservative heuristic.
    return studioCandidate(membership, release);
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

/** Spotify IDs are authoritative. Different IDs alias only inside a verified edition sequence. */
function recordingIndex(data: DigData) {
  const tracks = new Map(data.tracks.map((track) => [track.id, track]));
  const releases = new Map(data.releases.map((r) => [r.id, r]));
  const parents = new Map(data.tracks.map((track) => [track.id, track.id]));
  const root = (id: string): string => {
    let next = parents.get(id) ?? id;
    while (next !== (parents.get(next) ?? next)) next = parents.get(next)!;
    return next;
  };
  for (const group of groupEditions(data.releases)) {
    const members = [group.primary, ...group.editions].map((r) => releases.get(r.id)!);
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!; const b = members[j]!;
      if (!verifiedEdition(a, b, tracks)) continue;
      for (let k = 0; k < Math.min(a.trackIds.length, b.trackIds.length); k++) parents.set(root(b.trackIds[k]!), root(a.trackIds[k]!));
    }
  }
  const canonical = new Map(data.tracks.map((t) => [t.id, root(t.id)]));
  const aliases = new Map<string, string[]>();
  for (const [id, key] of canonical) aliases.set(key, [...(aliases.get(key) ?? []), id]);
  const latest = new Map<string, DigData['states'][number]>();
  for (const state of data.states) {
    const key = canonical.get(state.id) ?? state.id;
    const old = latest.get(key);
    if (!old || old.updatedAt.localeCompare(state.updatedAt) < 0 || (old.updatedAt === state.updatedAt && old.id.localeCompare(state.id) < 0)) latest.set(key, state);
  }
  const assertions = new Map(data.tracks.map((t) => [t.id, latest.get(canonical.get(t.id)!)]));
  const states = new Map([...assertions].map(([id, state]) => [id, state?.status ?? 'none']));
  return { canonical, aliases, states, assertions };
}

/** The most recent explicit assertion wins across verified aliases, including an explicit reset to none. */
export const reviewStatesFor = (data: DigData): Map<string, ReviewStatus> => recordingIndex(data).states;
export const reviewAssertionsFor = (data: DigData) => recordingIndex(data).assertions;
export const statusForTrack = (id: string, data: DigData): ReviewStatus => reviewStatesFor(data).get(id) ?? 'none';

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
  const recordings = recordingIndex(data);
  const memberships = data.memberships.filter((m) => m.artistId === project.id);
  const releaseMap = new Map(data.releases.map((r) => [r.id, r]));
  const candidates = memberships.flatMap((m) => {
    const release = releaseMap.get(m.albumId);
    return release && inScope(project, m, release) ? [release] : [];
  });
  const chosen: DigRelease[] = [];
  for (const group of groupEditions(candidates.map((r): AlbumSummary => ({ ...r })))) {
    const roots: DigRelease[] = [];
    for (const edition of [group.primary, ...group.editions]) {
      const release = releaseMap.get(edition.id)!;
      // Manually included editions deliberately add bonus tracks; normal editions fold only after verification.
      if (memberships.find((m) => m.albumId === release.id)?.override === 'include' || !roots.some((primary) => verifiedEdition(primary, release, tracks))) roots.push(release);
    }
    chosen.push(...roots);
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
      const key = recordings.canonical.get(id) ?? id;
      const existing = targets.find((t) => recordings.canonical.get(t.id) === key);
      const canonical = existing?.id ?? id;
      if (!existing) targets.push({ id, albumId: release.id });
      aliases.set(canonical, recordings.aliases.get(key) ?? [id]);
    }
  }
  const statusOf = (id: string): ReviewStatus => {
    return recordings.states.get(id) ?? 'none';
  };
  const listened = targets.filter((t) => statusOf(t.id) === 'listened').length;
  const reviewed = targets.filter((t) => statusOf(t.id) !== 'none').length;
  const total = targets.length + unknown;
  const next = targets.find((t) => statusOf(t.id) === 'none');
  const albums = chosen.filter((r) => memberships.some((m) => m.albumId === r.id && m.group === 'album' && studioCandidate(m, r)));
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
