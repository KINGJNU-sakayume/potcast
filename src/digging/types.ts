import type { AlbumType, ArtistRef, ImageRef, ReleaseGroup } from '../domain/types';

export type ReviewStatus = 'none' | 'listened' | 'skipped';
export type ReleaseScope = Record<ReleaseGroup, boolean>;

export interface ArtistDigProject {
  id: string;
  name: string;
  images: ImageRef[];
  genres: string[];
  addedAt: string;
  updatedAt: string;
  scope: ReleaseScope;
  studioOnly: boolean;
  note: string;
  discographySyncedAt: string | null;
  /** All enabled groups must finish loading before completion is possible. */
  catalogueComplete: boolean;
  origin: 'potcast' | 'spottied';
}

export interface ReleaseMembership {
  id: string;
  artistId: string;
  albumId: string;
  group: ReleaseGroup;
  override: 'auto' | 'include' | 'exclude';
  studio: boolean | null;
}

/** Local catalogue snapshots permit recording offline; no Spotify transport objects or tokens. */
export interface DigRelease {
  id: string;
  name: string;
  uri: string;
  artists: ArtistRef[];
  images: ImageRef[];
  albumType: AlbumType;
  releaseDate: string | null;
  releaseDatePrecision: 'year' | 'month' | 'day' | null;
  totalTracks: number | null;
  trackIds: string[];
  tracksComplete: boolean;
  tracksSyncedAt: string | null;
}

export interface DigTrack {
  id: string;
  name: string;
  uri: string;
  artists: ArtistRef[];
  durationMs: number;
  discNumber: number;
  trackNumber: number;
  explicit?: boolean;
}

/** Current assertion only. Changing it never creates or removes a listen event. */
export interface TrackReviewState {
  id: string;
  status: ReviewStatus;
  updatedAt: string;
}

export interface ListenEvent {
  id: string;
  trackId: string;
  albumId: string;
  artistId: string;
  listenedAt: string;
  source: 'manual' | 'spotify-sync';
  /** Manual records and recent-play approvals do not verify listening duration. */
  playbackVerified: false;
}

export interface PersonalReview {
  id: string;
  kind: 'track' | 'album';
  subjectId: string;
  rating: number | null;
  favoriteAt: string | null;
  summary: string;
  note: string;
  updatedAt: string;
}

export interface DigCompletion {
  id: string;
  artistId: string;
  kind: 'reviewed' | 'listened';
  completedAt: string;
  scope: ReleaseScope;
  studioOnly: boolean;
  releaseIds: string[];
  trackIds: string[];
  memberships: ReleaseMembership[];
}

export interface DigData {
  projects: ArtistDigProject[];
  memberships: ReleaseMembership[];
  releases: DigRelease[];
  tracks: DigTrack[];
  states: TrackReviewState[];
  events: ListenEvent[];
  reviews: PersonalReview[];
  completions: DigCompletion[];
}

export const TABLES = ['projects', 'memberships', 'releases', 'tracks', 'states', 'events', 'reviews', 'completions'] as const;
export type DigTable = (typeof TABLES)[number];
export const emptyDigData = (): DigData => ({ projects: [], memberships: [], releases: [], tracks: [], states: [], events: [], reviews: [], completions: [] });
export const DEFAULT_SCOPE: ReleaseScope = { album: true, single: false, compilation: false, appears_on: false };
export const membershipId = (artistId: string, albumId: string) => `${artistId}:${albumId}`;
export const reviewId = (kind: PersonalReview['kind'], id: string) => `${kind}:${id}`;

export function assertRating(rating: number | null): void {
  if (rating !== null && (!Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2))) {
    throw new Error('Rating must be 0.5–5 in half-star steps.');
  }
}
