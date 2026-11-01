import type { AlbumDetail, AlbumSummary, ArtistSummary, ReleaseGroup } from '../domain/types';
import type { DigRepository } from './db';
import { progressFor } from './progress';
import {
  DEFAULT_SCOPE, assertRating, membershipId, reviewId,
  type ArtistDigProject, type DigData, type DigRelease, type PersonalReview, type ReviewStatus,
} from './types';

export const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export function releaseSnapshot(album: AlbumSummary): DigRelease {
  return {
    id: album.id, name: album.name, uri: album.uri, artists: album.artists.map(({ id, name, uri }) => ({ id, name, uri })), images: album.images,
    albumType: album.albumType, releaseDate: album.releaseDate, releaseDatePrecision: album.releaseDatePrecision,
    totalTracks: album.totalTracks, trackIds: [], tracksComplete: false, tracksSyncedAt: null,
  };
}

export interface StatusUndo {
  before: Array<{ id: string; status: ReviewStatus }>;
  after: string;
  status: ReviewStatus;
}

/** Domain operations never call playback, Spotify auth, or editorial services. */
export class DigService {
  constructor(readonly repository: DigRepository, private readonly now = () => new Date().toISOString()) {}

  async start(artist: ArtistSummary): Promise<void> {
    await this.repository.write(async () => {
      if (await this.repository.rows('projects').get(artist.id)) return;
      const at = this.now();
      await this.repository.rows('projects').add({
        id: artist.id, name: artist.name, images: artist.images, genres: [], addedAt: at, updatedAt: at,
        scope: { ...DEFAULT_SCOPE }, studioOnly: true, note: '', discographySyncedAt: null,
        catalogueComplete: false, origin: 'potcast',
      });
    });
  }

  async configure(artistId: string, changes: Partial<Pick<ArtistDigProject, 'scope' | 'studioOnly' | 'note'>>): Promise<void> {
    await this.repository.write(async () => {
      const project = await this.repository.rows('projects').get(artistId);
      if (!project) throw new Error('Start digging first.');
      const scopeChanged = changes.scope && stableJson(changes.scope) !== stableJson(project.scope);
      await this.repository.rows('projects').put({ ...project, ...changes, updatedAt: this.now(), ...(scopeChanged ? { catalogueComplete: false } : {}) });
      await this.captureCompletions();
    });
  }

  async setMembership(id: string, override: 'auto' | 'include' | 'exclude', studio: boolean | null): Promise<void> {
    await this.repository.write(async () => {
      const member = await this.repository.rows('memberships').get(id);
      if (!member) throw new Error('Release membership is unavailable.');
      await this.repository.rows('memberships').put({ ...member, override, studio });
      await this.repository.rows('projects').update(member.artistId, { updatedAt: this.now() });
      await this.captureCompletions();
    });
  }

  private async remember(album: AlbumSummary | AlbumDetail): Promise<void> {
    const existing = await this.repository.rows('releases').get(album.id);
    const snapshot = { ...releaseSnapshot(album), ...(existing ? {
      trackIds: existing.trackIds, tracksComplete: existing.tracksComplete, tracksSyncedAt: existing.tracksSyncedAt,
    } : {}) };
    if ('tracks' in album) {
      snapshot.trackIds = album.tracks.map((t) => t.id);
      snapshot.tracksComplete = album.tracksComplete && album.totalTracks !== null && album.tracks.length === album.totalTracks;
      // Preserve migration dates when revisiting an unchanged release.
      snapshot.tracksSyncedAt = stableJson(existing?.trackIds) === stableJson(snapshot.trackIds) && existing?.tracksComplete === snapshot.tracksComplete
        ? existing?.tracksSyncedAt ?? null : snapshot.tracksComplete ? this.now() : null;
      await this.repository.rows('tracks').bulkPut(album.tracks.map((track) => ({
        id: track.id, name: track.name, uri: track.uri, artists: track.artists.map(({ id, name, uri }) => ({ id, name, uri })), durationMs: track.durationMs,
        discNumber: track.discNumber, trackNumber: track.trackNumber,
      })));
    }
    if (stableJson(existing) !== stableJson(snapshot)) await this.repository.rows('releases').put(snapshot);
  }

  async rememberAlbum(album: AlbumDetail): Promise<void> {
    await this.repository.write(async () => {
      await this.remember(album);
      await this.captureCompletions();
    });
  }

