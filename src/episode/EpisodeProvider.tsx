import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useSession } from '../app/sessionContext';
import { useEngine, usePlayerSelector } from '../playback/hooks';
import { preferencesStore } from '../preferences/preferences';
import { EpisodeContext, useEpisodeRunner } from './episodeContext';
import { CaptionNarrator, SpeechNarrator, type NarrationSettings, type Narrator } from './narrator';
import { EpisodeRunner, type EpisodeState } from './runner';
import { chooseVoices, voiceCatalog } from './voices';

/** At most two hosts speak, so two voices are kept ready. */
const VOICE_SLOTS = 2;

function narrationSettings(): NarrationSettings {
  const preferences = preferencesStore.get();
  return { rate: preferences.episodeRate, voices: chooseVoices(VOICE_SLOTS, voiceCatalog.getSnapshot(), preferences.episodeVoices) };
}

function createNarrator(): Narrator {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return new CaptionNarrator(narrationSettings);
  return new SpeechNarrator(synth, (text) => new SpeechSynthesisUtterance(text), narrationSettings);
}

/**
 * One episode runner per session, next to the session's player: an episode
 * keeps going while the listener looks at other pages, exactly as playback
 * does, and ends with the session.
 */
export function EpisodeProvider({ children }: { children: ReactNode }) {
  const { engine, store } = useSession();
  const runner = useMemo(
    () =>
      new EpisodeRunner({
        engine,
        store,
        narrator: createNarrator(),
        options: () => {
          const preferences = preferencesStore.get();
          return { talkOver: preferences.episodeTalkOver, duckLevel: preferences.episodeDuckLevel };
        },
      }),
    [engine, store],
  );

  useEffect(() => runner.attach(), [runner]);
  // Voices arrive a moment after the page loads, and the listener can change them: "voice" or "captions" follows.
  useEffect(() => {
    const refresh = () => runner.refresh();
    const unsubscribeVoices = voiceCatalog.subscribe(refresh);
    const unsubscribePreferences = preferencesStore.subscribe(refresh);
    refresh();
    return () => {
      unsubscribeVoices();
      unsubscribePreferences();
    };
  }, [runner]);

  return <EpisodeContext.Provider value={runner}>{children}</EpisodeContext.Provider>;
}

export function useEpisodeState(): EpisodeState {
  const runner = useEpisodeRunner();
  return useSyncExternalStore(runner.subscribe, runner.getState);
}

function useEpisodeSelector<T>(selector: (state: EpisodeState) => T): T {
  const runner = useEpisodeRunner();
  return useSyncExternalStore(runner.subscribe, () => selector(runner.getState()));
}

/**
 * Whether the play / pause control belongs to the episode right now: while
 * it is playing, and while the listener has paused it and not put anything
 * else on. After the episode stepped back by itself the player is the
 * listener's again.
 */
function holdsPlayer(state: EpisodeState, musicPlaying: boolean): boolean {
  if (!state.episode) return false;
  if (state.status === 'playing') return true;
  return state.status === 'paused' && state.notice === null && !musicPlaying;
}

export interface PlaybackToggle {
  /** What the control shows: the episode's state while it holds the player, otherwise the player's. */
  paused: boolean;
  /** True while play / pause acts on an episode. */
  episode: boolean;
  toggle: () => void;
}

/**
 * Play / pause for every control outside the episode page (the transport,
 * Space, the phone's mini player): it pauses and resumes a running episode
 * rather than the music underneath it, which the episode is steering.
 */
export function usePlaybackToggle(): PlaybackToggle {
  const runner = useEpisodeRunner();
  const engine = useEngine();
  const playerPaused = usePlayerSelector((s) => s.snapshot.paused);
  const hasTrack = usePlayerSelector((s) => Boolean(s.snapshot.track));
  const musicPlaying = hasTrack && !playerPaused;
  const episode = useEpisodeSelector((state) => holdsPlayer(state, musicPlaying));
  const episodePlaying = useEpisodeSelector((state) => state.status === 'playing');

  const toggle = useCallback(() => {
    const { snapshot } = runner.store.getState();
    if (holdsPlayer(runner.getState(), Boolean(snapshot.track) && !snapshot.paused)) {
      runner.toggle();
      return;
    }
    engine.activateAudio();
    void engine.togglePlay();
  }, [runner, engine]);

  return { paused: episode ? !episodePlaying : playerPaused, episode, toggle };
}
