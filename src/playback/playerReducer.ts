import type { PlaybackIssue, PlayerSnapshot, PlayerState, SdkStatus } from './types';
import { NO_DISALLOWS } from './types';

export type PlayerAction =
  | { type: 'sdk/status'; status: SdkStatus }
  /** A non-null `player_state_changed` from this browser's SDK device. */
  | { type: 'sdk/state'; snapshot: PlayerSnapshot }
  /** The SDK reported a null state: playback left this browser. */
  | { type: 'sdk/inactive'; now: number }
  /** Result of GET /me/player; `snapshot: null` is the documented 204 "no active playback". */
  | { type: 'remote/state'; snapshot: PlayerSnapshot | null; requestedAt: number }
  | { type: 'preview/state'; snapshot: PlayerSnapshot }
  /** A user command was issued; `patch` is the optimistic change. */
  | { type: 'command/issued'; at: number; patch?: Partial<PlayerSnapshot> }
  | { type: 'issue/set'; issue: PlaybackIssue }
  | { type: 'issue/clear'; kinds?: PlaybackIssue['kind'][] }
  /** The initial read failed; stop showing the loading state (the issue explains why). */
  | { type: 'hydrated' }
  | { type: 'reset' };

export function emptySnapshot(now = 0): PlayerSnapshot {
  return {
    source: 'none',
    track: null,
    context: null,
    paused: true,
    shuffle: false,
    buffering: false,
    positionMs: 0,
    sampledAt: now,
    durationMs: 0,
    volume: null,
    device: null,
    disallows: NO_DISALLOWS,
    nextTracks: [],
  };
}

export function createInitialPlayerState(): PlayerState {
  return {
    hydrated: false,
    snapshot: emptySnapshot(),
    sdk: { kind: 'disabled' },
    issue: null,
    lastCommandAt: Number.NEGATIVE_INFINITY,
    lastRemoteRequestAt: Number.NEGATIVE_INFINITY,
  };
}

function clearIssues(issue: PlaybackIssue | null, kinds: PlaybackIssue['kind'][]): PlaybackIssue | null {
  return issue && kinds.includes(issue.kind) ? null : issue;
}

/**
 * Pure state transitions for the player. Guards against stale Web API data:
 * - a remote read requested before the latest command is discarded (the
 *   command may not be reflected yet — Spotify does not order player calls);
 * - a remote read that resolves after a newer one is discarded;
 * - while this browser's SDK device is active, its events are authoritative.
 */
export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'sdk/status':
      return { ...state, sdk: action.status };

    case 'sdk/state':
      return {
        ...state,
        hydrated: true,
        snapshot: action.snapshot,
        issue: clearIssues(state.issue, ['no-active-device', 'autoplay-blocked']),
      };

    case 'sdk/inactive':
      if (state.snapshot.source !== 'sdk') return state;
      return {
        ...state,
        snapshot: { ...state.snapshot, source: 'none', paused: true, device: null, sampledAt: action.now },
      };

    case 'remote/state': {
      if (action.requestedAt < state.lastCommandAt || action.requestedAt < state.lastRemoteRequestAt) {
        return state.hydrated ? state : { ...state, hydrated: true };
      }
      const base = { ...state, hydrated: true, lastRemoteRequestAt: action.requestedAt };
      const sdkActive = state.snapshot.source === 'sdk' && state.sdk.kind === 'ready';
      const incoming = action.snapshot;

      if (!incoming) {
        // 204: nothing active anywhere. Keep SDK state if the SDK says it is playing here.
        return sdkActive ? base : { ...base, snapshot: { ...emptySnapshot(state.snapshot.sampledAt), volume: state.snapshot.volume } };
      }
      if (sdkActive && incoming.device?.isThisBrowser) return base;
      return {
        ...base,
        snapshot: incoming,
        issue: clearIssues(state.issue, ['no-active-device', 'network', 'rate-limited']),
      };
    }

    case 'preview/state':
      return { ...state, hydrated: true, snapshot: action.snapshot };

    case 'command/issued':
      return {
        ...state,
        lastCommandAt: action.at,
        snapshot: action.patch ? { ...state.snapshot, ...action.patch } : state.snapshot,
      };

    case 'issue/set':
      return { ...state, issue: action.issue };

    case 'issue/clear': {
      if (!state.issue) return state;
      const issue = action.kinds ? clearIssues(state.issue, action.kinds) : null;
      return issue === state.issue ? state : { ...state, issue };
    }

    case 'hydrated':
      return state.hydrated ? state : { ...state, hydrated: true };

    case 'reset':
      return createInitialPlayerState();
  }
}
