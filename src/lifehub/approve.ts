/**
 * Turning an `album_listening` proposal into potcast records — only after the owner reviews it.
 *
 * 1. resolveAlbum: the album on Spotify (by ID, via a proposed track's ID, or by an exact name+artist
 *    search). Anything less than an exact match is returned as choices for the owner.
 * 2. planTracks: every album track with the proposed status (listened / skipped / none). Proposed tracks
 *    that do not match any album track are reported, never guessed.
 * 3. applyApproval: through the existing DigService — album snapshot, a listen event per listened track
 *    (ID carries the proposal key), listened states, and skipped states only where nothing was recorded
 *    yet (a skip never downgrades an earlier "listened").
 */
import type { CatalogueSource } from '../catalogue/CatalogueSource';
import type { AlbumDetail, AlbumSummary, AlbumTrack } from '../domain/types';
import { statusForTrack } from '../digging/progress';
import type { DigService } from '../digging/service';
import type { ReviewStatus } from '../digging/types';
import { eventIdFor, type AlbumProposal } from './remote';

export const normalize = (s: string) =>
  s.normalize('NFKC').toLowerCase()
    .replace(/\s+-\s+.*(remaster|version|live|mono|stereo|edit|mix).*$/u, '')
    .replace(/[([{][^)\]}]*(remaster|version|deluxe|edition|live|mono|stereo|edit|mix)[^)\]}]*[)\]}]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

export interface Resolution {
  album: AlbumDetail | null;
  /** When no exact match was found: albums the owner can choose from. */
  choices: AlbumSummary[];
}

type Source = Pick<CatalogueSource, 'getAlbum' | 'getTrack' | 'search'>;

export async function resolveAlbum(p: AlbumProposal, catalogue: Source, signal?: AbortSignal): Promise<Resolution> {
  if (p.spotifyAlbumId) return { album: await catalogue.getAlbum(p.spotifyAlbumId, signal), choices: [] };
  const firstId = p.tracks.find((t) => t.spotify_track_id)?.spotify_track_id;
  if (firstId) {
    try {
      const lookup = await catalogue.getTrack(firstId, signal);
      return { album: await catalogue.getAlbum(lookup.track.album.id, signal), choices: [] };
    } catch {
      /* fall back to search */
    }
  }
  const results = await catalogue.search({ query: `album:${p.album} artist:${p.artist}`, types: ['album'], offset: 0, limit: 8 }, signal);
  const albums = results.albums?.items ?? [];
  const name = normalize(p.album);
  const artist = normalize(p.artist);
  const exact = albums.filter((a) => normalize(a.name) === name && a.artists.some((x) => normalize(x.name) === artist));
  const only = exact.length === 1 ? exact[0] : undefined;
  if (only) return { album: await catalogue.getAlbum(only.id, signal), choices: [] };
  return { album: null, choices: exact.length ? exact : albums };
}

export interface PlannedTrack {
  track: AlbumTrack;
  status: ReviewStatus;
  playedAt: string | null;
}
export interface Plan {
  rows: PlannedTrack[];
  /** Proposed tracks that matched nothing on this album (shown, never guessed). */
  unmatched: string[];
}

/** Noon in Korea on the stated day keeps the calendar day right in the owner's time zone. */
const dayToIso = (day: string) => new Date(`${day}T12:00:00+09:00`).toISOString();

/** When a listen happened if no track time was proposed: the stated day, else when Claude proposed it. */
export const fallbackPlayedAt = (p: AlbumProposal) => p.listenedOn ? dayToIso(p.listenedOn) : p.createdAt;

export function planTracks(p: AlbumProposal, album: AlbumDetail): Plan {
  const fallbackAt = fallbackPlayedAt(p);
  if (p.wholeAlbum) return { rows: album.tracks.map((track) => ({ track, status: 'listened', playedAt: fallbackAt })), unmatched: [] };
  const byId = new Map(album.tracks.map((t) => [t.id, t]));
  const byTitle = new Map<string, AlbumTrack[]>();
  for (const t of album.tracks) byTitle.set(normalize(t.name), [...(byTitle.get(normalize(t.name)) ?? []), t]);
  const chosen = new Map<string, { status: ReviewStatus; playedAt: string | null }>();
  const unmatched: string[] = [];
  for (const proposed of p.tracks) {
    let track = proposed.spotify_track_id ? byId.get(proposed.spotify_track_id) : undefined;
    if (!track && proposed.title) {
      const same = byTitle.get(normalize(proposed.title)) ?? [];
      track = same.length === 1 ? same[0] : undefined;
    }
    if (!track) {
      unmatched.push(proposed.title ?? proposed.spotify_track_id ?? '?');
      continue;
    }
    const prior = chosen.get(track.id);
    // A track proposed twice keeps "listened" over "skipped".
    if (!prior || (prior.status === 'skipped' && proposed.status === 'listened'))
      chosen.set(track.id, { status: proposed.status, playedAt: proposed.played_at ?? fallbackAt });
  }
  return {
    rows: album.tracks.map((track) => ({ track, status: chosen.get(track.id)?.status ?? 'none', playedAt: chosen.get(track.id)?.playedAt ?? null })),
    unmatched,
  };
}

export interface ApplyResult { listened: number; skipped: number; keptListened: number }

export async function applyApproval(service: DigService, p: AlbumProposal, album: AlbumDetail, rows: PlannedTrack[]): Promise<ApplyResult> {
  const artistId = album.artists[0]?.id;
  if (!artistId) throw new Error('앨범 아티스트 정보를 확인할 수 없어요.');
  await service.rememberAlbum(album);
  const listened = rows.filter((r) => r.status === 'listened');
  for (const row of listened) {
    await service.addListen({
      id: eventIdFor(p.key, row.track.id), trackId: row.track.id, albumId: album.id, artistId,
      listenedAt: row.playedAt ?? fallbackPlayedAt(p), source: p.origin === 'conversation' ? 'manual' : 'spotify-sync',
    });
  }
  if (listened.length) await service.setStatuses(listened.map((r) => r.track.id), 'listened');
  const data = await service.repository.read();
  const skippable = rows.filter((r) => r.status === 'skipped' && statusForTrack(r.track.id, data) === 'none');
  if (skippable.length) await service.setStatuses(skippable.map((r) => r.track.id), 'skipped');
  return {
    listened: listened.length,
    skipped: skippable.length,
    keptListened: rows.filter((r) => r.status === 'skipped').length - skippable.length,
  };
}
