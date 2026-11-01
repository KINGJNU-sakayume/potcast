import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AlbumDetail, ArtistSummary } from '../domain/types';
import { applyImport, exportBackup, parseBackup, previewImport } from './backup';
import { DigDatabase } from './db';
import { historyByDay, progressFor } from './progress';
import { offlineAlbum, offlineArtist, offlineDiscography } from './offline';
import { DigService } from './service';
import { emptyDigData } from './types';

const at = '2026-06-01T00:00:00.000Z';
const artist: ArtistSummary = { id: 'artist-a', name: 'Artist', uri: 'spotify:artist:artist-a', images: [] };
const album = (id = 'album-a', name = 'Original', ids = ['one', 'two']): AlbumDetail => ({
  id, name, uri: `spotify:album:${id}`, artists: [artist], images: [], albumType: 'album', releaseDate: '2000',
  releaseDatePrecision: 'year', totalTracks: ids.length, totalDurationMs: 400_000, label: null, copyrights: [], tracksComplete: true,
  tracks: ids.map((id, i) => ({ id, name: `Song ${i}`, uri: `spotify:track:${id}`, artists: [artist],
    durationMs: 200_000 + i * 10_000, discNumber: 1, trackNumber: i + 1, explicit: false, isPlayable: true })),
});
let db: DigDatabase;
let service: DigService;
let tick: number;
beforeEach(() => {
  db = new DigDatabase(`test-${crypto.randomUUID()}`);
  tick = 0;
  service = new DigService(db, () => new Date(Date.parse(at) + tick++).toISOString());
});
afterEach(async () => { await db.delete(); });
async function seed() {
  await service.start(artist);
  await service.syncCatalogue(artist.id, [{ album: album(), group: 'album' }], true);
}
async function progress() { const data = await db.read(); return progressFor(data.projects[0]!, data); }

