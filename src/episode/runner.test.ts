import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerStore } from '../playback/playerStore';
import { END_GUARD_MS, EpisodeRunner, GRACE_MS, sameTrack, SETTLE_MS, type RunnerOptions } from './runner';
import { episodeFrom, HEAD_WITH_SOURCE, identity, ScriptedNarrator, SOURCE_ID, StageEngine, timedNote, track } from './testing';
import type { OutsideFound } from './types';

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
  const settings: RunnerOptions = { music: 'auto', talkOver: 'duck', duckLevel: 0.2, ...options };
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
    // Only the utterance the pause stopped is handed back as one to carry on with.
    expect(narrator.calls.map((call) => Boolean(call.resume))).toEqual([false, false, true, false]);
  });

  it('does not bring back an utterance that was finished when the pause came', async () => {
    const { runner, narrator, episode } = stage('A: 하나. 둘.\nB: 셋.');
    runner.start(episode);
    // 1000 ms of "하나.", then the short gap before "둘.".
    await advance(1050);
    runner.pause();
    expect(runner.getState()).toMatchObject({ status: 'paused', lineIndex: 0, utteranceIndex: 1 });
    runner.resume();
    await advance(1050);
    // The same in the longer gap between two hosts.
    runner.pause();
    expect(runner.getState()).toMatchObject({ status: 'paused', lineIndex: 1, utteranceIndex: 0 });
    runner.resume();
    await advance(5000);
    expect(narrator.spoken).toEqual(['0:하나.', '0:둘.', '1:셋.']);
    expect(runner.getState().status).toBe('ended');
  });

  it('hands each line over with its host\'s recorded voice and the episode\'s readings', async () => {
    const { runner, narrator, episode } = stage('A: 하나.\nB: 둘.');
    episode.say = [{ from: '하나', to: '일' }];
    runner.start(episode);
    await advance(5000);
    expect(narrator.calls).toEqual([
      { voiceSlot: 0, voice: 'F1', say: episode.say, resume: false },
      { voiceSlot: 1, voice: 'M2', say: episode.say, resume: false },
    ]);
  });

  it('announces what is said next, past the music, so recordings can be fetched ahead', async () => {
    const { runner, narrator, episode } = stage(['A: 하나. 둘.', '> play one to 0:30', 'B: 셋.', '> play one from 1:00 to 1:30', 'A~ 넷.'].join('\n'));
    runner.start(episode);
    await advance(100);
    expect(narrator.prepared[0]!.map((utterance) => `${utterance.voice}:${utterance.text}`)).toEqual(['F1:하나.', 'F1:둘.', 'M2:셋.', 'F1:넷.']);
    // Started in the middle: only what is still to come.
    runner.jump(2);
    await advance(100);
    expect(narrator.prepared.at(-1)!.map((utterance) => utterance.text)).toEqual(['셋.', '넷.']);
  });

  it('starts a line from its top after a jump, even the one a pause had stopped', async () => {
    const { runner, narrator, episode } = stage('A: 하나. 둘.');
    runner.start(episode);
    await advance(500);
    runner.pause();
    runner.jump(0);
    await advance(5000);
    expect(narrator.calls.map((call) => Boolean(call.resume))).toEqual([false, false, false]);
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

describe('music the listener plays themselves', () => {
  const BODY = ['A: 하나.', '> play one to 0:30', 'B~ 둘.', '> play to end', 'A: 셋.'].join('\n');

  it('talks, waits at each stretch of music to be told it has been heard, and never touches the player', async () => {
    const { runner, engine, narrator, episode } = stage(BODY, { music: 'manual' });
    runner.start(episode);
    await advance(5000);
    expect(narrator.spoken).toEqual(['0:하나.']);
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 1, manual: true });

    // However long the listener takes, the episode stays where it is.
    await advance(600_000);
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 1, manual: true });

    runner.proceed();
    await advance(5000);
    // What was written as talk over the music is simply said.
    expect(narrator.spoken).toEqual(['0:하나.', '1:둘.']);
    expect(runner.getState()).toMatchObject({ cueIndex: 3, manual: true });

    runner.proceed();
    await advance(5000);
    expect(narrator.spoken).toEqual(['0:하나.', '1:둘.', '0:셋.']);
    expect(runner.getState()).toMatchObject({ status: 'ended', manual: false });
    expect(engine.commands).toEqual([]);
    expect(engine.gains).toEqual([]);
  });

  it('leaves alone whatever the listener has playing', async () => {
    const { runner, engine, narrator, episode } = stage(BODY, { music: 'manual' });
    engine.playOutside(OTHER, 30_000);
    runner.start(episode);
    await advance(5000);
    // In the other mode a talk would have stopped this music, and music started elsewhere would have stopped the talk.
    expect(narrator.spoken).toEqual(['0:하나.']);
    expect(runner.getState()).toMatchObject({ status: 'playing', notice: null });
    runner.pause();
    runner.stop();
    await advance(1000);
    expect(engine.commands).toEqual([]);
    expect(engine.snapshot().paused).toBe(false);
  });

  it('pauses and continues at the wait, and can be skipped past or gone back from', async () => {
    const { runner, narrator, episode } = stage(BODY, { music: 'manual' });
    runner.start(episode, 1);
    await advance(100);
    expect(runner.getState()).toMatchObject({ cueIndex: 1, manual: true });
    runner.pause();
    expect(runner.getState()).toMatchObject({ status: 'paused', cueIndex: 1 });
    // Not waiting any more: saying "heard it" while paused does nothing.
    runner.proceed();
    await advance(1000);
    expect(runner.getState()).toMatchObject({ status: 'paused', cueIndex: 1 });
    runner.resume();
    await advance(100);
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 1, manual: true });
    runner.next();
    await advance(100);
    expect(runner.getState()).toMatchObject({ cueIndex: 2, manual: false });
    expect(narrator.spoken).toEqual(['1:둘.']);
  });

  it('takes a change of mind at the next cue', async () => {
    const { runner, engine, episode, settings } = stage(BODY, { music: 'manual' });
    runner.start(episode, 1);
    await advance(100);
    settings.music = 'auto';
    runner.proceed();
    await advance(5000);
    // The talk-over now needs its track, which the episode starts itself.
    expect(engine.commands[0]).toBe('play one@30000');
    expect(runner.getState().manual).toBe(false);
  });

  it('does nothing when asked to go on while it is not waiting', async () => {
    const { runner, narrator, episode } = stage('A: 하나. 둘.', { music: 'manual' });
    runner.proceed();
    runner.start(episode);
    runner.proceed();
    await advance(5000);
    expect(narrator.spoken).toEqual(['0:하나.', '0:둘.']);
  });
});

