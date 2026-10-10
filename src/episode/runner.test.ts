import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerStore } from '../playback/playerStore';
import { END_GUARD_MS, EpisodeRunner, GRACE_MS, SETTLE_MS, type RunnerOptions } from './runner';
import { episodeFrom, ScriptedNarrator, StageEngine, timedNote, track } from './testing';

const ONE = track('one', 200_000);
const TWO = track('two', 15_000);
const THREE = track('three', 180_000);
const OTHER = track('other', 240_000, 'Something Else');
const TRACKS = [ONE, TWO, THREE, OTHER];
const NOTES = [timedNote('one', 200_000, [[10_000, 14_000]])];

function stage(body: string, options: Partial<RunnerOptions> = {}) {
  const store = new PlayerStore();
  const engine = new StageEngine(store, TRACKS);
  const narrator = new ScriptedNarrator();
  const settings: RunnerOptions = { talkOver: 'duck', duckLevel: 0.2, ...options };
  const runner = new EpisodeRunner({ engine, store, narrator, options: () => settings });
  const episode = episodeFrom(body, TRACKS, NOTES);
  return { store, engine, narrator, runner, episode, settings };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('talk', () => {
  it('says the lines in order in each host\'s voice, then ends', async () => {
    const { runner, narrator, episode } = stage(['A: 첫 문장. 둘째 문장.', 'B: 대답.', 'A: 마무리.'].join('\n'));
    runner.start(episode);
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 0, lineIndex: 0, utteranceIndex: 0 });
    await advance(1200);
    expect(runner.getState()).toMatchObject({ lineIndex: 0, utteranceIndex: 1 });
    await advance(10_000);
    expect(narrator.spoken).toEqual(['0:첫 문장.', '0:둘째 문장.', '1:대답.', '0:마무리.']);
    expect(runner.getState()).toMatchObject({ status: 'ended', cueIndex: 1 });
  });

  it('unlocks speech and audio inside the starting gesture', () => {
    const { runner, narrator, episode } = stage('A: 시작.');
    runner.start(episode);
    expect(narrator.unlocks).toEqual([0]);
  });

  it('stops music that is already playing before the first line', async () => {
    const { runner, engine, narrator, episode } = stage('A: 시작.');
    engine.playOutside(OTHER, 30_000);
    runner.start(episode);
    await advance(700);
    expect(narrator.spoken).toEqual([]);
    await advance(400);
    expect(engine.commands).toEqual(['pause']);
    expect(engine.snapshot().paused).toBe(true);
    expect(narrator.spoken).toEqual(['0:시작.']);
    // Faded out, then back at the listener's own volume once paused.
    expect(Math.min(...engine.gains)).toBe(0);
    expect(engine.gain).toBe(1);
  });

  it('pauses on the utterance in progress and says it again on resume', async () => {
    const { runner, narrator, episode } = stage('A: 하나. 둘. 셋.');
    runner.start(episode);
    await advance(1500);
    runner.pause();
    expect(runner.getState()).toMatchObject({ status: 'paused', lineIndex: 0, utteranceIndex: 1 });
    await advance(5000);
    expect(narrator.spoken).toEqual(['0:하나.', '0:둘.']);
    runner.resume();
    await advance(5000);
    expect(narrator.spoken).toEqual(['0:하나.', '0:둘.', '0:둘.', '0:셋.']);
    expect(runner.getState().status).toBe('ended');
  });

  it('steps back when music is started from somewhere else during a talk', async () => {
    const { runner, engine, narrator, episode } = stage('A: 하나. 둘. 셋.');
    runner.start(episode);
    await advance(1500);
    engine.playOutside(OTHER);
    await advance(50);
    expect(runner.getState()).toMatchObject({ status: 'paused', notice: 'interrupted', utteranceIndex: 1 });
    await advance(5000);
    expect(narrator.spoken).toEqual(['0:하나.', '0:둘.']);
    // The listener's music is left alone.
    expect(engine.snapshot().paused).toBe(false);
    expect(engine.commands).toEqual([]);
  });
});

