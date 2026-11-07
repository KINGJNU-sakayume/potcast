/**
 * Uploads the board tiles (src/board/buildBoardTiles.ts) to Life Hub: `PUT /potcast/v1/board`, scope `potcast:board`.
 * Hub keeps one latest list per app. Only the tile list goes up, never the records themselves.
 *
 * The request function is separate from remote.ts's `api()`: that one signs the connection out on any 401/403, and a
 * connection made before `potcast:board` existed answers its first upload `403 insufficient_scope`. That case keeps the
 * tokens (the inbox and sync still work) and only asks for a reconnect.
 */
import { stableJson } from '../digging/service';
import { LIFEHUB_ORIGIN, LifeHubError, dropTokens, tokenForBoard, type Deps } from '../lifehub/remote';
import { storageKey } from '../lib/storageNamespace';
import type { BoardManifest } from './buildBoardTiles';

export const BOARD_URL = LIFEHUB_ORIGIN + '/potcast/v1/board';
export const MIN_INTERVAL_MS = 10 * 60 * 1000;
export const DAILY_MS = 24 * 60 * 60 * 1000;

type KV = Pick<Deps['storage'], 'getItem' | 'setItem' | 'removeItem'>;
const K = {
  enabled: storageKey('board.enabled.v1'),
  last: storageKey('board.last.v1'),
  attempt: storageKey('board.attempt.v1'),
  pending: storageKey('board.pending.v1'),
  rejected: storageKey('board.rejected.v1'),
  scope: storageKey('board.scope.v1'),
};

const read = (store: KV, key: string): string | null => { try { return store.getItem(key); } catch { return null; } };
const write = (store: KV, key: string, value: string | null) => {
  try { if (value === null) store.removeItem(key); else store.setItem(key, value); } catch { /* storage unavailable: the app goes on */ }
};

/** 「이 기기에서 보드에 올리기」: off until turned on here, because the records live in this browser only. */
export const boardEnabled = (store: KV) => read(store, K.enabled) === 'on';
export const setBoardEnabled = (store: KV, on: boolean) => write(store, K.enabled, on ? 'on' : 'off');
/** The reconnect notice: Life Hub refused the upload for lack of `potcast:board`. Cleared when a new sign-in finishes. */
export const boardNeedsReconnect = (store: KV) => read(store, K.scope) === 'missing';
export const clearBoardReconnect = (store: KV) => write(store, K.scope, null);
export const boardPending = (store: KV) => read(store, K.pending) === '1';

interface Last { sha: string; at: number }
export function lastUpload(store: KV): Last | null {
  try {
    const v = JSON.parse(read(store, K.last) ?? 'null') as Partial<Last> | null;
    return v && typeof v.sha === 'string' && typeof v.at === 'number' ? { sha: v.sha, at: v.at } : null;
  } catch { return null; }
}
const lastAttempt = (store: KV) => { const n = Number(read(store, K.attempt)); return Number.isFinite(n) ? n : 0; };