describe('a track from outside the album', () => {
  const SOURCE = { ...track('source', 442_000, 'Source Song'), key: '@source', id: SOURCE_ID, uri: `spotify:track:${SOURCE_ID}` };
  const BODY = ['A: 하나.', '> play @source 0:47–0:52', 'B~ 둘.', '> play to 0:55', 'A: 셋.', '> play one to 0:05', 'A: 넷.'].join('\n');

  function outside(found?: Record<string, OutsideFound>, options: Partial<RunnerOptions> = {}) {
    const store = new PlayerStore();
    const engine = new StageEngine(store, [...TRACKS, SOURCE]);
    const narrator = new ScriptedNarrator();
    const settings: RunnerOptions = { music: 'auto', talkOver: 'duck', duckLevel: 0.2, ...options };
    const runner = new EpisodeRunner({ engine, store, narrator, options: () => settings });
    const episode = episodeFrom(BODY, TRACKS, NOTES, { head: HEAD_WITH_SOURCE, found });
    return { store, engine, narrator, runner, episode };
  }

  it('is played by its own URI, talked over and stopped like one of the album\'s', async () => {
    const { runner, engine, narrator, episode } = outside();
    runner.start(episode);
    await advance(60_000);
    expect(runner.getState().status).toBe('ended');
    expect(narrator.spoken).toEqual(['0:하나.', '1:둘.', '0:셋.', '0:넷.']);
    expect(engine.commands.filter((command) => command.startsWith('play'))).toEqual([`play ${SOURCE_ID}@47000`, 'play one@0']);
  });

  it('is recognised when Spotify plays it under another ID and with the pressing added to its title', () => {
    const { episode } = outside();
    const cue = episode.cues[1]!;
    const source = cue.type === 'music' ? cue.tracks[0]! : null;
    expect(source?.outside).toBeDefined();
    const playing = (title: string, durationMs: number) => identity({ ...track('another-pressing', durationMs, title) });
    expect(sameTrack(source!, playing('Source Song - 2016 Remaster', 441_000))).toBe(true);
    expect(sameTrack(source!, playing('Source Song', 442_500))).toBe(true);
    // Another recording of it is another track: the length tells them apart.
    expect(sameTrack(source!, playing('Source Song - Live', 600_000))).toBe(false);
    expect(sameTrack(source!, playing('Another Song', 442_000))).toBe(false);
    expect(sameTrack(source!, null)).toBe(false);
    // The album's own tracks are matched by their exact title, as before.
    expect(sameTrack(ONE, playing('ONE', 200_000))).toBe(true);
    expect(sameTrack(ONE, playing('ONE - Live', 200_000))).toBe(false);
  });

  it('is gone past without a sound when Spotify cannot play it here, and what was to be said over it is simply said', async () => {
    const found = { [SOURCE_ID]: { id: SOURCE_ID, uri: SOURCE.uri, durationMs: 442_000, images: [], playable: false } };
    const { runner, engine, narrator, episode } = outside(found);
    runner.start(episode);
    await advance(60_000);
    expect(runner.getState().status).toBe('ended');
    expect(narrator.spoken).toEqual(['0:하나.', '1:둘.', '0:셋.', '0:넷.']);
    // Nothing was asked of the player for the missing track, and the album's own track still played.
    expect(engine.commands.filter((command) => command.startsWith('play'))).toEqual(['play one@0']);
  });

  it('is not waited for either when the listener plays the music themselves and it cannot be played', async () => {
    const found = { [SOURCE_ID]: { id: SOURCE_ID, uri: SOURCE.uri, durationMs: 442_000, images: [], playable: false } };
    const { runner, engine, narrator, episode } = outside(found, { music: 'manual' });
    runner.start(episode);
    await advance(20_000);
    // Straight through to the album's own track, which is the listener's to play.
    expect(narrator.spoken).toEqual(['0:하나.', '1:둘.', '0:셋.']);
    expect(runner.getState()).toMatchObject({ status: 'playing', cueIndex: 5, manual: true });
    expect(engine.commands).toEqual([]);
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