describe('music', () => {
  it('plays a whole track and stops it just before its end', async () => {
    const { runner, engine, narrator, episode } = stage(['A: 들어 보자.', '> play one', 'B: 어땠어?'].join('\n'));
    runner.start(episode);
    await advance(2000);
    expect(engine.commands).toEqual(['play one@0']);
    expect(runner.getState()).toMatchObject({ cueIndex: 1 });
    // From the top of a track there is no fade-in.
    expect(engine.gains.every((gain) => gain === 1)).toBe(true);
    await advance(ONE.durationMs - END_GUARD_MS - 1000);
    expect(engine.snapshot().paused).toBe(false);
    await advance(1200);
    expect(engine.commands).toEqual(['play one@0', 'pause']);
    expect(engine.position()).toBeGreaterThanOrEqual(ONE.durationMs - END_GUARD_MS);
    expect(engine.position()).toBeLessThan(ONE.durationMs);
    await advance(2000);
    expect(narrator.spoken).toEqual(['0:들어 보자.', '1:어땠어?']);
    expect(runner.getState().status).toBe('ended');
  });

  it('plays a range: in from silence at the start, faded out and paused at the end', async () => {
    const { runner, engine, episode } = stage(['> play one 0:47–1:11', 'A: 여기까지.'].join('\n'));
    runner.start(episode);
    await advance(100);
    expect(engine.commands).toEqual(['play one@47000']);
    expect(engine.gains[0]).toBe(0);
    await advance(1000);
    expect(engine.gain).toBe(1);
    await advance(22_000);
    expect(engine.snapshot().paused).toBe(false);
    await advance(2000);
    expect(engine.commands).toEqual(['play one@47000', 'pause']);
    // The fade begins at 1:11 and takes a moment.
    expect(engine.position()).toBeGreaterThanOrEqual(71_000);
    expect(engine.position()).toBeLessThan(72_200);
    expect(engine.gain).toBe(1);
  });

  it('goes back within the track in the player with a seek instead of a new request', async () => {
    const { runner, engine, episode } = stage(['> play one to 1:00', 'A: 그 부분을 다시.', '> play one 0:20–0:30'].join('\n'));
    runner.start(episode);
    await advance(61_500);
    expect(engine.commands).toEqual(['play one@0', 'pause']);
    await advance(2000);
    expect(engine.commands).toEqual(['play one@0', 'pause', 'seek 20000', 'resume']);
    await advance(12_000);
    expect(engine.commands.at(-1)).toBe('pause');
    expect(runner.getState().status).toBe('ended');
  });

  it('carries on after a talk from where the fade-out began', async () => {
    const { runner, engine, episode } = stage(['> play one to 1:00', 'A: 잠깐 설명.', '> play to 1:30'].join('\n'));
    runner.start(episode);
    await advance(61_000);
    expect(engine.snapshot().paused).toBe(true);
    const pausedAt = engine.position();
    expect(pausedAt).toBeGreaterThan(60_500);
    await advance(1500);
    expect(engine.commands).toEqual(['play one@0', 'pause', 'seek 60000', 'resume']);
    await advance(31_000);
    expect(runner.getState().status).toBe('ended');
    expect(engine.position()).toBeGreaterThanOrEqual(90_000);
  });

  it('queues several tracks in one request and follows them', async () => {
    const { runner, engine, episode } = stage(['> play two + three to 0:30', 'A: 끝.'].join('\n'));
    runner.start(episode);
    await advance(1000);
    expect(engine.commands).toEqual(['play two+three@0']);
    expect(runner.getState().trackIndex).toBe(0);
    await advance(TWO.durationMs);
    expect(runner.getState().trackIndex).toBe(1);
    expect(engine.snapshot().track?.title).toBe('THREE');
    await advance(31_000);
    expect(engine.commands).toEqual(['play two+three@0', 'pause']);
    expect(engine.position()).toBeGreaterThanOrEqual(30_000);
  });

  it('turns shuffle off before queueing several tracks, so they come in the order written', async () => {
    const { runner, engine, episode } = stage('> play two + three to 0:30');
    engine.shuffle = true;
    engine.playOutside(OTHER);
    runner.start(episode);
    await advance(1000);
    expect(engine.commands).toEqual(['shuffle off', 'play two+three@0']);
    // A single track needs no such thing.
    const single = stage('> play one to 0:30');
    single.engine.shuffle = true;
    single.engine.playOutside(OTHER);
    single.runner.start(single.episode);
    await advance(1000);
    expect(single.engine.commands).toEqual(['play one@0']);
  });

  it('puts the next track on itself when the listener\'s repeat mode starts the first one over', async () => {
    const { runner, engine, episode } = stage(['> play two + three to 0:30', 'A: 끝.'].join('\n'));
    engine.repeatOne = true;
    runner.start(episode);
    await advance(TWO.durationMs + 1500);
    expect(engine.commands).toEqual(['play two+three@0', 'play three@0']);
    expect(runner.getState().trackIndex).toBe(1);
    await advance(32_000);
    expect(engine.commands.slice(2)).toEqual(['pause']);
    expect(engine.snapshot().track?.title).toBe('THREE');
    expect(engine.position()).toBeGreaterThanOrEqual(30_000);
  });

  it('pauses and resumes at the position it had', async () => {
    const { runner, engine, episode } = stage('> play one');
    runner.start(episode);
    await advance(40_000);
    runner.pause();
    await advance(10);
    expect(engine.commands).toEqual(['play one@0', 'pause']);
    await advance(60_000);
    runner.resume();
    await advance(1000);
    expect(engine.commands).toEqual(['play one@0', 'pause', 'resume']);
    expect(engine.position()).toBeGreaterThan(40_000);
    expect(engine.position()).toBeLessThan(42_000);
  });

  it('steps back when the listener pauses the player, and picks the track up again', async () => {
    const { runner, engine, episode } = stage('> play one');
    runner.start(episode);
    await advance(40_000);
    await engine.pause();
    await advance(10);
    expect(runner.getState()).toMatchObject({ status: 'paused', notice: 'interrupted', cueIndex: 0 });
    engine.playOutside(OTHER, 5000);
    await advance(20_000);
    runner.resume();
    await advance(1000);
    expect(runner.getState()).toMatchObject({ status: 'playing', notice: null });
    expect(engine.commands.at(-1)).toBe('play one@40000');
  });

  it('steps back when another track is put on', async () => {
    const { runner, engine, episode } = stage('> play one');
    runner.start(episode);
    await advance(GRACE_MS + 5000);
    engine.playOutside(OTHER);
    await advance(10);
    expect(runner.getState()).toMatchObject({ status: 'paused', notice: 'interrupted' });
    expect(engine.snapshot().paused).toBe(false);
  });

  it('reports that playback did not start', async () => {
    const { runner, engine, episode } = stage('> play one 0:30–1:00');
    engine.dead = true;
    runner.start(episode);
    await advance(SETTLE_MS - 500);
    expect(runner.getState().status).toBe('playing');
    await advance(1000);
    expect(runner.getState()).toMatchObject({ status: 'paused', notice: 'no-playback' });
    // Not left silent.
    expect(engine.gain).toBe(1);
  });

  it('waits for a slow player before timing the range', async () => {
    const { runner, engine, episode } = stage('> play one 0:30–0:40');
    engine.latencyMs = 3000;
    runner.start(episode);
    await advance(2900);
    expect(engine.snapshot().track).toBeNull();
    await advance(8000);
    expect(engine.snapshot().paused).toBe(false);
    await advance(4000);
    expect(engine.commands).toEqual(['play one@30000', 'pause']);
    expect(engine.position()).toBeGreaterThanOrEqual(40_000);
  });

  it('keeps the music down until the request has landed, not while the same track still shows its old position', async () => {
    const { runner, engine, episode } = stage('> play one + two to 0:05');
    engine.playOutside(ONE, 150_000);
    engine.latencyMs = 1500;
    runner.start(episode);
    await advance(1000);
    // ONE is still playing at 2:30 from before; the request for 0:00 has not landed.
    expect(engine.position()).toBeGreaterThan(150_000);
    expect(engine.gain).toBe(0);
    await advance(1500);
    expect(engine.position()).toBeLessThan(2000);
    expect(engine.gain).toBe(1);
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 0 });
  });

  it('treats a track that ran out before the guard as finished, and stops what follows', async () => {
    const { runner, engine, narrator, episode } = stage(['> play two', 'A: 다음.'].join('\n'));
    engine.autoplay = OTHER;
    runner.start(episode);
    await advance(TWO.durationMs - 1000);
    // The tab was asleep past the end of the track: Spotify has moved on by itself.
    engine.playOutside(OTHER, 0);
    await advance(GRACE_MS + 2000);
    expect(narrator.spoken).toEqual(['0:다음.']);
    expect(engine.snapshot().paused).toBe(true);
  });
});

