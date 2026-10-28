import { describe, expect, it } from 'vitest';
import { describeDevice } from './deviceStatus';
import type { PlayerState } from './types';

function state(partial: { device?: Partial<NonNullable<PlayerState['snapshot']['device']>> | null; source?: string; sdk?: PlayerState['sdk']; issue?: PlayerState['issue'] }) {
  return {
    snapshot: { device: partial.device ? { id: 'd', name: 'Desk', isThisBrowser: false, ...partial.device } : null, source: partial.source ?? 'remote' },
    sdk: partial.sdk ?? { kind: 'ready', deviceId: 'web' },
    issue: partial.issue ?? null,
  } as unknown as PlayerState;
}

describe('describeDevice', () => {
  it('names this browser the same way whether it is ready or already playing', () => {
    expect(describeDevice(state({})).label).toBe('이 브라우저');
    expect(describeDevice(state({ device: { isThisBrowser: true }, source: 'sdk' })).label).toBe('이 브라우저');
  });

  it('never says there is no device while the browser player is ready', () => {
    expect(describeDevice(state({ device: null }))).toMatchObject({ label: '이 브라우저', tone: 'ready' });
  });

  it('names another device by its name', () => {
    expect(describeDevice(state({ device: { name: 'LAB-PC-07' } }))).toMatchObject({ label: 'LAB-PC-07', tone: 'playing' });
  });

  it('says when this browser cannot play', () => {
    const failed = { kind: 'playback-failed', message: '', at: 0 } as const;
    expect(describeDevice(state({ issue: failed }))).toMatchObject({ label: '이 브라우저', detail: '재생할 수 없음', tone: 'failed' });
  });

  it('calls the browser a remote when the Spotify app plays', () => {
    expect(describeDevice(state({ sdk: { kind: 'disabled' } }))).toMatchObject({ label: 'Spotify 앱', tone: 'none' });
  });
});
