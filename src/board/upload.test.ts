import { describe, expect, it } from 'vitest';
import type { Deps } from '../lifehub/remote';
import { buildBoardTiles } from './buildBoardTiles';
import { SAMPLE_NOW, sampleCovers, sampleData } from './fixtures';
import {
  BOARD_URL, DAILY_MS, MIN_INTERVAL_MS, boardEnabled, boardNeedsReconnect, boardPending, boardRound, decide, lastUpload, manifestSha,
  setBoardEnabled, type RoundInput, type Situation,
} from './upload';

const TOKENS_KEY = 'potcast.lifehub.tokens.v1';
const T0 = SAMPLE_NOW.getTime();

function memory(): Deps['storage'] {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
interface Call { url: string; init?: RequestInit }
function setup(handler: (call: Call) => Response, opts: { now?: number; tokens?: boolean } = {}) {
  const calls: Call[] = [];
  const clock = { now: opts.now ?? T0 };
  const storage = memory();
  if (opts.tokens !== false) storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', access_expires_at: clock.now + 3_600_000 }));
  const deps: Deps = {
    storage, session: memory(), now: () => clock.now, random: (n) => new Uint8Array(n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => { const call = { url: String(input), init }; calls.push(call); return handler(call); }) as typeof fetch,
  };
  return { deps, calls, clock };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const ok = () => json({ stored: true });

const buildFrom = (mutate?: (d: ReturnType<typeof sampleData>) => void) => (now: Date) => {
  const data = sampleData();
  mutate?.(data);
  return buildBoardTiles({ data, covers: sampleCovers }, now);
};
const round = (deps: Deps, over: Partial<RoundInput> = {}) =>
  boardRound({ deps, build: buildFrom(), connected: true, preview: false, hasRecords: true, opening: false, ...over });
const enable = (deps: Deps) => setBoardEnabled(deps.storage, true);

describe('upload policy', () => {
  const base: Situation = {
    now: T0, enabled: true, connected: true, preview: false, hasRecords: true, needsReconnect: false, nextSha: 'b', last: { sha: 'a', at: T0 - MIN_INTERVAL_MS - 1 },
    lastAttemptAt: 0, rejectedSha: null, opening: false,
  };
  it('sends changed content after 10 minutes, waits inside them', () => {
    expect(decide(base)).toEqual({ kind: 'send' });
    expect(decide({ ...base, last: { sha: 'a', at: T0 - 60_000 } })).toEqual({ kind: 'wait', ms: MIN_INTERVAL_MS - 60_000 });
    expect(decide({ ...base, last: null })).toEqual({ kind: 'send' });
  });
  it('counts a failed attempt toward the 10 minutes too', () => {
    expect(decide({ ...base, lastAttemptAt: T0 - 1000 })).toEqual({ kind: 'wait', ms: MIN_INTERVAL_MS - 1000 });
  });
  it('skips unchanged content, except once a day when the app opens', () => {
    const same = { ...base, nextSha: 'a' };
    expect(decide(same)).toEqual({ kind: 'skip' });
    expect(decide({ ...same, opening: true })).toEqual({ kind: 'skip' });
    expect(decide({ ...same, opening: true, last: { sha: 'a', at: T0 - DAILY_MS - 1 } })).toEqual({ kind: 'send' });
    expect(decide({ ...same, opening: false, last: { sha: 'a', at: T0 - DAILY_MS - 1 } })).toEqual({ kind: 'skip' });
  });
  it('never sends while off, disconnected, in preview, without records, or waiting for a reconnect', () => {
    for (const patch of [{ enabled: false }, { connected: false }, { preview: true }, { hasRecords: false }, { needsReconnect: true }]) {
      expect(decide({ ...base, ...patch, opening: true, last: null })).toEqual({ kind: 'skip' });
    }
  });
  it('does not resend content the board or hub rejected', () => {
    expect(decide({ ...base, rejectedSha: 'b' })).toEqual({ kind: 'skip' });
    expect(decide({ ...base, rejectedSha: 'x' })).toEqual({ kind: 'send' });
  });
});

describe('manifestSha', () => {
  it('ignores generated_at and key order, and changes with content', async () => {
    const { deps } = setup(ok);
    const a = buildFrom()(new Date(T0));
    const b = { ...buildFrom()(new Date(T0 + 3_600_000)) };
    expect(await manifestSha(a, deps.sha256)).toBe(await manifestSha(b, deps.sha256));
    const c = buildFrom((d) => { d.projects[0]!.name = 'Renamed'; })(new Date(T0));
    expect(await manifestSha(c, deps.sha256)).not.toBe(await manifestSha(a, deps.sha256));
  });
});

describe('board upload round', () => {
  it('is off by default on a device and sends nothing', async () => {
    const { deps, calls } = setup(ok);
    expect(boardEnabled(deps.storage)).toBe(false);
    expect(await round(deps)).toEqual({ kind: 'skipped' });
    expect(calls).toHaveLength(0);
  });

  it('PUTs the manifest with the bearer token and records the success', async () => {
    const { deps, calls } = setup(ok);
    enable(deps);
    const result = await round(deps);
    expect(result).toEqual({ kind: 'sent', result: { kind: 'ok' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(BOARD_URL);
    expect(BOARD_URL).toBe('https://life-hub-api.213303.workers.dev/potcast/v1/board');
    expect(calls[0]!.init).toMatchObject({ method: 'PUT' });
    expect(calls[0]!.init!.headers).toMatchObject({ Authorization: 'Bearer access-synthetic', 'Content-Type': 'application/json' });
    const body = JSON.parse(String(calls[0]!.init!.body)) as { version: number; app: string; generated_at: string; tiles: unknown[] };
    expect(body).toMatchObject({ version: 1, app: 'potcast', generated_at: '2026-11-07T03:00:00Z' });
    expect(body.tiles.length).toBe(5);
    expect(lastUpload(deps.storage)).toMatchObject({ at: T0 });
    expect(boardPending(deps.storage)).toBe(false);
  });

  it('counts { unchanged: true } and { ignored: true } as success', async () => {
    for (const body of [{ unchanged: true }, { ignored: true }]) {
      const { deps } = setup(() => json(body));
      enable(deps);
      expect(await round(deps)).toEqual({ kind: 'sent', result: { kind: 'ok', ...body } });
      expect(lastUpload(deps.storage)).not.toBeNull();
    }
  });

  it('does not send the same content again, even after 10 minutes', async () => {
    const { deps, calls, clock } = setup(ok);
    enable(deps);
    await round(deps);
    clock.now += MIN_INTERVAL_MS + 1000;
    expect(await round(deps)).toEqual({ kind: 'skipped' });
    expect(calls).toHaveLength(1);
  });

  it('sends the same content again once a day when the app opens', async () => {
    const { deps, calls, clock } = setup(ok);
    enable(deps);
    await round(deps);
    clock.now += DAILY_MS - 1000;
    expect(await round(deps, { opening: true })).toEqual({ kind: 'skipped' });
    clock.now += 2000;
    expect(await round(deps, { opening: true })).toMatchObject({ kind: 'sent' });
    expect(calls).toHaveLength(2);
  });

  it('holds changed content for the 10-minute gap and keeps the pending mark', async () => {
    const { deps, calls, clock } = setup(ok);
    enable(deps);
    await round(deps);
    clock.now += 60_000;
    const changed = buildFrom((d) => { d.projects[0]!.name = 'Renamed'; });
    expect(await round(deps, { build: changed })).toEqual({ kind: 'waiting', ms: MIN_INTERVAL_MS - 60_000 });
    expect(calls).toHaveLength(1);
    expect(boardPending(deps.storage)).toBe(true);
    // The app is closed and opened again later: the pending content goes out right away.
    clock.now += MIN_INTERVAL_MS;
    expect(await round(deps, { build: changed, opening: true })).toMatchObject({ kind: 'sent', result: { kind: 'ok' } });
    expect(calls).toHaveLength(2);
    expect(boardPending(deps.storage)).toBe(false);
  });

  it('403 insufficient_scope keeps the tokens, asks for a reconnect, and stops trying', async () => {
    const { deps, calls, clock } = setup(() => json({ error: 'insufficient_scope' }, 403, { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="potcast:board"' }));
    enable(deps);
    expect(await round(deps)).toEqual({ kind: 'sent', result: { kind: 'scope' } });
    expect(deps.storage.getItem(TOKENS_KEY)).not.toBeNull();
    expect(boardNeedsReconnect(deps.storage)).toBe(true);
    clock.now += MIN_INTERVAL_MS * 3;
    expect(await round(deps)).toEqual({ kind: 'skipped' });
    expect(calls).toHaveLength(1);
  });

  it('any other 403 follows the usual rule and signs the connection out', async () => {
    const { deps } = setup(() => json({ error: 'forbidden' }, 403));
    enable(deps);
    expect(await round(deps)).toEqual({ kind: 'sent', result: { kind: 'disconnected' } });
    expect(deps.storage.getItem(TOKENS_KEY)).toBeNull();
    expect(boardNeedsReconnect(deps.storage)).toBe(false);
  });

  it('a 401 that survives a token refresh signs the connection out; one that the refresh fixes does not', async () => {
    const refresh = () => json({ access_token: 'fresh', refresh_token: 'refresh-2', token_type: 'Bearer', expires_in: 3600 });
    let puts = 0;
    const fixed = setup(({ url }) => (url.endsWith('/oauth/token') ? refresh() : ++puts === 1 ? json({}, 401) : ok()));
    enable(fixed.deps);
    expect(await round(fixed.deps)).toEqual({ kind: 'sent', result: { kind: 'ok' } });
    expect(fixed.deps.storage.getItem(TOKENS_KEY)).not.toBeNull();
    const stuck = setup(({ url }) => (url.endsWith('/oauth/token') ? refresh() : json({}, 401)));
    enable(stuck.deps);
    expect(await round(stuck.deps)).toEqual({ kind: 'sent', result: { kind: 'disconnected' } });
    expect(stuck.deps.storage.getItem(TOKENS_KEY)).toBeNull();
  });

  it('400 and 413 are not retried with the same content and are only logged', async () => {
    for (const status of [400, 413]) {
      const logs: string[] = [];
      const { deps, calls, clock } = setup(() => json({ error: 'bad' }, status));
      enable(deps);
      expect(await round(deps, { log: (m) => logs.push(m) })).toEqual({ kind: 'sent', result: { kind: 'rejected', status } });
      expect(logs).toHaveLength(1);
      clock.now += MIN_INTERVAL_MS * 3;
      expect(await round(deps, { opening: true })).toEqual({ kind: 'skipped' });
      expect(calls).toHaveLength(1);
      expect(deps.storage.getItem(TOKENS_KEY)).not.toBeNull();
      // Different content is tried again.
      expect(await round(deps, { build: buildFrom((d) => { d.projects[0]!.name = 'Renamed'; }) })).toMatchObject({ kind: 'sent' });
      expect(calls).toHaveLength(2);
    }
  });

  it('a network error or 5xx keeps the content pending for another try', async () => {
    for (const handler of [(): Response => { throw new TypeError('offline'); }, () => json({}, 503)]) {
      const { deps, clock } = setup(handler);
      enable(deps);
      expect(await round(deps)).toEqual({ kind: 'sent', result: { kind: 'retry' } });
      expect(boardPending(deps.storage)).toBe(true);
      expect(lastUpload(deps.storage)).toBeNull();
      expect(deps.storage.getItem(TOKENS_KEY)).not.toBeNull();
      // Still inside the 10 minutes since the attempt: wait; afterwards: try again.
      expect(await round(deps)).toMatchObject({ kind: 'waiting' });
      clock.now += MIN_INTERVAL_MS + 1;
      expect(await round(deps)).toMatchObject({ kind: 'sent' });
    }
  });

  it('does not send when not connected, in preview, or with no records at all', async () => {
    const a = setup(ok); enable(a.deps);
    expect(await round(a.deps, { connected: false })).toEqual({ kind: 'skipped' });
    const b = setup(ok); enable(b.deps);
    expect(await round(b.deps, { preview: true })).toEqual({ kind: 'skipped' });
    const c = setup(ok); enable(c.deps);
    expect(await round(c.deps, { hasRecords: false })).toEqual({ kind: 'skipped' });
    expect(a.calls.length + b.calls.length + c.calls.length).toBe(0);
  });

  it('never throws, so an upload problem cannot reach the rest of the app', async () => {
    const { deps } = setup(ok);
    enable(deps);
    const logs: string[] = [];
    await expect(round(deps, { build: () => { throw new Error('boom'); }, log: (m) => logs.push(m) })).resolves.toEqual({ kind: 'skipped' });
    expect(logs[0]).toContain('boom');
  });
});