  async syncCatalogue(artistId: string, releases: Array<{ album: AlbumSummary | AlbumDetail; group: ReleaseGroup }>, complete: boolean): Promise<void> {
    await this.repository.write(async () => {
      const project = await this.repository.rows('projects').get(artistId);
      if (!project) return;
      for (const { album, group } of releases) {
        await this.remember(album);
        const id = membershipId(artistId, album.id);
        if (!await this.repository.rows('memberships').get(id)) {
          await this.repository.rows('memberships').add({ id, artistId, albumId: album.id, group, override: 'auto', studio: null });
        }
      }
      await this.repository.rows('projects').put({ ...project, catalogueComplete: complete, discographySyncedAt: this.now() });
      await this.captureCompletions();
    });
  }

  async setStatuses(ids: string[], status: ReviewStatus): Promise<StatusUndo> {
    if (!['none', 'listened', 'skipped'].includes(status)) throw new Error('Invalid review state.');
    return this.repository.write(async () => {
      const at = this.now();
      const before: StatusUndo['before'] = [];
      for (const id of new Set(ids)) {
        if (!await this.repository.rows('tracks').get(id)) throw new Error('Track details are unavailable.');
        const current = await this.repository.rows('states').get(id);
        if ((current?.status ?? 'none') === status) continue;
        before.push({ id, status: current?.status ?? 'none' });
        await this.repository.rows('states').put({ id, status, updatedAt: at });
      }
      if (before.length) {
        const affected = new Set(before.map((s) => s.id));
        const data = await this.repository.read();
        for (const project of data.projects) {
          if (data.memberships.some((m) => m.artistId === project.id && data.releases.some((r) => r.id === m.albumId && r.trackIds.some((id) => affected.has(id))))) {
            await this.repository.rows('projects').update(project.id, { updatedAt: at });
          }
        }
        await this.captureCompletions();
      }
      return { before, after: at, status };
    });
  }

  async undo(change: StatusUndo): Promise<void> {
    await this.repository.write(async () => {
      for (const row of change.before) {
        const current = await this.repository.rows('states').get(row.id);
        if (current?.updatedAt !== change.after || current.status !== change.status) {
          throw new Error('These tracks changed since the batch operation. Undo was cancelled.');
        }
      }
      for (const row of change.before) await this.repository.rows('states').put({ ...row, updatedAt: this.now() });
      // Listen events and immutable completion milestones are intentionally untouched.
    });
  }

  async saveReview(kind: PersonalReview['kind'], subjectId: string, changes: Pick<PersonalReview, 'rating' | 'favoriteAt' | 'summary' | 'note'>): Promise<void> {
    assertRating(changes.rating);
    await this.repository.write(async () => {
      const subject = await this.repository.rows(kind === 'track' ? 'tracks' : 'releases').get(subjectId);
      if (!subject) throw new Error('Load this release before editing your review.');
      await this.repository.rows('reviews').put({ ...changes, id: reviewId(kind, subjectId), kind, subjectId, updatedAt: this.now() });
    });
  }

  async addListen(event: Omit<DigData['events'][number], 'playbackVerified'>): Promise<void> {
    if (!event.id || !Number.isFinite(Date.parse(event.listenedAt))) throw new Error('A valid event ID and date are required.');
    await this.repository.write(async () => {
      if (!await this.repository.rows('tracks').get(event.trackId) || !await this.repository.rows('releases').get(event.albumId)) throw new Error('Track details are unavailable.');
      const value = { ...event, playbackVerified: false as const };
      const old = await this.repository.rows('events').get(event.id);
      if (old && stableJson(old) !== stableJson(value)) throw new Error('A different event already uses this ID.');
      if (!old) await this.repository.rows('events').add(value);
    });
  }

  private async captureCompletions(): Promise<void> {
    const data = await this.repository.read();
    for (const project of data.projects) {
      const progress = progressFor(project, data);
      for (const kind of ['reviewed', 'listened'] as const) {
        if (kind === 'reviewed' ? !progress.reviewComplete : !progress.allListened) continue;
        const snapshot = {
          artistId: project.id, kind, scope: project.scope, studioOnly: project.studioOnly,
          releaseIds: progress.releases.map((r) => r.id).sort(), trackIds: [...progress.trackIds].sort(),
          memberships: data.memberships.filter((m) => m.artistId === project.id).sort((a, b) => a.id.localeCompare(b.id)),
        };
        // The complete scope itself is the key: no lossy hash and no replacement of old completion dates.
        const id = stableJson(snapshot);
        if (!await this.repository.rows('completions').get(id)) {
          await this.repository.rows('completions').add({ ...snapshot, id, completedAt: this.now() });
        }
      }
    }
  }
}
