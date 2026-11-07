import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AlbumDetail, AlbumSummary, ArtistSummary, TrackIdentity } from '../domain/types';
import { DigDatabase } from '../digging/db';
import { statusForTrack } from '../digging/progress';
import { DigService } from '../digging/service';
import { applyApproval, applyApproved, autoReady, planTracks, resolveAlbum } from './approve';
import {
  beginConnect, CALLBACK_KEY, CALLBACK_URL, CLIENT_ID, completeStoredCallback, connectAvailable, disconnect, eventIdFor,
  isConnected, LIFEHUB_ORIGIN, parseProposal, autoApplyEnabled, setAutoApply, receipts, rejectLocally, rememberReceipt, RESOURCE, sync, type AlbumProposal, type Deps,
} from './remote';

/* ---------- synthetic fixtures only ---------- */

const ID = (c: string) => c.repeat(22);
const ALBUM_ID = ID('A');
const T1 = ID('a');
const T2 = ID('b');
const T3 = ID('c');
const artist: ArtistSummary = { id: ID('R'), name: 'Synthetic Artist', uri: `spotify:artist:${ID('R')}`, images: [] };
const album: AlbumDetail = {
  id: ALBUM_ID, name: 'Imaginary Album', uri: `spotify:album:${ALBUM_ID}`, artists: [artist], images: [], albumType: 'album',
  releaseDate: '2020', releaseDatePrecision: 'year', totalTracks: 3, totalDurationMs: 600_000, label: null, copyrights: [], tracksComplete: true,
  tracks: [T1, T2, T3].map((id, i) => ({ id, name: ['First Song', 'Second Song (2020 Remaster)', 'Third Song'][i]!, uri: `spotify:track:${id}`,
    artists: [artist], durationMs: 200_000, discNumber: 1, trackNumber: i + 1, explicit: false, isPlayable: true })),
};
const KEY = 'claude:mcp-' + 'f'.repeat(40);

function candidate(payload: Record<string, unknown>, key = KEY) {
  const [source, idem] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)];
  return { key, candidate: { schema_version: 1, candidate_type: 'album_listening', source, idempotency_key: idem, created_at: '2026-11-01T10:00:00Z', payload } };
}
const proposal = (payload: Record<string, unknown>) => parseProposal(candidate(payload))!;

