/**
 * potcast ↔ Life Hub connection.
 *
 * - Connect: OAuth 2.1 authorization code + PKCE (S256); potcast is a public client identified by
 *   public/lifehub-client.json and receives only a `potcast:inbox` token. Life Hub returns to
 *   /lifehub/ (public/lifehub/index.html), because the app root is the Spotify sign-in callback.
 * - Proposals (`album_listening`) are fetched live and validated again here; nothing is recorded until
 *   the owner approves an album in the record tools.
 * - Receipts: approved albums are reported back; listen events carry the proposal key in their ID, so a
 *   receipt can be rebuilt from the records themselves. Rejections and receipts retry until answered.
 */
import type { DigData } from '../digging/types';

export const LIFEHUB_ORIGIN = 'https://life-hub-api.213303.workers.dev';
export const APP_URL = 'https://kingjnu-sakayume.github.io/potcast/';
export const CALLBACK_URL = APP_URL + 'lifehub/';
export const CLIENT_ID = APP_URL + 'lifehub-client.json';
export const RESOURCE = LIFEHUB_ORIGIN + '/potcast';
export const SCOPE = 'potcast:inbox';
const API = LIFEHUB_ORIGIN + '/potcast/v1';
/** Written by public/lifehub/index.html. */
export const CALLBACK_KEY = 'potcast.lifehub.callback.v1';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface Deps {
  fetch: typeof fetch;
  storage: KV;
  session: KV;
  now: () => number;
  random: (bytes: number) => Uint8Array;
  sha256: (data: Uint8Array) => Promise<Uint8Array>;
}
export function browserDeps(): Deps {
  return {
    fetch: (input, init) => fetch(input, init),
    storage: localStorage,
    session: sessionStorage,
    now: () => Date.now(),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
  };
}