describe('personal digging policy', () => {
  it('separates review progress from listening and never treats skips or state toggles as play events', async () => {
    await seed();
    await service.setStatuses(['one'], 'listened');
    await service.setStatuses(['two'], 'skipped');
    expect(await progress()).toMatchObject({ reviewRatio: 1, listenRatio: 0.5, reviewComplete: true, allListened: false });
    expect((await db.read()).events).toEqual([]);
    await service.setStatuses(['one'], 'listened');
    expect((await db.read()).completions).toHaveLength(1);
    const event = { id: 'event-1', trackId: 'one', albumId: 'album-a', artistId: artist.id, source: 'manual' as const, listenedAt: at };
    await service.addListen(event);
    await service.addListen(event);
    await service.addListen({ ...event, id: 'replay', listenedAt: '2026-06-02T00:00:00Z' });
    await service.setStatuses(['one'], 'none');
    expect((await db.read()).events).toHaveLength(2);
    expect((await db.read()).events.every((e) => e.playbackVerified === false)).toBe(true);
  });

  it('starts with studio albums and supports manual exceptions without changing the discography', async () => {
    await seed();
    const live = album('live', 'Live in Tokyo');
    await service.syncCatalogue(artist.id, [{ album: live, group: 'album' }, { album: { ...album('single'), albumType: 'single' }, group: 'single' }], true);
    expect((await db.read()).projects[0]).toMatchObject({ scope: { album: true, single: false, compilation: false, appears_on: false }, studioOnly: true });
    expect((await progress()).releases.map((r) => r.id)).toEqual(['album-a']);
    await service.setMembership(`${artist.id}:live`, 'include', true);
    expect((await progress()).releases.map((r) => r.id)).toContain('live');
    await service.setMembership(`${artist.id}:album-a`, 'exclude', null);
    expect((await progress()).releases.map((r) => r.id)).not.toContain('album-a');
  });

  it('does not complete a partial sequence, unknown total, or partially discovered artist', async () => {
    await service.start(artist);
    await service.syncCatalogue(artist.id, [{ album: { ...album(), totalTracks: 3, tracksComplete: false }, group: 'album' }], true);
    await service.setStatuses(['one', 'two'], 'listened');
    expect(await progress()).toMatchObject({ known: false, total: 3, reviewComplete: false, allListened: false });
    await service.syncCatalogue(artist.id, [{ album: { ...album(), totalTracks: null }, group: 'album' }], true);
    expect((await progress()).reviewRatio).toBeLessThan(1);
    await service.syncCatalogue(artist.id, [{ album: album(), group: 'album' }], false);
    expect((await progress()).reviewComplete).toBe(false);
    expect((await db.read()).completions).toHaveLength(0);
  });

  it('deduplicates repeated IDs and verified editions with changed IDs, but not unrelated same-title works', async () => {
    await seed();
    await service.syncCatalogue(artist.id, [
      { album: album('deluxe', 'Original (Deluxe)', ['new-one', 'new-two', 'bonus']), group: 'album' },
      { album: { ...album('unrelated', 'Original', ['different-one', 'different-two']), tracks: album('x', 'x', ['different-one', 'different-two']).tracks.map((t) => ({ ...t, name: `Different ${t.name}`, durationMs: 120_000 })) }, group: 'album' },
    ], true);
    await service.setStatuses(['new-one'], 'listened');
    expect(await progress()).toMatchObject({ total: 4, listened: 1, totalAlbums: 2 });
    await service.setMembership(`${artist.id}:deluxe`, 'include', null);
    expect((await progress()).total).toBe(5);
    // The same Spotify ID is not counted a second time on a different release.
    await service.syncCatalogue(artist.id, [{ album: album('collection', 'Collection'), group: 'compilation' }], true);
    await service.setMembership(`${artist.id}:collection`, 'include', null);
    expect((await progress()).total).toBe(5);
  });

  it('preserves completion dates and the original scope when a new album is discovered', async () => {
    await seed();
    await service.setStatuses(['one', 'two'], 'listened');
    const milestones = (await db.read()).completions;
    expect(milestones.map((m) => m.kind).sort()).toEqual(['listened', 'reviewed']);
    await service.syncCatalogue(artist.id, [{ album: { ...album('new', 'New record', ['three', 'four']), tracks: album('new', 'New', ['three', 'four']).tracks.map((t) => ({ ...t, name: `New ${t.name}` })) }, group: 'album' }], true);
    expect(await progress()).toMatchObject({ total: 4, reviewed: 2, reviewComplete: false });
    expect((await db.read()).completions).toEqual(milestones);
    expect(milestones[0]!.releaseIds).toEqual(['album-a']);
  });

  it('shares the latest explicit state across verified editions, including resets, but keeps unrelated recordings separate', async () => {
    await seed();
    await service.syncCatalogue(artist.id, [{ album: album('deluxe', 'Original (Deluxe)', ['new-one', 'new-two']), group: 'album' }], true);
    await service.setStatuses(['new-one'], 'listened');
    expect((await progress()).listened).toBe(1);
    await service.setStatuses(['one'], 'skipped');
    expect(await progress()).toMatchObject({ listened: 0, reviewed: 1 });
    await service.setStatuses(['new-one'], 'none');
    expect((await progress()).reviewed).toBe(0);
    // Equal title, credits and duration on a different work are insufficient evidence of identity.
    await service.syncCatalogue(artist.id, [{ album: album('unrelated', 'Another work', ['other-one', 'other-two']), group: 'album' }], true);
    expect((await progress()).total).toBe(4);
    await service.setStatuses(['other-one'], 'listened');
    expect((await progress()).listened).toBe(1);
  });

  it('rejects undo after an alias was edited and orders assertions even when the clock has not advanced', async () => {
    await seed();
    await service.syncCatalogue(artist.id, [{ album: album('deluxe', 'Original (Deluxe)', ['new-one', 'new-two']), group: 'album' }], true);
    const fixedClock = new DigService(db, () => at);
    const change = await fixedClock.setStatuses(['one'], 'listened');
    await fixedClock.setStatuses(['new-one'], 'skipped');
    expect((await progress()).listened).toBe(0);
    await expect(fixedClock.undo(change)).rejects.toThrow('changed');
    const undo = await fixedClock.setStatuses(['one'], 'listened');
    await fixedClock.undo(undo);
    expect(await progress()).toMatchObject({ listened: 0, reviewed: 1 });
  });

  it('reconstructs offline album and artist views from stored snapshots without claiming playback availability', async () => {
    await seed();
    await service.setStatuses(['one'], 'listened');
    const data = await db.read();
    expect(offlineAlbum('album-a', data)).toMatchObject({ name: 'Original', tracksComplete: true, tracks: [{ id: 'one', isPlayable: false }, { id: 'two', isPlayable: false }] });
    expect(offlineArtist(artist.id, data)).toMatchObject({ name: 'Artist', uri: artist.uri });
    expect(offlineDiscography(artist.id, 'album', data)?.releases).toHaveLength(1);
    expect(offlineAlbum('unknown', data)).toBeUndefined();
  });

  it('approves recent plays atomically, deduplicating by track and date even when a legacy event has another ID', async () => {
    await seed();
    const event = { id: 'legacy-event-id', trackId: 'one', albumId: 'album-a', artistId: artist.id, source: 'manual' as const, listenedAt: at };
    await service.addListen(event);
    expect(await service.approveRecent([{ ...event, id: 'spotify-event-id', source: 'spotify-sync' }])).toBe(0);
    const next = { ...event, id: 'next-play', listenedAt: '2026-06-02T00:00:00Z' };
    expect(await service.approveRecent([next, next])).toBe(1);
    expect(await service.approveRecent([next])).toBe(0);
    expect(await progress()).toMatchObject({ listened: 1 });
    expect((await db.read()).events).toHaveLength(2);
    await expect(service.approveRecent([{ ...event, id: 'okay', trackId: 'two', listenedAt: '2026-06-03T00:00:00Z' }, { ...event, id: 'broken', trackId: 'missing' }])).rejects.toThrow('unavailable');
    expect((await db.read()).events).toHaveLength(2);
    expect((await progress()).listened).toBe(1);
  });

  it('undoes only the batch state change and preserves events and other personal fields', async () => {
    await seed();
    await service.saveReview('track', 'one', { rating: 4.5, favoriteAt: at, summary: 'A line', note: 'Private' });
    const undo = await service.setStatuses(['one', 'two', 'one'], 'listened');
    await service.addListen({ id: 'event', trackId: 'one', albumId: 'album-a', artistId: artist.id, listenedAt: at, source: 'manual' });
    await service.undo(undo);
    expect((await progress()).reviewed).toBe(0);
    expect((await db.read()).events).toHaveLength(1);
    expect((await db.read()).reviews[0]!.rating).toBe(4.5);
    const other = await service.setStatuses(['one'], 'skipped');
    await service.setStatuses(['one'], 'listened');
    await expect(service.undo(other)).rejects.toThrow('changed');
    expect((await progress()).listened).toBe(1);
  });

  it('supports independent half-star reviews and enforces rating bounds', async () => {
    await seed();
    await service.saveReview('track', 'one', { rating: 0.5, favoriteAt: at, summary: '', note: '' });
    await service.saveReview('album', 'album-a', { rating: 5, favoriteAt: null, summary: '', note: '' });
    await expect(service.saveReview('track', 'one', { rating: 1.2, favoriteAt: null, summary: '', note: '' })).rejects.toThrow('half-star');
    expect((await db.read()).reviews.map((r) => r.rating)).toEqual([5, 0.5]);
  });

  it('isolates two accounts and preview in different databases', async () => {
    await seed();
    const other = new DigDatabase('different-account');
    const preview = new DigDatabase('preview');
    expect(await other.read()).toEqual(emptyDigData());
    expect(await preview.read()).toEqual(emptyDigData());
    await other.delete(); await preview.delete();
  });

  it('groups dated events in the listener’s time zone', () => {
    const e = { id: 'a', trackId: 'one', albumId: 'album-a', artistId: artist.id, listenedAt: '2026-06-01T16:00:00Z', source: 'manual' as const, playbackVerified: false as const };
    expect([...historyByDay([e], 'Asia/Seoul').keys()]).toEqual(['2026-06-02']);
  });
});