describe('talk over the music', () => {
  const SCRIPT = ['> play one to 0:30', 'A~ 음악 위에서 하나. 둘.', '> play to 1:00', 'A: 끝.'].join('\n');

  it('turns the music down, keeps it playing, and brings it back up', async () => {
    const { runner, engine, narrator, episode } = stage(SCRIPT);
    runner.start(episode);
    await advance(30_100);
    expect(runner.getState().cueIndex).toBe(1);
    expect(engine.snapshot().paused).toBe(false);
    await advance(1700);
    expect(engine.gain).toBe(0.2);
    expect(narrator.spoken).toEqual(['0:음악 위에서 하나.', '0:둘.']);
    await advance(1500);
    expect(runner.getState().cueIndex).toBe(2);
    expect(engine.commands).toEqual(['play one@0']);
    await advance(1000);
    expect(engine.gain).toBe(1);
    await advance(30_000);
    expect(engine.commands).toEqual(['play one@0', 'pause']);
    expect(runner.getState().status).toBe('ended');
  });

  it('stops the music for the talk instead when set to, and goes back to it', async () => {
    const { runner, engine, narrator, episode } = stage(SCRIPT, { talkOver: 'pause' });
    runner.start(episode);
    await advance(31_500);
    expect(engine.commands).toEqual(['play one@0', 'pause']);
    expect(narrator.spoken).toEqual(['0:음악 위에서 하나.']);
    await advance(3000);
    expect(runner.getState().cueIndex).toBe(2);
    expect(engine.commands).toEqual(['play one@0', 'pause', 'seek 30000', 'resume']);
    expect(engine.gains).not.toContain(0.2);
  });

  it('does the same on a device whose volume cannot be set', async () => {
    const { runner, engine, episode } = stage(SCRIPT);
    engine.duckingMode = 'none';
    runner.start(episode);
    await advance(31_500);
    expect(engine.commands).toEqual(['play one@0', 'pause']);
    expect(engine.gains.every((gain) => gain === 1)).toBe(true);
  });

  it('sets the level in one step on another device, with no fades to silence', async () => {
    const { runner, engine, episode } = stage(SCRIPT);
    engine.duckingMode = 'coarse';
    runner.start(episode);
    await advance(31_000);
    expect(engine.gains).toEqual([0.2]);
    await advance(35_000);
    expect(runner.getState().status).toBe('ended');
    expect(engine.gains).toEqual([0.2, 1]);
  });

  it('keeps talking when the track runs out underneath', async () => {
    const { runner, engine, narrator, episode } = stage(['> play two to 0:10', 'A~ 하나. 둘. 셋. 넷. 다섯. 여섯. 일곱.', 'A: 끝.'].join('\n'));
    runner.start(episode);
    await advance(10_000 + 6000);
    expect(engine.snapshot().paused).toBe(true);
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 1 });
    await advance(5000);
    expect(narrator.spoken.at(-1)).toBe('0:끝.');
  });

  it('starts the track itself when the cue is jumped to', async () => {
    const { runner, engine, episode } = stage(SCRIPT);
    runner.start(episode, 1);
    await advance(500);
    expect(engine.commands).toEqual(['play one@30000']);
    await advance(1000);
    expect(engine.gain).toBe(0.2);
  });
});