export type LifeHubErrorKind = 'not_connected' | 'denied' | 'state' | 'network' | 'server';
export class LifeHubError extends Error {
  kind: LifeHubErrorKind;
  constructor(kind: LifeHubErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/* ---------- contract (mirrors life-hub src/adapters/potcast.js) ---------- */

export interface ProposedTrack {
  title?: string;
  spotify_track_id?: string;
  status: 'listened' | 'skipped';
  played_at?: string;
}
export interface AlbumProposal {
  key: string;
  source: string;
  createdAt: string;
  artist: string;
  album: string;
  spotifyAlbumId?: string;
  origin: 'conversation' | 'spotify_history' | 'spotify_sync';
  listenedOn?: string;
  wholeAlbum: boolean;
  tracks: ProposedTrack[];
  note?: string;
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((k) => keys.includes(k));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optText = (v: unknown, max: number) => v === undefined || text(v, max);
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
/** `spotify:` keys come from Life Hub's hourly Spotify collection (album-context plays only). */
const KEY = /^(claude|chatgpt|codex|manual|spotify):[A-Za-z0-9_.:-]{8,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
export const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

function parseTrack(t: unknown): ProposedTrack | null {
  if (!obj(t) || !only(t, ['title', 'spotify_track_id', 'status', 'played_at'])) return null;
  if ((t.title === undefined && t.spotify_track_id === undefined) || !optText(t.title, 200)) return null;
  if (t.spotify_track_id !== undefined && (typeof t.spotify_track_id !== 'string' || !SPOTIFY_ID.test(t.spotify_track_id))) return null;
  if (t.status !== 'listened' && t.status !== 'skipped') return null;
  if (t.played_at !== undefined && (typeof t.played_at !== 'string' || !ISO.test(t.played_at) || Number.isNaN(Date.parse(t.played_at)))) return null;
  return {
    status: t.status,
    ...(typeof t.title === 'string' ? { title: t.title } : {}),
    ...(typeof t.spotify_track_id === 'string' ? { spotify_track_id: t.spotify_track_id } : {}),
    ...(typeof t.played_at === 'string' ? { played_at: t.played_at } : {}),
  };
}

/** Validates one item from the hub; null for anything that does not match the contract. */
export function parseProposal(item: unknown): AlbumProposal | null {
  if (!obj(item) || typeof item.key !== 'string' || !KEY.test(item.key) || !obj(item.candidate)) return null;
  const c = item.candidate;
  if (c.schema_version !== 1 || c.candidate_type !== 'album_listening' || typeof c.source !== 'string' ||
    `${c.source}:${String(c.idempotency_key)}` !== item.key || typeof c.created_at !== 'string' || !obj(c.payload)) return null;
  const p = c.payload;
  if (!only(p, ['artist', 'album', 'spotify_album_id', 'origin', 'listened_on', 'whole_album', 'tracks', 'note']) ||
    !text(p.artist, 200) || !text(p.album, 200) || !optText(p.note, 500) ||
    (p.spotify_album_id !== undefined && (typeof p.spotify_album_id !== 'string' || !SPOTIFY_ID.test(p.spotify_album_id))) ||
    (p.origin !== 'conversation' && p.origin !== 'spotify_history' && p.origin !== 'spotify_sync') ||
    (p.listened_on !== undefined && (typeof p.listened_on !== 'string' || !validDate(p.listened_on))) ||
    (p.whole_album !== undefined && p.whole_album !== true)) return null;
  const rawTracks = p.tracks;
  const hasTracks = rawTracks !== undefined;
  if ((p.whole_album === true) === hasTracks) return null;
  let tracks: ProposedTrack[] = [];
  if (hasTracks) {
    if (!Array.isArray(rawTracks) || rawTracks.length === 0 || rawTracks.length > 80) return null;
    const parsed = rawTracks.map(parseTrack);
    if (parsed.some((t) => t === null)) return null;
    tracks = parsed as ProposedTrack[];
  }
  if (p.origin === 'spotify_history' && !hasTracks) return null;
  // The hourly collection always names the album and every track by ID, and only it uses the spotify source.
  if (p.origin === 'spotify_sync' && (!hasTracks || typeof p.spotify_album_id !== 'string' || tracks.some((t) => !t.spotify_track_id || !t.played_at))) return null;
  if ((c.source === 'spotify') !== (p.origin === 'spotify_sync')) return null;
  return {
    key: item.key, source: c.source, createdAt: c.created_at, artist: p.artist, album: p.album,
    ...(typeof p.spotify_album_id === 'string' ? { spotifyAlbumId: p.spotify_album_id } : {}),
    origin: p.origin, ...(typeof p.listened_on === 'string' ? { listenedOn: p.listened_on } : {}),
    wholeAlbum: p.whole_album === true, tracks, ...(typeof p.note === 'string' ? { note: p.note } : {}),
  };
}

/* ---------- OAuth ---------- */

const TOKENS_KEY = 'potcast.lifehub.tokens.v1';
const PENDING_AUTH_KEY = 'potcast.lifehub.pending-auth.v1';
const OUTCOMES_KEY = 'potcast.lifehub.outcomes.v1';
const REJECTIONS_KEY = 'potcast.lifehub.rejections.v1';
const RECEIPTS_KEY = 'potcast.lifehub.receipts.v1';
const AUTH_MAX_AGE_MS = 10 * 60 * 1000;
interface Tokens { access_token: string; access_expires_at: number; refresh_token: string }
interface PendingAuth { state: string; verifier: string; created_at: number }
export type Outcome = 'confirmed' | 'rejected' | 'conflict' | 'missing';

function readJson<T>(store: KV, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function connectAvailable(loc: { origin: string; pathname: string }): boolean {
  const app = new URL(APP_URL);
  return loc.origin === app.origin && loc.pathname.startsWith(app.pathname) && !loc.pathname.startsWith(app.pathname + 'preview/');
}
export function isConnected(deps: Pick<Deps, 'storage'>): boolean {
  return typeof readJson<Tokens>(deps.storage, TOKENS_KEY)?.refresh_token === 'string';
}

export async function beginConnect(deps: Deps): Promise<string> {
  const verifier = b64url(deps.random(32));
  const state = b64url(deps.random(16));
  const challenge = b64url(await deps.sha256(new TextEncoder().encode(verifier)));
  const pending: PendingAuth = { state, verifier, created_at: deps.now() };
  deps.session.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));
  const q = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK_URL, scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE,
  });
  return LIFEHUB_ORIGIN + '/authorize?' + q.toString();
}

async function tokenRequest(deps: Deps, params: Record<string, string>): Promise<Tokens> {
  let response: Response;
  try {
    response = await deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
    });
  } catch {
    throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (body.error === 'invalid_grant') {
      deps.storage.removeItem(TOKENS_KEY);
      throw new LifeHubError('not_connected', 'Life Hub 연결이 만료됐어요. 다시 연결해 주세요.');
    }
    throw new LifeHubError('server', `Life Hub 인증 서버 오류 (${response.status})`);
  }
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || String(body.token_type).toLowerCase() !== 'bearer')
    throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  const tokens: Tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    access_expires_at: deps.now() + (typeof body.expires_in === 'number' ? body.expires_in : 300) * 1000,
  };
  deps.storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

/** Finish a sign-in whose result the callback page left in this tab. Returns false when there is none. */
export async function completeStoredCallback(deps: Deps): Promise<boolean> {
  const search = deps.session.getItem(CALLBACK_KEY);
  if (search === null) return false;
  deps.session.removeItem(CALLBACK_KEY);
  const q = new URLSearchParams(search);
  const pending = readJson<PendingAuth>(deps.session, PENDING_AUTH_KEY);
  deps.session.removeItem(PENDING_AUTH_KEY);
  if (!pending || q.get('state') !== pending.state || deps.now() - pending.created_at > AUTH_MAX_AGE_MS)
    throw new LifeHubError('state', '연결 요청이 만료됐거나 이 브라우저에서 시작되지 않았어요. 다시 연결해 주세요.');
  if (q.has('iss') && q.get('iss') !== LIFEHUB_ORIGIN) throw new LifeHubError('state', '다른 서버의 응답이라 연결하지 않았어요.');
  if (q.has('error')) throw new LifeHubError('denied', q.get('error') === 'access_denied' ? 'Life Hub 연결을 거절했어요.' : 'Life Hub 연결에 실패했어요.');
  const code = q.get('code');
  if (!code) throw new LifeHubError('state', '인증 코드가 없어요.');
  await tokenRequest(deps, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK_URL, code_verifier: pending.verifier, resource: RESOURCE });
  return true;
}