/** sha256 of the manifest without `generated_at`: a list that only differs by its clock is the same list. */
export async function manifestSha(manifest: BoardManifest, sha256: Deps['sha256']): Promise<string> {
  const { generated_at: _at, ...rest } = manifest;
  void _at;
  const digest = await sha256(new TextEncoder().encode(stableJson(rest)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Situation {
  now: number;
  enabled: boolean;
  connected: boolean;
  /** Preview (demo) session, no Spotify account. */
  preview: boolean;
  /** At least one record of any kind: a new device with none must not overwrite another device's list. */
  hasRecords: boolean;
  needsReconnect: boolean;
  nextSha: string;
  last: Last | null;
  lastAttemptAt: number;
  /** Hub (or the board) rejected exactly this content (400/413). */
  rejectedSha: string | null;
  /** This is the check made when the app opens: it adds the once-a-day send. */
  opening: boolean;
}
export type Decision = { kind: 'skip' } | { kind: 'send' } | { kind: 'wait'; ms: number };

/** When to upload: at most once per 10 minutes, only changed content, plus one send per day when the app opens. */
export function decide(s: Situation): Decision {
  if (!s.enabled || !s.connected || s.preview || !s.hasRecords || s.needsReconnect) return { kind: 'skip' };
  if (s.rejectedSha === s.nextSha) return { kind: 'skip' };
  const changed = s.last?.sha !== s.nextSha;
  const dayOld = s.opening && (!s.last || s.now - s.last.at > DAILY_MS);
  if (!changed && !dayOld) return { kind: 'skip' };
  const since = s.now - Math.max(s.last?.at ?? 0, s.lastAttemptAt);
  if (since >= MIN_INTERVAL_MS) return { kind: 'send' };
  return { kind: 'wait', ms: MIN_INTERVAL_MS - since };
}

export type SendResult =
  | { kind: 'ok'; unchanged?: boolean; ignored?: boolean }
  | { kind: 'scope' }
  /** 400 or 413: a bug here (or a clock more than 5 minutes off); do not send the same content again. */
  | { kind: 'rejected'; status: number }
  /** Network error or 5xx: try again later. */
  | { kind: 'retry' }
  | { kind: 'disconnected' };

const isInsufficientScope = (response: Response) => /insufficient_scope/.test(response.headers.get('WWW-Authenticate') ?? '');

/** One PUT. 403 `insufficient_scope` is checked first and keeps the tokens; any other 401/403 follows the usual rule. */
export async function putBoard(deps: Deps, manifest: BoardManifest): Promise<SendResult> {
  const send = async (token: string) => deps.fetch(BOARD_URL, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  try {
    let response = await send(await tokenForBoard(deps));
    if (response.status === 403 && isInsufficientScope(response)) return { kind: 'scope' };
    if (response.status === 401) {
      response = await send(await tokenForBoard(deps, true));
      if (response.status === 403 && isInsufficientScope(response)) return { kind: 'scope' };
    }
    if (response.status === 401 || response.status === 403) {
      dropTokens(deps);
      return { kind: 'disconnected' };
    }
    if (response.status === 400 || response.status === 413) return { kind: 'rejected', status: response.status };
    if (!response.ok) return { kind: 'retry' };
    const body = (await response.json().catch(() => ({}))) as { unchanged?: unknown; ignored?: unknown };
    return { kind: 'ok', ...(body.unchanged === true ? { unchanged: true } : {}), ...(body.ignored === true ? { ignored: true } : {}) };
  } catch (e) {
    if (e instanceof LifeHubError && e.kind === 'not_connected') return { kind: 'disconnected' };
    return { kind: 'retry' };
  }
}

export interface RoundInput {
  /** Builds the manifest for this moment; called once per round. */
  build: (now: Date) => BoardManifest;
  deps: Deps;
  connected: boolean;
  preview: boolean;
  hasRecords: boolean;
  opening: boolean;
  /** Logs a bug-class failure (400/413); the developer console only. */
  log?: (message: string) => void;
}
export type RoundResult =
  | { kind: 'skipped' }
  | { kind: 'waiting'; ms: number }
  | { kind: 'sent'; result: SendResult };

/**
 * One upload decision and, when due, the upload. Never throws: a failure here must not touch the rest of the app.
 * The pending mark stays set while content is waiting for the 10-minute gap, a retry, or the next app start.
 */
export async function boardRound(r: RoundInput): Promise<RoundResult> {
  const { deps } = r;
  try {
    const now = deps.now();
    const manifest = r.build(new Date(now));
    const nextSha = await manifestSha(manifest, deps.sha256);
    const situation: Situation = {
      now, enabled: boardEnabled(deps.storage), connected: r.connected, preview: r.preview, hasRecords: r.hasRecords,
      needsReconnect: boardNeedsReconnect(deps.storage), nextSha, last: lastUpload(deps.storage), lastAttemptAt: lastAttempt(deps.storage),
      rejectedSha: read(deps.storage, K.rejected), opening: r.opening,
    };
    const decision = decide(situation);
    if (decision.kind === 'skip') {
      if (situation.last?.sha === nextSha) write(deps.storage, K.pending, null);
      return { kind: 'skipped' };
    }
    write(deps.storage, K.pending, '1');
    if (decision.kind === 'wait') return { kind: 'waiting', ms: decision.ms };
    write(deps.storage, K.attempt, String(now));
    const result = await putBoard(deps, manifest);
    if (result.kind === 'ok') {
      write(deps.storage, K.last, JSON.stringify({ sha: nextSha, at: deps.now() } satisfies Last));
      write(deps.storage, K.pending, null);
      write(deps.storage, K.rejected, null);
      write(deps.storage, K.scope, null);
    } else if (result.kind === 'scope') {
      write(deps.storage, K.scope, 'missing');
    } else if (result.kind === 'rejected') {
      write(deps.storage, K.rejected, nextSha);
      write(deps.storage, K.pending, null);
      r.log?.(`potcast board upload rejected with ${result.status}; not retrying the same content.`);
    }
    return { kind: 'sent', result };
  } catch (e) {
    r.log?.(`potcast board upload failed: ${e instanceof Error ? e.message : String(e)}`);
    return { kind: 'skipped' };
  }
}
