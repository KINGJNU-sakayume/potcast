import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../app/session';
import { SessionContext } from '../../app/sessionContext';
import type { PlaybackEngine } from '../../playback/engine';
import { PlayerStore } from '../../playback/playerStore';
import type { PlaybackIssue } from '../../playback/types';
import { PlaybackNotice } from './PlaybackNotice';

function stage(issue: Omit<PlaybackIssue, 'at'>) {
  const store = new PlayerStore();
  store.dispatch({ type: 'issue/set', issue: { ...issue, at: 0 } });
  const engine = {
    kind: 'spotify',
    activateAudio: vi.fn(),
    resume: vi.fn(async () => undefined),
    setBrowserPlayback: vi.fn(async () => undefined),
  } as unknown as PlaybackEngine;
  const session = { mode: 'spotify', store, engine } as unknown as Session;
  render(
    <SessionContext.Provider value={session}>
      <PlaybackNotice />
    </SessionContext.Provider>,
  );
  return { store, engine };
}

describe('the playback notice', () => {
  it('offers the Spotify app when this browser cannot play protected audio', async () => {
    const user = userEvent.setup();
    const { engine } = stage({ kind: 'playback-failed', message: '이 브라우저에선 재생할 수 없어요.', hints: ['보호된 콘텐츠를 허용하세요.'] });
    expect(screen.getByRole('alert')).toHaveTextContent('이 브라우저에선 재생할 수 없어요');
    // One way forward is offered; the rest folds away.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Spotify 앱으로 듣기', '×', '이 브라우저에서 다시 시도']);
    expect(screen.getByText('왜 안 되나요?').closest('details')).not.toHaveAttribute('open');
    await user.click(screen.getByRole('button', { name: 'Spotify 앱으로 듣기' }));
    expect(engine.setBrowserPlayback).toHaveBeenCalledWith(false);
    // Then the music is resumed, which by now means: in the app.
    expect(engine.resume).toHaveBeenCalled();
  });

  it('says, without alarm, that playback moved to the app, and lets the listener change that back', async () => {
    const user = userEvent.setup();
    const { engine, store } = stage({ kind: 'moved-to-app', message: 'LAB-PC-07에서 재생합니다.' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('LAB-PC-07에서 재생합니다');
    await user.click(screen.getByRole('button', { name: '이 브라우저에서 다시 재생' }));
    expect(engine.setBrowserPlayback).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: '안내 닫기' }));
    expect(store.getState().issue).toBeNull();
  });
});