async function accessToken(deps: Deps, force = false): Promise<string> {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  if (!tokens?.refresh_token) throw new LifeHubError('not_connected', 'Life Hub에 연결되어 있지 않아요.');
  if (!force && tokens.access_expires_at - 60_000 > deps.now()) return tokens.access_token;
  return (await tokenRequest(deps, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).access_token;
}

async function api(deps: Deps, method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(API + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

export function disconnect(deps: Deps): void {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  deps.storage.removeItem(TOKENS_KEY);
  if (tokens?.refresh_token)
    void deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refresh_token, token_type_hint: 'refresh_token', client_id: CLIENT_ID }).toString(),
    }).catch(() => undefined);
}

/* ---------- local decisions, receipts and outbox ---------- */

/** Listen events created from a proposal carry its key, so receipts survive a cleared localStorage. */
export const eventIdFor = (key: string, trackId: string) => `lifehub:${key}:${trackId}`;

export function outcomes(deps: Pick<Deps, 'storage'>): Record<string, Outcome> {
  const map = readJson<Record<string, Outcome>>(deps.storage, OUTCOMES_KEY);
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}
export function rejectLocally(key: string, deps: Pick<Deps, 'storage'>): void {
  const list = readJson<string[]>(deps.storage, REJECTIONS_KEY) ?? [];
  if (!list.includes(key)) deps.storage.setItem(REJECTIONS_KEY, JSON.stringify([...list, key]));
}
export function rememberReceipt(key: string, albumId: string, deps: Pick<Deps, 'storage'>): void {
  const map = readJson<Record<string, string>>(deps.storage, RECEIPTS_KEY) ?? {};
  map[key] = albumId;
  deps.storage.setItem(RECEIPTS_KEY, JSON.stringify(map));
}
export function receipts(data: Pick<DigData, 'events'>, deps: Pick<Deps, 'storage'>): Array<{ key: string; albumId: string }> {
  const out = new Map<string, string>(Object.entries(readJson<Record<string, string>>(deps.storage, RECEIPTS_KEY) ?? {}));
  for (const event of data.events) {
    if (!event.id.startsWith('lifehub:')) continue;
    const key = event.id.slice('lifehub:'.length, event.id.length - event.trackId.length - 1);
    if (KEY.test(key) && !out.has(key)) out.set(key, event.albumId);
  }
  return [...out].filter(([, albumId]) => typeof albumId === 'string').map(([key, albumId]) => ({ key, albumId }));
}

export interface SyncResult { proposals: AlbumProposal[]; receiptsSent: number; rejectionsSent: number; conflicts: number; waiting: number }

export async function sync(data: Pick<DigData, 'events'>, deps: Deps): Promise<SyncResult> {
  const done = outcomes(deps);
  const result: SyncResult = { proposals: [], receiptsSent: 0, rejectionsSent: 0, conflicts: 0, waiting: 0 };
  const record = (key: string, response: Response, ok: Outcome) => {
    if (response.ok) done[key] = ok;
    else if (response.status === 409) done[key] = 'conflict';
    else if (response.status === 404) done[key] = 'missing';
    else {
      result.waiting++;
      return false;
    }
    deps.storage.setItem(OUTCOMES_KEY, JSON.stringify(done));
    return response.ok;
  };
  const decided = new Set<string>();
  for (const r of receipts(data, deps)) {
    decided.add(r.key);
    if (done[r.key]) continue;
    const response = await api(deps, 'POST', '/receipts', { key: r.key, entity_type: 'album_listening', entity_id: r.albumId });
    if (record(r.key, response, 'confirmed')) result.receiptsSent++;
  }
  for (const key of readJson<string[]>(deps.storage, REJECTIONS_KEY) ?? []) {
    decided.add(key);
    if (done[key]) continue;
    if (record(key, await api(deps, 'POST', '/rejections', { key }), 'rejected')) result.rejectionsSent++;
  }
  const response = await api(deps, 'GET', '/candidates?status=pending&limit=100');
  if (!response.ok) throw new LifeHubError('server', `Life Hub 제안을 가져오지 못했어요 (${response.status})`);
  const body = (await response.json().catch(() => null)) as { candidates?: unknown } | null;
  if (!body || !Array.isArray(body.candidates)) throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  for (const item of body.candidates) {
    const p = parseProposal(item);
    if (p && !decided.has(p.key)) result.proposals.push(p);
  }
  result.conflicts = Object.values(done).filter((v) => v === 'conflict').length;
  return result;
}