function memory(): Deps['storage'] {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
interface Call { url: string; init?: RequestInit }
function makeDeps(handler: (url: string, init?: RequestInit) => Response, now = 1_000_000): Deps & { calls: Call[] } {
  const calls: Call[] = [];
  let n = 0;
  return {
    calls, storage: memory(), session: memory(), now: () => now,
    random: (len) => new Uint8Array(len).fill(++n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return handler(url, init);
    }) as typeof fetch,
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokenResponse = () => json({ access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', token_type: 'Bearer', expires_in: 3600 });

describe('parseProposal mirrors the hub contract', () => {
  it('accepts whole albums and track lists, normalising fields', () => {
    expect(proposal({ artist: 'Synthetic Artist', album: 'Imaginary Album', origin: 'conversation', whole_album: true, listened_on: '2026-10-31' }))
      .toMatchObject({ key: KEY, wholeAlbum: true, tracks: [], listenedOn: '2026-10-31', origin: 'conversation' });
    expect(proposal({ artist: 'x', album: 'y', origin: 'spotify_history', spotify_album_id: ALBUM_ID,
      tracks: [{ spotify_track_id: T1, status: 'listened', played_at: '2026-10-30T12:00:00Z' }] }))
      .toMatchObject({ spotifyAlbumId: ALBUM_ID, wholeAlbum: false, tracks: [{ spotify_track_id: T1, status: 'listened' }] });
  });

  it('rejects anything outside the contract', () => {
    const base = { artist: 'x', album: 'y', origin: 'conversation', whole_album: true };
    const bad: unknown[] = [
      candidate({ ...base, extra: 1 }),
      candidate({ ...base, tracks: [{ title: 't', status: 'listened' }] }), // both whole_album and tracks
      candidate({ artist: 'x', album: 'y', origin: 'conversation' }), // neither
      candidate({ artist: 'x', album: 'y', origin: 'spotify_history', whole_album: true }), // history needs tracks
      candidate({ ...base, listened_on: '2026-02-30' }),
      candidate({ ...base, spotify_album_id: 'short' }),
      candidate({ artist: 'x', album: 'y', origin: 'conversation', tracks: [{ status: 'listened' }] }),
      candidate({ artist: 'x', album: 'y', origin: 'conversation', tracks: [{ title: 't', status: 'maybe' }] }),
      { ...candidate(base), key: 'claude:mcp-' + 'e'.repeat(40) }, // key does not match source + idempotency key
      { key: KEY, candidate: { ...candidate(base).candidate, candidate_type: 'memory' } },
    ];
    for (const item of bad) expect(parseProposal(item)).toBeNull();
  });
});

describe('Life Hub Spotify collection', () => {
  const sync = { artist: 'Synthetic Artist', album: 'Imaginary Album', origin: 'spotify_sync', spotify_album_id: ALBUM_ID, listened_on: '2026-10-30',
    tracks: [{ title: 'First Song', spotify_track_id: T1, status: 'listened', played_at: '2026-10-30T12:00:00Z' }] };
  const KEY_SYNC = `spotify:spsync-${ALBUM_ID}-1793000000000`;

  it('accepts spotify_sync only from the spotify source, with album and track IDs', () => {
    expect(parseProposal(candidate(sync, KEY_SYNC))).toMatchObject({ key: KEY_SYNC, origin: 'spotify_sync', spotifyAlbumId: ALBUM_ID });
    expect(parseProposal(candidate(sync))).toBeNull(); // claude: source
    expect(parseProposal(candidate({ artist: 'x', album: 'y', origin: 'conversation', whole_album: true }, KEY_SYNC))).toBeNull();
    expect(parseProposal(candidate({ ...sync, spotify_album_id: undefined }, KEY_SYNC))).toBeNull();
    expect(parseProposal(candidate({ ...sync, tracks: [{ title: 'First Song', status: 'listened' }] }, KEY_SYNC))).toBeNull();
  });
});

describe('connection', () => {
  it('only connects from the deployed app, never the preview', () => {
    expect(connectAvailable({ origin: 'https://kingjnu-sakayume.github.io', pathname: '/potcast/' })).toBe(true);
    expect(connectAvailable({ origin: 'https://kingjnu-sakayume.github.io', pathname: '/potcast/preview/' })).toBe(false);
    expect(connectAvailable({ origin: 'http://localhost:5173', pathname: '/' })).toBe(false);
  });

  it('PKCE authorize URL, then the callback page result is exchanged once', async () => {
    const deps = makeDeps((url) => url.endsWith('/oauth/token') ? tokenResponse() : json({}, 404));
    const url = new URL(await beginConnect(deps));
    expect(url.origin + url.pathname).toBe(LIFEHUB_ORIGIN + '/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK_URL, scope: 'potcast:inbox potcast:board', resource: RESOURCE, code_challenge_method: 'S256',
    });
    const state = url.searchParams.get('state')!;

    expect(await completeStoredCallback(deps)).toBe(false); // nothing handed over yet
    deps.session.setItem(CALLBACK_KEY, `?code=c1&state=${state}&iss=${encodeURIComponent(LIFEHUB_ORIGIN)}`);
    expect(await completeStoredCallback(deps)).toBe(true);
    const body = new URLSearchParams(String(deps.calls[0]!.init!.body));
    expect(Object.fromEntries(body)).toMatchObject({ grant_type: 'authorization_code', code: 'c1', redirect_uri: CALLBACK_URL, resource: RESOURCE, client_id: CLIENT_ID });
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isConnected(deps)).toBe(true);
    expect(deps.session.getItem(CALLBACK_KEY)).toBeNull();

    disconnect(deps);
    expect(isConnected(deps)).toBe(false);
  });

  it('refuses a callback with the wrong state or issuer', async () => {
    const deps = makeDeps(() => tokenResponse());
    const state = new URL(await beginConnect(deps)).searchParams.get('state')!;
    deps.session.setItem(CALLBACK_KEY, `?code=c1&state=${state}&iss=${encodeURIComponent('https://evil.example')}`);
    await expect(completeStoredCallback(deps)).rejects.toMatchObject({ kind: 'state' });
    await beginConnect(deps);
    deps.session.setItem(CALLBACK_KEY, '?code=c1&state=forged');
    await expect(completeStoredCallback(deps)).rejects.toMatchObject({ kind: 'state' });
    expect(deps.calls).toHaveLength(0);
    expect(isConnected(deps)).toBe(false);
  });
});

describe('sync', () => {
  async function connected(handler: (url: string, init?: RequestInit) => Response) {
    const deps = makeDeps((url, init) => url.endsWith('/oauth/token') ? tokenResponse() : handler(url, init));
    const state = new URL(await beginConnect(deps)).searchParams.get('state')!;
    deps.session.setItem(CALLBACK_KEY, `?code=c&state=${state}`);
    await completeStoredCallback(deps);
    deps.calls.length = 0;
    return deps;
  }

  it('fetches valid pending proposals and drops malformed ones', async () => {
    const deps = await connected(() => json({ candidates: [
      candidate({ artist: 'x', album: 'y', origin: 'conversation', whole_album: true }),
      candidate({ artist: 'x', album: 'y', origin: 'conversation' }, 'claude:mcp-' + 'g'.repeat(40)),
    ] }));
    const result = await sync({ events: [] }, deps);
    expect(result.proposals.map((p) => p.key)).toEqual([KEY]);
    expect(deps.calls[0]!.url).toBe(LIFEHUB_ORIGIN + '/potcast/v1/candidates?status=open&limit=100');
    expect((deps.calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer access-synthetic');
  });

  it('reports receipts (also rebuilt from listen events) and rejections once, hiding decided proposals', async () => {
    const other = 'claude:mcp-' + 'h'.repeat(40);
    const rejected = 'claude:mcp-' + 'i'.repeat(40);
    const whole = { artist: 'x', album: 'y', origin: 'conversation', whole_album: true };
    const deps = await connected((url, init) => url.includes('/candidates')
      ? json({ candidates: [candidate(whole), candidate(whole, rejected)] })
      : url.endsWith('/receipts') && String(init?.body).includes(other) ? json({ error: 'conflict' }, 409) : json({ ok: true }));
    rememberReceipt(KEY, ALBUM_ID, deps);
    rejectLocally(rejected, deps);
    const events = [{ id: eventIdFor(other, T1), trackId: T1, albumId: ALBUM_ID, artistId: artist.id, listenedAt: '2026-11-01T00:00:00Z', source: 'manual' as const, playbackVerified: false as const }];
    expect(receipts({ events }, deps).map((r) => r.key).sort()).toEqual([KEY, other].sort());

    const first = await sync({ events }, deps);
    expect(first).toMatchObject({ receiptsSent: 1, rejectionsSent: 1, conflicts: 1, proposals: [] });
    const posted = deps.calls.filter((c) => c.init?.method === 'POST').map((c) => JSON.parse(String(c.init!.body)));
    expect(posted).toEqual(expect.arrayContaining([
      { key: KEY, entity_type: 'album_listening', entity_id: ALBUM_ID },
      { key: other, entity_type: 'album_listening', entity_id: ALBUM_ID },
      { key: rejected },
    ]));
    deps.calls.length = 0;
    await sync({ events }, deps);
    expect(deps.calls.filter((c) => c.init?.method === 'POST')).toHaveLength(0);
  });

  it('a revoked connection reads as not connected', async () => {
    const deps = await connected(() => json({ error: 'invalid_token' }, 401));
    await expect(sync({ events: [] }, deps)).rejects.toMatchObject({ kind: 'not_connected' });
    expect(isConnected(deps)).toBe(false);
  });
});

/* ---------- approval ---------- */

const summary = (a: AlbumDetail, patch: Partial<AlbumSummary> = {}): AlbumSummary => {
  const { id, uri, name, artists, images, albumType, releaseDate, releaseDatePrecision, totalTracks } = a;
  return { id, uri, name, artists, images, albumType, releaseDate, releaseDatePrecision, totalTracks, ...patch };
};
function catalogue(results: AlbumSummary[] = [summary(album)]) {
  const calls: string[] = [];
  return {
    calls,
    getAlbum: async (id: string) => { calls.push(`album:${id}`); if (id !== ALBUM_ID) throw new Error('missing'); return album; },
    getTrack: async (id: string) => {
      calls.push(`track:${id}`);
      if (!album.tracks.some((t) => t.id === id)) throw new Error('missing');
      return { track: { spotifyTrackId: id, album: { id: ALBUM_ID } } as TrackIdentity, playable: true };
    },
    search: async (request: { query: string }) => { calls.push(`search:${request.query}`); return { albums: { items: results } } as never; },
  };
}

describe('resolving and planning', () => {
  it('uses the album ID, else a proposed track ID, else a single exact search match', async () => {
    const c = catalogue();
    expect((await resolveAlbum(proposal({ artist: 'x', album: 'y', origin: 'conversation', whole_album: true, spotify_album_id: ALBUM_ID }), c)).album?.id).toBe(ALBUM_ID);
    expect((await resolveAlbum(proposal({ artist: 'x', album: 'y', origin: 'conversation', tracks: [{ spotify_track_id: T2, status: 'listened' }] }), c)).album?.id).toBe(ALBUM_ID);
    expect((await resolveAlbum(proposal({ artist: 'synthetic artist', album: 'IMAGINARY ALBUM', origin: 'conversation', whole_album: true }), c)).album?.id).toBe(ALBUM_ID);
    expect(c.calls).toContain('search:album:IMAGINARY ALBUM artist:synthetic artist');
  });

  it('never guesses between several candidates or a near miss', async () => {
    const two = catalogue([summary(album), summary(album, { id: ID('B') })]);
    const r = await resolveAlbum(proposal({ artist: 'Synthetic Artist', album: 'Imaginary Album', origin: 'conversation', whole_album: true }), two);
    expect(r.album).toBeNull();
    expect(r.choices).toHaveLength(2);
    const near = catalogue([summary(album, { name: 'Imaginary Album Live' })]);
    const n = await resolveAlbum(proposal({ artist: 'Synthetic Artist', album: 'Imaginary Album', origin: 'conversation', whole_album: true }), near);
    expect(n.album).toBeNull();
    expect(n.choices.map((c) => c.name)).toEqual(['Imaginary Album Live']);
  });

  it('maps proposed tracks by ID or unique title and reports the rest', () => {
    const p = proposal({ artist: 'x', album: 'y', origin: 'spotify_history', listened_on: '2026-10-31', tracks: [
      { spotify_track_id: T1, status: 'skipped' }, { spotify_track_id: T1, status: 'listened', played_at: '2026-10-31T01:00:00Z' },
      { title: 'second song', status: 'skipped' }, { title: 'Not On This Album', status: 'listened' },
    ] });
    const plan = planTracks(p, album);
    expect(plan.rows.map((r) => r.status)).toEqual(['listened', 'skipped', 'none']);
    expect(plan.rows[0]!.playedAt).toBe('2026-10-31T01:00:00Z');
    expect(plan.rows[1]!.playedAt).toBe('2026-10-31T03:00:00.000Z'); // noon in Korea on the stated day
    expect(plan.unmatched).toEqual(['Not On This Album']);
    const whole = planTracks(proposal({ artist: 'x', album: 'y', origin: 'conversation', whole_album: true }), album);
    expect(whole.rows.every((r) => r.status === 'listened' && r.playedAt === '2026-11-01T10:00:00Z')).toBe(true);
  });
});

describe('applyApproval writes through DigService', () => {
  let db: DigDatabase;
  let service: DigService;
  let tick = 0;
  beforeEach(() => {
    db = new DigDatabase(`lifehub-${crypto.randomUUID()}`);
    tick = 0;
    service = new DigService(db, () => new Date(Date.parse('2026-11-02T00:00:00Z') + tick++).toISOString());
  });
  afterEach(async () => { await db.delete(); });

  it('records listens with proposal-keyed IDs, and a skip never downgrades an earlier listen', async () => {
    await service.rememberAlbum(album);
    await service.setStatuses([T2], 'listened');
    const p: AlbumProposal = proposal({ artist: 'x', album: 'y', origin: 'spotify_history', tracks: [
      { spotify_track_id: T1, status: 'listened', played_at: '2026-10-30T12:00:00Z' },
      { spotify_track_id: T2, status: 'skipped' }, { spotify_track_id: T3, status: 'skipped' },
    ] });
    const plan = planTracks(p, album);
    expect(await applyApproval(service, p, album, plan.rows)).toEqual({ listened: 1, skipped: 1, keptListened: 1 });
    const data = await db.read();
    expect(data.events).toEqual([expect.objectContaining({ id: eventIdFor(KEY, T1), trackId: T1, albumId: ALBUM_ID, listenedAt: '2026-10-30T12:00:00Z', source: 'spotify-sync' })]);
    expect([T1, T2, T3].map((id) => statusForTrack(id, data))).toEqual(['listened', 'listened', 'skipped']);
    expect(receipts(data, { storage: memory() })).toEqual([{ key: KEY, albumId: ALBUM_ID }]);

    // Approving the same proposal again changes nothing.
    await applyApproval(service, p, album, plan.rows);
    expect((await db.read()).events).toHaveLength(1);
  });
});

/* ---------- Life Hub cards stage 7: approved in a Claude card ---------- */

describe('Claude card approvals', () => {
  const approved = (payload: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    parseProposal({ ...candidate(payload), status: 'approved', needs_app_review: false, final_candidate: null, ...extra })!;
  const tracks = [{ spotify_track_id: T1, status: 'listened' }, { spotify_track_id: T2, status: 'skipped' }];

  it('reads the hub state and prefers the owner\'s card edit', () => {
    const edited = approved({ artist: 'x', album: 'y', origin: 'conversation', spotify_album_id: ALBUM_ID, tracks }, {
      final_candidate: candidate({ artist: 'x', album: 'y', origin: 'conversation', spotify_album_id: ALBUM_ID, tracks: [{ spotify_track_id: T1, status: 'skipped' }] }).candidate });
    expect(edited).toMatchObject({ status: 'approved', needsAppReview: false, tracks: [{ spotify_track_id: T1, status: 'skipped' }] });
    expect(parseProposal({ ...candidate({ artist: 'x', album: 'y', origin: 'conversation', whole_album: true }), status: 'rejected' })).toBeNull();
    expect(proposal({ artist: 'x', album: 'y', origin: 'conversation', whole_album: true })).toMatchObject({ status: 'pending', needsAppReview: false });
  });

  it('autoReady: approved, no last check, auto-apply on, exact album, every track matched', async () => {
    const c = catalogue();
    const p = approved({ artist: 'x', album: 'y', origin: 'conversation', spotify_album_id: ALBUM_ID, tracks });
    const r = await resolveAlbum(p, c);
    const plan = planTracks(p, r.album!);
    expect(autoReady(p, r, plan, true)).toBe(true);
    expect(autoReady(p, r, plan, false)).toBe(false);
    expect(autoReady({ ...p, status: 'pending' }, r, plan, true)).toBe(false);
    expect(autoReady({ ...p, needsAppReview: true }, r, plan, true)).toBe(false);
    expect(autoReady(p, { album: null, choices: [] }, null, true)).toBe(false);
    const odd = approved({ artist: 'x', album: 'y', origin: 'conversation', spotify_album_id: ALBUM_ID, tracks: [...tracks, { title: 'Not On This Album', status: 'listened' }] });
    expect(autoReady(odd, r, planTracks(odd, r.album!), true)).toBe(false);
  });

  it('auto-apply is on by default and per device', () => {
    const deps = makeDeps(() => json({}));
    expect(autoApplyEnabled(deps)).toBe(true);
    setAutoApply(deps, false);
    expect(autoApplyEnabled(deps)).toBe(false);
  });

  it('applyApproved records only what is ready, once, and remembers the receipt', async () => {
    const db = new DigDatabase(`lifehub-${crypto.randomUUID()}`);
    try {
      const service = new DigService(db, () => '2026-11-02T00:00:00.000Z');
      const storage = memory();
      const ready = approved({ artist: 'x', album: 'y', origin: 'spotify_history', spotify_album_id: ALBUM_ID, tracks });
      const waiting = { ...ready, key: 'claude:mcp-' + 'w'.repeat(40), needsAppReview: true };
      const pending = { ...ready, key: 'claude:mcp-' + 'p'.repeat(40), status: 'pending' as const };
      expect(await applyApproved([ready, waiting, pending], service, catalogue(), false, { storage })).toEqual([]);
      expect(await applyApproved([ready, waiting, pending], service, catalogue(), true, { storage })).toEqual(['Imaginary Album']);
      const data = await db.read();
      expect(data.events.map((e) => e.id)).toEqual([eventIdFor(KEY, T1)]);
      expect(receipts(data, { storage })).toEqual([{ key: KEY, albumId: ALBUM_ID }]);
      await applyApproved([ready], service, catalogue(), true, { storage });
      expect((await db.read()).events).toHaveLength(1);
    } finally { await db.delete(); }
  });
});
