import { describe, expect, it } from 'vitest';
import { PlayerStore } from '../playback/playerStore';
import { PreviewPlaybackEngine } from './previewEngine';
import { previewAlbumTracks } from './previewData';

const IGOR_URI = 'spotify:album:5zi7WsKlIiUXv09tbGLKsE';
const IGOR = previewAlbumTracks('5zi7WsKlIiUXv09tbGLKsE');

async function playingIgor() {
  const store = new PlayerStore();
  const engine = new PreviewPlaybackEngine(store, () => 0);
  await engine.play({ contextUri: IGOR_URI, offsetUri: IGOR[2]!.uri });
  return { store, engine };
}

describe('PreviewPlaybackEngine shuffle', () => {
  it('keeps the current track and reorders only what follows', async () => {
    const { store, engine } = await playingIgor();
    await engine.setShuffle(true);
    const { snapshot } = store.getState();
    expect(snapshot.shuffle).toBe(true);
    expect(snapshot.track?.uri).toBe(IGOR[2]!.uri);
    const { currentlyPlaying, upNext } = await engine.getQueue();
    expect(currentlyPlaying?.uri).toBe(IGOR[2]!.uri);
    expect(upNext.map((t) => t.uri).sort()).toEqual(IGOR.filter((_, i) => i !== 2).map((t) => t.uri).sort());
  });

  it('restores the album order when turned off', async () => {
    const { store, engine } = await playingIgor();
    await engine.setShuffle(true);
    await engine.setShuffle(false);
    expect(store.getState().snapshot).toMatchObject({ shuffle: false, track: { uri: IGOR[2]!.uri } });
    const { upNext } = await engine.getQueue();
    expect(upNext.map((t) => t.uri)).toEqual(IGOR.slice(3).map((t) => t.uri));
  });

  it('shuffles what plays next', async () => {
    const store = new PlayerStore();
    const engine = new PreviewPlaybackEngine(store, () => 0);
    await engine.setShuffle(true);
    await engine.play({ contextUri: IGOR_URI });
    const { currentlyPlaying, upNext } = await engine.getQueue();
    expect(store.getState().snapshot.shuffle).toBe(true);
    expect([currentlyPlaying!, ...upNext].map((t) => t.uri).sort()).toEqual(IGOR.map((t) => t.uri).sort());
  });
});