describe('moving around', () => {
  const SCRIPT = ['A: 하나. 둘.', '> play one to 0:30', 'B: 셋.', '> play to 1:00', 'A: 넷.'].join('\n');

  it('jumps to a cue and plays on from there', async () => {
    const { runner, engine, narrator, episode } = stage(SCRIPT);
    runner.start(episode);
    await advance(500);
    runner.jump(3);
    await advance(500);
    // A stretch that carries a track on starts where the script has the track by then.
    expect(engine.commands).toEqual(['play one@30000']);
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 3 });
    await advance(32_000);
    expect(narrator.spoken).toEqual(['0:하나.', '0:넷.']);
  });

  it('jumps to a line within a talk', async () => {
    const { runner, narrator, episode } = stage(['A: 하나.', 'B: 둘.', 'A: 셋.'].join('\n'));
    runner.start(episode, 0, 2);
    await advance(2000);
    expect(narrator.spoken).toEqual(['0:셋.']);
  });

  it('skips forward, and back to the start of a cue that is under way', async () => {
    const { runner, narrator, episode } = stage(SCRIPT);
    runner.start(episode);
    await advance(1500);
    runner.previous();
    expect(runner.getState()).toMatchObject({ cueIndex: 0, lineIndex: 0, utteranceIndex: 0 });
    await advance(200);
    runner.next();
    expect(runner.getState().cueIndex).toBe(1);
    await advance(200);
    runner.previous();
    expect(runner.getState().cueIndex).toBe(0);
    expect(narrator.spoken.slice(0, 3)).toEqual(['0:하나.', '0:둘.', '0:하나.']);
  });

  it('toggles between playing and paused, and starts over once it has ended', async () => {
    const { runner, narrator, episode } = stage('A: 하나.');
    runner.start(episode);
    runner.toggle();
    expect(runner.getState().status).toBe('paused');
    runner.toggle();
    await advance(3000);
    expect(runner.getState().status).toBe('ended');
    runner.toggle();
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 0 });
    await advance(3000);
    expect(narrator.spoken).toEqual(['0:하나.', '0:하나.', '0:하나.']);
  });

  it('stops: the music pauses, the volume is the listener\'s again, nothing is loaded', async () => {
    const { runner, engine, episode } = stage(['> play one to 0:30', 'A~ 위에서 길게 하나. 둘. 셋.'].join('\n'));
    const detach = runner.attach();
    runner.start(episode);
    await advance(31_000);
    expect(engine.gain).toBe(0.2);
    detach();
    await advance(500);
    expect(runner.getState()).toMatchObject({ status: 'idle', episode: null });
    expect(engine.snapshot().paused).toBe(true);
    expect(engine.gain).toBe(1);
  });

  it('tells its listeners about every change, and only changes', async () => {
    const { runner, episode } = stage('A: 하나.');
    const listener = vi.fn();
    runner.subscribe(listener);
    runner.start(episode);
    const calls = listener.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    runner.pause();
    runner.pause();
    expect(listener.mock.calls.length).toBe(calls + 1);
  });
});
