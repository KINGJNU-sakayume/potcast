import type { DigRepository } from './repository';
import { stableJson } from './service';
import {
  TABLES, assertRating, emptyDigData, membershipId, reviewId,
  type DigData, type DigTable, type PersonalReview, type ReleaseScope,
} from './types';

type Row = Record<string, unknown>;
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a record.');
  return value as Row;
};
const string = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Expected text.');
  return value;
};
const id = (value: unknown) => {
  const result = string(value);
  if (!result || result.length > 100_000) throw new Error('Invalid record ID.');
  return result;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new Error('Expected a boolean.');
  return value;
};
const number = (value: unknown, min = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new Error('Invalid number.');
  return value;
};
const integer = (value: unknown, min = 0) => {
  const n = number(value, min);
  if (!Number.isInteger(n)) throw new Error('Expected a whole number.');
  return n;
};
const date = (value: unknown): string => {
  const result = string(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error('Invalid ISO date.');
  return result;
};
const nullableDate = (value: unknown) => value === null ? null : date(value);
const optionalDate = (value: unknown) => value === undefined ? null : date(value);
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Expected a list.');
  return value;
};
const strings = (value: unknown) => array(value).map(string);
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T => {
  if (!values.includes(value as T)) throw new Error(`Expected ${values.join(', ')}.`);
  return value as T;
};
const groups = ['album', 'single', 'compilation', 'appears_on'] as const;
const albumTypes = ['album', 'single', 'compilation'] as const;
function scope(value: unknown, legacy = false): ReleaseScope {
  const row = object(value);
  return { album: bool(row.album), single: bool(row.single), compilation: bool(row.compilation), appears_on: legacy ? false : bool(row.appears_on) };
}
function images(value: unknown) {
  return array(value).map((value) => {
    const row = object(value);
    const url = string(row.url);
    if (!/^https?:\/\//.test(url)) throw new Error('Invalid image URL.');
    return { url, width: row.width === null ? null : integer(row.width), height: row.height === null ? null : integer(row.height) };
  });
}
function artists(value: unknown) {
  return array(value).map((value) => {
    const row = object(value);
    return { id: id(row.id), name: string(row.name), uri: string(row.uri) };
  });
}
const rating = (value: unknown) => {
  const result = value === null || value === undefined ? null : number(value);
  assertRating(result);
  return result;
};
function releaseDate(value: unknown): string | null {
  if (value === null) return null;
  const text = string(value);
  if (!/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(text)) throw new Error('Invalid release date.');
  return text;
}
function membership(value: unknown): DigData['memberships'][number] {
  const r = object(value);
  return {
    id: id(r.id), artistId: id(r.artistId), albumId: id(r.albumId), group: oneOf(r.group, groups),
    override: oneOf(r.override, ['auto', 'include', 'exclude']), studio: r.studio === null ? null : bool(r.studio),
  };
}

/** Whitelist every portable field; authentication, caches and unknown fields are never copied. */
function nativeData(value: unknown): DigData {
  const root = object(value);
  const data: DigData = {
    projects: array(root.projects).map((value) => {
      const r = object(value);
      return {
        id: id(r.id), name: string(r.name), images: images(r.images), genres: strings(r.genres),
        addedAt: date(r.addedAt), updatedAt: date(r.updatedAt), scope: scope(r.scope), studioOnly: bool(r.studioOnly),
        note: string(r.note), discographySyncedAt: nullableDate(r.discographySyncedAt), catalogueComplete: bool(r.catalogueComplete),
        origin: oneOf(r.origin, ['potcast', 'spottied']),
      };
    }),
    memberships: array(root.memberships).map(membership),
    releases: array(root.releases).map((value) => {
      const r = object(value);
      return {
        id: id(r.id), name: string(r.name), uri: string(r.uri), artists: artists(r.artists), images: images(r.images),
        albumType: oneOf(r.albumType, albumTypes), releaseDate: releaseDate(r.releaseDate),
        releaseDatePrecision: r.releaseDatePrecision === null ? null : oneOf(r.releaseDatePrecision, ['year', 'month', 'day'] as const),
        totalTracks: r.totalTracks === null ? null : integer(r.totalTracks), trackIds: strings(r.trackIds),
        tracksComplete: bool(r.tracksComplete), tracksSyncedAt: nullableDate(r.tracksSyncedAt),
      };
    }),
    tracks: array(root.tracks).map((value) => {
      const r = object(value);
      return { id: id(r.id), name: string(r.name), uri: string(r.uri), artists: artists(r.artists),
        durationMs: integer(r.durationMs), discNumber: integer(r.discNumber, 1), trackNumber: integer(r.trackNumber, 1),
        ...(r.explicit === undefined ? {} : { explicit: bool(r.explicit) }) };
    }),
    states: array(root.states).map((value) => {
      const r = object(value);
      return { id: id(r.id), status: oneOf(r.status, ['none', 'listened', 'skipped']), updatedAt: date(r.updatedAt) };
    }),
    events: array(root.events).map((value) => {
      const r = object(value);
      if (r.playbackVerified !== false) throw new Error('Listening duration cannot be verified by this backup.');
      return { id: id(r.id), trackId: id(r.trackId), albumId: id(r.albumId), artistId: id(r.artistId),
        listenedAt: date(r.listenedAt), source: oneOf(r.source, ['manual', 'spotify-sync']), playbackVerified: false };
    }),
    reviews: array(root.reviews).map((value) => {
      const r = object(value);
      return { id: id(r.id), kind: oneOf(r.kind, ['track', 'album']), subjectId: id(r.subjectId), rating: rating(r.rating),
        favoriteAt: nullableDate(r.favoriteAt), summary: string(r.summary), note: string(r.note), updatedAt: date(r.updatedAt) };
    }),
    completions: array(root.completions).map((value) => {
      const r = object(value);
      return { id: id(r.id), artistId: id(r.artistId), kind: oneOf(r.kind, ['reviewed', 'listened']),
        completedAt: date(r.completedAt), scope: scope(r.scope), studioOnly: bool(r.studioOnly),
        releaseIds: strings(r.releaseIds), trackIds: strings(r.trackIds), memberships: array(r.memberships).map(membership) };
    }),
  };
  validateRelations(data);
  return data;
}

export function validateRelations(data: DigData): void {
  for (const table of TABLES) {
    if (new Set(data[table].map((r) => r.id)).size !== data[table].length) throw new Error(`Duplicate IDs in ${table}.`);
  }
  const has = (table: DigTable, key: string) => data[table].some((r) => r.id === key);
  for (const m of data.memberships) {
    if (m.id !== membershipId(m.artistId, m.albumId) || !has('projects', m.artistId) || !has('releases', m.albumId)) throw new Error('Invalid release membership.');
  }
  for (const r of data.releases) {
    if (new Set(r.trackIds).size !== r.trackIds.length || r.trackIds.some((key) => !has('tracks', key))) throw new Error('Missing or duplicate release tracks.');
    if (r.tracksComplete && (r.totalTracks === null || r.trackIds.length !== r.totalTracks)) throw new Error('Incomplete track sequence marked complete.');
  }
  for (const r of data.states) if (!has('tracks', r.id)) throw new Error('A track state has no track.');
  for (const e of data.events) {
    if (!has('tracks', e.trackId) || !has('releases', e.albumId)) throw new Error('A listening event has missing catalogue references.');
  }
  for (const r of data.reviews) {
    if (r.id !== reviewId(r.kind, r.subjectId) || !has(r.kind === 'track' ? 'tracks' : 'releases', r.subjectId)) throw new Error('Invalid personal review reference.');
  }
  for (const c of data.completions) {
    if (!has('projects', c.artistId) || c.trackIds.some((key) => !has('tracks', key)) || c.releaseIds.some((key) => !has('releases', key))) throw new Error('Invalid completion snapshot.');
  }
}

/** Exact spottied schemaVersion=1 converter, with scope, IDs and original dates preserved. */
function legacyData(root: Row, exportedAt: string): DigData {
  const data = emptyDigData();
  const originalArtists = array(root.artists).map(object);
  for (const r of originalArtists) {
    data.projects.push({
      id: id(r.id), name: string(r.name), images: images(r.images), genres: strings(r.genres), addedAt: date(r.addedAt),
      updatedAt: exportedAt, scope: scope(r.scope, true), studioOnly: false, note: r.note === undefined ? '' : string(r.note),
      discographySyncedAt: nullableDate(r.discographySyncedAt), catalogueComplete: r.discographySyncedAt !== null, origin: 'spottied',
    });
  }
  const originalTracks = array(root.tracks).map(object);
  const legacyReview = (r: Row, kind: PersonalReview['kind']) => {
    if (r.rating === undefined && r.likedAt === undefined && r.note === undefined) return;
    data.reviews.push({ id: reviewId(kind, id(r.id)), kind, subjectId: id(r.id), rating: rating(r.rating),
      favoriteAt: optionalDate(r.likedAt), summary: '', note: r.note === undefined ? '' : string(r.note), updatedAt: exportedAt });
  };
  for (const r of array(root.albums).map(object)) {
    const artistId = id(r.artistId);
    const artist = data.projects.find((p) => p.id === artistId);
    if (!artist) throw new Error('Legacy album has no artist.');
    const albumId = id(r.id);
    const albumType = oneOf(r.albumGroup, albumTypes);
    const tracks = originalTracks.filter((t) => t.albumId === albumId)
      .sort((a, b) => integer(a.discNumber, 1) - integer(b.discNumber, 1) || integer(a.trackNumber, 1) - integer(b.trackNumber, 1));
    const released = releaseDate(r.releaseDate);
    const total = integer(r.totalTracks);
    const synced = nullableDate(r.tracksSyncedAt);
    data.releases.push({ id: albumId, name: string(r.name), uri: `spotify:album:${albumId}`,
      artists: [{ id: artistId, name: artist.name, uri: `spotify:artist:${artistId}` }], images: images(r.images),
      albumType, releaseDate: released, releaseDatePrecision: released?.length === 4 ? 'year' : released?.length === 7 ? 'month' : 'day',
      totalTracks: total, trackIds: tracks.map((t) => id(t.id)), tracksComplete: synced !== null && tracks.length === total, tracksSyncedAt: synced });
    data.memberships.push({ id: membershipId(artistId, albumId), artistId, albumId, group: albumType,
      override: bool(r.excluded) ? 'exclude' : 'auto', studio: null });
    legacyReview(r, 'album');
  }
  for (const r of originalTracks) {
    const artist = data.projects.find((p) => p.id === id(r.artistId));
    const album = data.releases.find((a) => a.id === id(r.albumId));
    if (!artist || !album) throw new Error('Legacy track has missing artist or album.');
    const trackId = id(r.id);
    data.tracks.push({ id: trackId, name: string(r.name), uri: `spotify:track:${trackId}`,
      artists: [{ id: artist.id, name: artist.name, uri: `spotify:artist:${artist.id}` }], durationMs: integer(r.durationMs),
      discNumber: integer(r.discNumber, 1), trackNumber: integer(r.trackNumber, 1) });
    data.states.push({ id: trackId, status: oneOf(r.status, ['none', 'listened', 'skipped']), updatedAt: exportedAt });
    legacyReview(r, 'track');
  }
  for (const r of array(root.listenEvents).map(object)) {
    data.events.push({ id: id(r.id), artistId: id(r.artistId), albumId: id(r.albumId), trackId: id(r.trackId),
      listenedAt: date(r.listenedAt), source: oneOf(r.source, ['manual', 'spotify-sync']), playbackVerified: false });
  }
  validateRelations(data);
  return data;
}

export interface ParsedBackup {
  source: 'potcast' | 'spottied';
  exportedAt: string;
  accountId: string | null;
  data: DigData;
}

export function parseBackup(text: string): ParsedBackup {
  if (text.length > 32 * 1024 * 1024) throw new Error('Backup exceeds 32 MB.');
  const root = object(JSON.parse(text));
  if (root.schemaVersion !== 1) throw new Error('Unsupported backup schema version.');
  const exportedAt = date(root.exportedAt);
  if (root.format === 'potcast-digging') {
    return { source: 'potcast', exportedAt, accountId: id(root.accountId), data: nativeData(root.data) };
  }
  if (root.format !== undefined) throw new Error('Unsupported backup format.');
  return { source: 'spottied', exportedAt, accountId: null, data: legacyData(root, exportedAt) };
}

export async function exportBackup(repository: DigRepository, accountId: string): Promise<string> {
  return repository.write(async () => JSON.stringify({ format: 'potcast-digging', schemaVersion: 1, accountId,
    exportedAt: new Date().toISOString(), data: nativeData(await repository.read()) }, null, 2));
}

export interface ImportEntry {
  key: string;
  table: DigTable;
  id: string;
  status: 'new' | 'identical' | 'conflict';
  before: string | null;
  incoming: string;
}
export interface ImportPlan {
  backup: ParsedBackup;
  entries: ImportEntry[];
}

export async function previewImport(repository: DigRepository, backup: ParsedBackup): Promise<ImportPlan> {
  const current = await repository.read();
  const entries = TABLES.flatMap((table) => backup.data[table].map((row) => {
    const existing = current[table].find((x) => x.id === row.id);
    const before = existing ? stableJson(existing) : null;
    const incoming = stableJson(row);
    return { key: `${table}:${row.id}`, table, id: row.id, before, incoming,
      status: before === null ? 'new' as const : before === incoming ? 'identical' as const : 'conflict' as const };
  }));
  return { backup, entries };
}

/** Only explicitly selected changes are applied; a stale preview aborts the entire transaction. */
export async function applyImport(repository: DigRepository, plan: ImportPlan, selected: ReadonlySet<string>): Promise<Record<DigTable, number>> {
  return repository.write(async () => {
    const before = await repository.read();
    const counts = Object.fromEntries(TABLES.map((t) => [t, 0])) as Record<DigTable, number>;
    for (const entry of plan.entries) {
      const old = before[entry.table].find((x) => x.id === entry.id);
      if ((old ? stableJson(old) : null) !== entry.before) throw new Error('Records changed after preview. Read the backup again before importing.');
      if (!selected.has(entry.key) || entry.status === 'identical') continue;
      const incoming = plan.backup.data[entry.table].find((r) => r.id === entry.id);
      if (!incoming || stableJson(incoming) !== entry.incoming) throw new Error('Import preview was modified.');
      await repository.rows(entry.table).put(incoming);
      counts[entry.table]++;
    }
    const after = await repository.read();
    nativeData(after); // Verify schema and referential integrity inside the transaction; any failure rolls everything back.
    for (const table of TABLES) {
      const added = plan.entries.filter((e) => e.table === table && e.status === 'new' && selected.has(e.key)).length;
      if (after[table].length !== before[table].length + added) throw new Error(`Import count verification failed for ${table}.`);
    }
    for (const entry of plan.entries.filter((e) => selected.has(e.key) && e.status !== 'identical')) {
      if (stableJson(after[entry.table].find((r) => r.id === entry.id)) !== entry.incoming) throw new Error(`Import field verification failed: ${entry.key}.`);
    }
    return counts;
  });
}
