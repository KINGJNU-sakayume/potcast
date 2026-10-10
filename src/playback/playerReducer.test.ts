import { describe, expect, it } from 'vitest';
import type { TrackIdentity } from '../domain/types';
import { positionAt } from './playbackClock';
import { createInitialPlayerState, emptySnapshot, playerReducer, type PlayerAction } from './playerReducer';
import type { PlayerSnapshot, PlayerState } from './types';

const track: TrackIdentity = {
  spotifyTrackId: 'track1',
  uri: 'spotify:track:track1',
  title: 'EARFQUAKE',
  artists: [{ id: 'a', name: 'Tyler, The Creator', uri: 'spotify:artist:a' }],
  album: { id: 'album1', name: 'IGOR', uri: 'spotify:album:album1', images: [] },
  durationMs: 190_000,
};

function snapshot(patch: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return { ...emptySnapshot(), source: 'remote', track, paused: false, durationMs: 190_000, ...patch };
}

function run(...actions: PlayerAction[]): PlayerState {
  return actions.reduce(playerReducer, createInitialPlayerState());
}

describe('playerReducer', () => {
  it('starts unhydrated with nothing playing', () => {
    const state = createInitialPlayerState();
    expect(state.hydrated).toBe(false);
    expect(state.snapshot.track).toBeNull();
  });

  it('hydrates from a remote read and from a 204 (no active playback)', () => {
    expect(run({ type: 'remote/state', snapshot: snapshot(), requestedAt: 1 }).snapshot.track?.title).toBe('EARFQUAKE');
    const none = run({ type: 'remote/state', snapshot: null, requestedAt: 1 });
    expect(none.hydrated).toBe(true);
    expect(none.snapshot.source).toBe('none');
  });

  it('discards remote reads requested before the latest command (stale API data)', () => {
    const state = run(
      { type: 'remote/state', snapshot: snapshot({ paused: false }), requestedAt: 10 },
      { type: 'command/issued', at: 20, patch: { paused: true } },
      { type: 'remote/state', snapshot: snapshot({ paused: false }), requestedAt: 15 },
    );
    expect(state.snapshot.paused).toBe(true);
    const fresh = playerReducer(state, { type: 'remote/state', snapshot: snapshot({ paused: true, positionMs: 5 }), requestedAt: 25 });
    expect(fresh.snapshot.positionMs).toBe(5);
  });

  it('discards a remote read that resolves after a newer one', () => {
    const state = run(
      { type: 'remote/state', snapshot: snapshot({ positionMs: 2_000 }), requestedAt: 30 },
      { type: 'remote/state', snapshot: snapshot({ positionMs: 1_000 }), requestedAt: 20 },
    );
    expect(state.snapshot.positionMs).toBe(2_000);
  });

  it('treats SDK events as authoritative while this browser is the active device', () => {
    const sdkState = run(
      { type: 'sdk/status', status: { kind: 'ready', deviceId: 'web' } },
      { type: 'sdk/state', snapshot: snapshot({ source: 'sdk', positionMs: 42_000 }) },
    );
    const afterRemote = playerReducer(sdkState, {
      type: 'remote/state',
      snapshot: snapshot({
        positionMs: 1,
        device: { id: 'web', name: 'x', type: 'Computer', isActive: true, isRestricted: false, isThisBrowser: true, volumePercent: 50, supportsVolume: true },
      }),
      requestedAt: 99,
    });
    expect(afterRemote.snapshot.positionMs).toBe(42_000);
    // …and a 204 does not wipe what the SDK reports.
    expect(playerReducer(sdkState, { type: 'remote/state', snapshot: null, requestedAt: 100 }).snapshot.track).not.toBeNull();
  });

  it('marks playback as moved away when the SDK reports a null state', () => {
    const state = run(
      { type: 'sdk/status', status: { kind: 'ready', deviceId: 'web' } },
      { type: 'sdk/state', snapshot: snapshot({ source: 'sdk' }) },
      { type: 'sdk/inactive', now: 5 },
    );
    expect(state.snapshot.source).toBe('none');
    expect(state.snapshot.paused).toBe(true);
  });

  it('applies optimistic command patches', () => {
    const state = run(
      { type: 'remote/state', snapshot: snapshot(), requestedAt: 1 },
      { type: 'command/issued', at: 2, patch: { positionMs: 90_000, sampledAt: 2 } },
    );
    expect(state.lastCommandAt).toBe(2);
    expect(state.snapshot.positionMs).toBe(90_000);
  });

  it('sets and clears issues; a successful state clears the no-device issue', () => {
    const withIssue = run({ type: 'issue/set', issue: { kind: 'no-active-device', message: 'x', at: 1 } });
    expect(withIssue.issue?.kind).toBe('no-active-device');
    expect(playerReducer(withIssue, { type: 'issue/clear', kinds: ['rate-limited'] })).toBe(withIssue);
    expect(playerReducer(withIssue, { type: 'sdk/state', snapshot: snapshot({ source: 'sdk' }) }).issue).toBeNull();
  });
});

describe('positionAt (central playback clock)', () => {
  it('advances while playing and holds while paused or buffering', () => {
    const playing = snapshot({ positionMs: 10_000, sampledAt: 1_000 });
    expect(positionAt(playing, 3_500)).toBe(12_500);
    expect(positionAt({ ...playing, paused: true }, 3_500)).toBe(10_000);
    expect(positionAt({ ...playing, buffering: true }, 3_500)).toBe(10_000);
  });

  it('clamps to the track duration and returns 0 without a track', () => {
    expect(positionAt(snapshot({ positionMs: 189_000, sampledAt: 0 }), 10_000)).toBe(190_000);
    expect(positionAt(emptySnapshot(), 10_000)).toBe(0);
  });
});
