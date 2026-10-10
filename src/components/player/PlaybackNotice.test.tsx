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
    const { engine } = stage({ kind: 'playback-failed', message: 'This browser can’t play protected (DRM) audio.', hints: ['Allow protected content.'] });
    expect(screen.getByRole('alert')).toHaveTextContent('protected (DRM) audio');
    await user.click(screen.getByRole('button', { name: 'Use the Spotify app instead' }));
    expect(engine.setBrowserPlayback).toHaveBeenCalledWith(false);
    // Then the music is resumed, which by now means: in the app.
    expect(engine.resume).toHaveBeenCalled();
  });

  it('says, without alarm, that playback moved to the app, and lets the listener change that back', async () => {
    const user = userEvent.setup();
    const { engine, store } = stage({ kind: 'moved-to-app', message: 'LAB-PC-07 plays it from now on and this page is its remote.' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('LAB-PC-07 plays it from now on');
    await user.click(screen.getByRole('button', { name: 'Play in this browser again' }));
    expect(engine.setBrowserPlayback).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(store.getState().issue).toBeNull();
  });
});