function legacy() {
  return { schemaVersion: 1, exportedAt: at,
    artists: [{ id: artist.id, name: 'Artist', images: [], genres: ['rock'], addedAt: at,
      scope: { album: true, single: true, compilation: true }, discographySyncedAt: at, note: 'Artist note' }],
    albums: [{ id: 'album-a', artistId: artist.id, name: 'Original', albumGroup: 'album', releaseDate: '2000', totalTracks: 1,
      images: [], excluded: true, tracksSyncedAt: at, rating: 4.5, likedAt: at, note: 'Album note' }],
    tracks: [{ id: 'one', albumId: 'album-a', artistId: artist.id, name: 'Song', discNumber: 1, trackNumber: 1,
      durationMs: 200_000, status: 'skipped', rating: 0.5, likedAt: at, note: 'Track note' }],
    listenEvents: [{ id: 'original-uuid', trackId: 'one', albumId: 'album-a', artistId: artist.id, listenedAt: at, source: 'spotify-sync' }],
    accessToken: 'must-not-import', recentlyPlayedCache: [{ id: 'must-not-import' }],
  };
}

describe('portable backups and migration safety', () => {
  it('preserves legacy scope, exclusions, reviews, notes, event IDs and dates; imports idempotently without auth/cache', async () => {
    const parsed = parseBackup(JSON.stringify(legacy()));
    expect(parsed.data.projects[0]).toMatchObject({ studioOnly: false, scope: { single: true, compilation: true }, note: 'Artist note' });
    expect(parsed.data.memberships[0]!.override).toBe('exclude');
    expect(parsed.data.reviews.map((r) => r.note)).toEqual(['Album note', 'Track note']);
    expect(parsed.data.events[0]).toMatchObject({ id: 'original-uuid', listenedAt: at });
    const plan = await previewImport(db, parsed);
    expect((await db.read()).projects).toHaveLength(0); // Preview never writes.
    await applyImport(db, plan, new Set(plan.entries.map((e) => e.key)));
    const again = await previewImport(db, parsed);
    expect(again.entries.every((e) => e.status === 'identical')).toBe(true);
    expect(Object.values(await applyImport(db, again, new Set(again.entries.map((e) => e.key)))).every((n) => n === 0)).toBe(true);
    const text = await exportBackup(db, 'account');
    expect(text).not.toContain('must-not-import');
    expect(parseBackup(text).data).toEqual(await db.read());
    expect((await db.read()).completions).toHaveLength(0); // Never invent an old completion date.
  });

  it('retains conflicts unless individually selected and rejects a stale preview', async () => {
    await seed();
    const incoming = parseBackup(await exportBackup(db, 'account'));
    incoming.data.projects[0]!.note = 'Imported edit';
    const plan = await previewImport(db, incoming);
    expect(plan.entries.filter((e) => e.status === 'conflict')).toHaveLength(1);
    await applyImport(db, plan, new Set());
    expect((await db.read()).projects[0]!.note).toBe('');
    const selected = new Set(plan.entries.filter((e) => e.status === 'conflict').map((e) => e.key));
    await applyImport(db, plan, selected);
    expect((await db.read()).projects[0]!.note).toBe('Imported edit');
    await expect(applyImport(db, plan, selected)).rejects.toThrow('changed after preview');
  });

  it('rolls back all writes if selected rows would leave broken relations', async () => {
    const plan = await previewImport(db, parseBackup(JSON.stringify(legacy())));
    const selected = new Set(plan.entries.filter((e) => e.table !== 'tracks').map((e) => e.key));
    await expect(applyImport(db, plan, selected)).rejects.toThrow('tracks');
    expect(await db.read()).toEqual(emptyDigData());
  });

  it('rolls back partial writes on storage failure', async () => {
    const plan = await previewImport(db, parseBackup(JSON.stringify(legacy())));
    const selected = new Set(plan.entries.map((e) => e.key));
    db.table('reviews').hook('creating', () => { throw new Error('Simulated quota failure'); });
    await expect(applyImport(db, plan, selected)).rejects.toThrow('quota');
    expect(await db.read()).toEqual(emptyDigData());
  });

  it('rejects malformed schemas, duplicates, invalid ratings and missing references before preview', () => {
    const bad = legacy(); bad.tracks[0]!.rating = 4.7;
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('half-star');
    const duplicate = legacy(); duplicate.artists.push(duplicate.artists[0]!);
    expect(() => parseBackup(JSON.stringify(duplicate))).toThrow('Duplicate IDs');
    const orphan = legacy(); orphan.albums = [];
    expect(() => parseBackup(JSON.stringify(orphan))).toThrow('missing artist or album');
    expect(() => parseBackup('{"schemaVersion":99}')).toThrow('version');
  });
});
