import type { TrackIdentity } from '../domain/types';
import { normaliseTitle } from '../editorial/lookup';
import { devWarn } from '../lib/devWarn';
import type { PlaybackEngine } from '../playback/engine';
import { monotonicNow, positionAt } from '../playback/playbackClock';
import type { PlayerStore } from '../playback/playerStore';
import type { PlayerSnapshot } from '../playback/types';
import { abortError, isAbortError, sleep, type NarrationMode, type Narrator, type Utterance } from './narrator';
import { unplayable } from './resolve';
import { splitUtterances } from './speechText';
import type { Cue, Episode, EpisodeTrack, MusicCue, OverCue, TalkCue } from './types';

export type EpisodeStatus = 'idle' | 'playing' | 'paused' | 'ended';

/**
 * Why an episode paused by itself:
 * - `interrupted`: playback was changed outside the episode (another track,
 *   pause or play pressed elsewhere), so the episode stepped back.
 * - `no-playback`: the music did not start (no device, a blocked autoplay…).
 */
export type EpisodeNotice = 'interrupted' | 'no-playback';

export interface EpisodeState {
  status: EpisodeStatus;
  episode: Episode | null;
  /** The cue being performed; `episode.cues.length` once it has ended. */
  cueIndex: number;
  /** In a talk or talk-over cue: the host's turn, and the utterance within it. */
  lineIndex: number;
  utteranceIndex: number;
  /** In a music cue that plays several tracks: which one is on. */
  trackIndex: number;
  notice: EpisodeNotice | null;
  narration: NarrationMode;
  /** What says a line that has no recording: the same as `narration` unless that is `recorded`. */
  spareNarration: Exclude<NarrationMode, 'recorded'>;
  /**
   * The episode is waiting at a stretch of music for the listener, who plays
   * it in Spotify themselves and says when they have heard it (see
   * RunnerOptions.music).
   */
  manual: boolean;
}

export interface RunnerOptions {
  /**
   * Who plays the music. `auto`: the episode drives the session's player.
   * `manual`: the listener does, in Spotify, wherever they like — the episode
   * shows what to play, waits to be told it has been heard, and never touches
   * the player. That works where the player cannot be driven at all (a phone
   * without an active device, an account without Premium), and nothing is
   * ever played over anything else.
   */
  music: 'auto' | 'manual';
  /** `duck`: the music plays on, turned down, under a talk-over. `pause`: it stops for it. */
  talkOver: 'duck' | 'pause';
  /** How loud the music stays under a talk-over, as a fraction of the listener's volume. */
  duckLevel: number;
}

export interface RunnerDependencies {
  engine: PlaybackEngine;
  store: PlayerStore;
  narrator: Narrator;
  options: () => RunnerOptions;
  now?: () => number;
}

/** After one of our own transport commands, the player may take this long to show it. */
export const GRACE_MS = 2500;
/** How long a play request may take to produce sound before the episode gives up waiting. */
export const SETTLE_MS = 8000;
/** A whole track is stopped this long before its end, so Spotify never runs on into something else. */
export const END_GUARD_MS = 250;
/** A pause or track change this close to a track's end is the track ending, not the listener. */
const END_SLACK_MS = 3000;
const FADE_OUT_MS = 800;
const FADE_IN_MS = 350;
const FADE_SWITCH_MS = 250;
const DUCK_MS = 450;
const UNDUCK_MS = 700;
const FADE_STEP_MS = 50;
const PAUSE_LAND_MS = 150;
/** Breathing room between utterances and between hosts, on top of the pause a recorded clip ends with. */
const UTTERANCE_GAP_MS = 140;
const TURN_GAP_MS = 300;
/** How many utterances ahead the narrator is told about, so their recordings are ready when their turn comes. */
const PREPARE_AHEAD = 14;
/** "Previous" restarts the cue once it has run this long, like a CD player. */
const RESTART_AFTER_MS = 3000;
/** A track this close to where it should be is not worth a seek. */
const SEEK_TOLERANCE_MS = 400;
/** How far from the requested position a track may be and still count as started there. */
const CONFIRM_WINDOW_MS = 2000;

/** The episode stepped back by itself (see EpisodeNotice). */
class Interrupted extends Error {
  constructor(readonly notice: EpisodeNotice) {
    super(notice);
  }
}

type Verdict = { done: true } | { waitMs: number } | { interrupt: EpisodeNotice };
type Entry = 'flow' | 'resume' | 'jump';

/** Whether the player is on this track of the episode. */
export function sameTrack(track: EpisodeTrack, playing: TrackIdentity | null): boolean {
  if (!playing) return false;
  if (playing.uri === track.uri || playing.spotifyTrackId === track.id) return true;
  // Spotify may play the same recording under another ID in the listener's market.
  const playingTitle = normaliseTitle(playing.title);
  const title = normaliseTitle(track.title);
  // A track from outside the album goes by the script's plain title; Spotify's may add the pressing to it ("… - 2016 Remaster").
  const sameTitle = playingTitle === title || (track.outside !== undefined && title.length > 0 && playingTitle.startsWith(title));
  return sameTitle && Math.abs(playing.durationMs - track.durationMs) < END_SLACK_MS;
}

const IDLE: EpisodeState = {
  status: 'idle',
  episode: null,
  cueIndex: 0,
  lineIndex: 0,
  utteranceIndex: 0,
  trackIndex: 0,
  notice: null,
  narration: 'captions',
  spareNarration: 'captions',
  manual: false,
};

/**
 * Performs an episode: speaks the hosts' lines through the narrator and
 * drives the session's playback engine for the music in between. It keeps no
 * playback state of its own — positions come from the PlayerStore's clock —
 * and it yields to the listener: when playback is changed from anywhere else
 * it pauses itself rather than fighting for the player.
 *
 * Pausing stops the utterance in progress. Resuming carries on inside it when
 * the hosts are recorded, and says it again from its start with a browser
 * voice (whose own pause and resume do not work the same everywhere).
 */
export class EpisodeRunner {
  private state: EpisodeState;
  private readonly listeners = new Set<() => void>();
  private readonly engine: PlaybackEngine;
  /** The session's player state, which the episode reads positions from. */
  readonly store: PlayerStore;
  private readonly narrator: Narrator;
  private readonly options: () => RunnerOptions;
  private readonly now: () => number;

  /** Stops whatever the current cue is waiting on. */
  private controller: AbortController | null = null;
  /** The fade / talk-over factor last sent to the engine. */
  private gain = 1;
  private rampId = 0;
  /** Counts runs, so cleanup left over from one never touches the next. */
  private epoch = 0;
  /** Monotonic time of our last transport command, and whether it left the music playing. */
  private lastCommandAt = Number.NEGATIVE_INFINITY;
  /** The last position seen in each track (by song key), to carry on from after a pause. */
  private readonly positions = new Map<string, number>();
  private cueStartedAt = 0;
  /** Ends the wait at a stretch of music the listener is playing themselves. */
  private heard: (() => void) | null = null;

  constructor(dependencies: RunnerDependencies) {
    this.engine = dependencies.engine;
    this.store = dependencies.store;
    this.narrator = dependencies.narrator;
    this.options = dependencies.options;
    this.now = dependencies.now ?? monotonicNow;
    this.state = { ...IDLE, ...this.narration() };
  }

  /* ── Store ───────────────────────────────────────────────────────────── */

  getState = (): EpisodeState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Connects the runner to its surroundings for as long as the session is
   * mounted; the returned function stops the episode and disconnects.
   */
  attach(): () => void {
    const unsubscribeNarrator = this.narrator.subscribe(() => this.update(this.narration()));
    // A tab closed in the middle of a fade must not leave the device turned down.
    const restore = () => void this.engine.setGain(1);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', restore);
    return () => {
      unsubscribeNarrator();
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', restore);
      this.stop();
    };
  }

  /** Re-reads whether lines are spoken or only shown (the voices loaded, or the listener chose another). */
  refresh(): void {
    this.update(this.narration());
  }

  private narration(): Pick<EpisodeState, 'narration' | 'spareNarration'> {
    const narration = this.narrator.mode();
    return { narration, spareNarration: narration === 'recorded' ? (this.narrator.fallbackMode?.() ?? 'captions') : narration };
  }

  private update(patch: Partial<EpisodeState>): void {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(patch) as Array<keyof EpisodeState>).some((key) => next[key] !== this.state[key]);
    if (!changed) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /* ── Controls ────────────────────────────────────────────────────────── */

  /** Starts an episode. Call from a click or key handler, so audio and speech are allowed to begin. */
  start(episode: Episode, cueIndex = 0, lineIndex = 0): void {
    this.abort();
    this.positions.clear();
    this.unlock();
    this.update({ ...IDLE, ...this.narration(), episode });
    this.enter(cueIndex, lineIndex, 'jump');
  }

  pause(): void {
    if (this.state.status !== 'playing') return;
    this.abort();
    this.update({ status: 'paused', notice: null });
    if (!this.handsOff()) void this.settleMusic();
  }

  /**
   * The listener has heard the stretch of music they were asked to play: the
   * episode goes on. Does nothing unless it is waiting for exactly that.
   */
  proceed(): void {
    this.heard?.();
  }

  /** Continues from the utterance or the position the episode stopped at. Call from a click or key handler. */
  resume(): void {
    const { status, episode } = this.state;
    if (!episode || status === 'playing') return;
    this.unlock();
    if (status === 'ended') {
      this.start(episode);
      return;
    }
    this.update({ status: 'playing', notice: null });
    void this.run('resume');
  }

  toggle(): void {
    if (this.state.status === 'playing') this.pause();
    else this.resume();
  }

  /** Goes to a cue (and a host's turn within it) and plays from there. Call from a click or key handler. */
  jump(cueIndex: number, lineIndex = 0): void {
    const { episode } = this.state;
    if (!episode) return;
    this.abort();
    this.unlock();
    this.enter(cueIndex, lineIndex, 'jump');
  }

  next(): void {
    const { episode, cueIndex } = this.state;
    if (episode && cueIndex < episode.cues.length - 1) this.jump(cueIndex + 1);
  }

  /** The start of this cue if it has been running a while, otherwise the cue before it. */
  previous(): void {
    const { episode, cueIndex, lineIndex, utteranceIndex, status } = this.state;
    if (!episode) return;
    const underway = lineIndex > 0 || utteranceIndex > 0 || (status === 'playing' && this.now() - this.cueStartedAt > RESTART_AFTER_MS);
    this.jump(underway || cueIndex === 0 ? Math.min(cueIndex, episode.cues.length - 1) : cueIndex - 1);
  }

  /** Ends the episode and lets go of the player. */
  stop(): void {
    if (!this.state.episode) return;
    const wasPlaying = this.state.status === 'playing';
    const handsOff = this.handsOff();
    this.abort();
    this.update({ ...IDLE, ...this.narration() });
    if (handsOff) return;
    if (wasPlaying) void this.settleMusic();
    else void this.applyGain(1);
  }

  /* ── The loop ────────────────────────────────────────────────────────── */

  private unlock(): void {
    this.narrator.unlock();
    if (!this.handsOff()) this.engine.activateAudio();
  }

  /** The music is the listener's to play: the player is not to be touched. */
  private handsOff(): boolean {
    return this.options().music === 'manual';
  }

  private abort(): void {
    this.rampId += 1;
    this.epoch += 1;
    this.controller?.abort();
    this.controller = null;
  }

  private enter(cueIndex: number, lineIndex: number, entry: Entry): void {
    const count = this.state.episode?.cues.length ?? 0;
    const index = Math.min(Math.max(0, cueIndex), count);
    this.update({ status: 'playing', notice: null, manual: false, cueIndex: index, lineIndex: Math.max(0, lineIndex), utteranceIndex: 0, trackIndex: 0 });
    void this.run(entry);
  }

  private async run(entry: Entry): Promise<void> {
    this.controller?.abort();
    this.epoch += 1;
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    let how = entry;
    try {
      for (;;) {
        const episode = this.state.episode;
        if (!episode) return;
        const cue: Cue | undefined = episode.cues[this.state.cueIndex];
        if (!cue) {
          await this.finish(signal);
          return;
        }
        if (how !== 'resume') this.cueStartedAt = this.now();
        this.prepare(episode, this.state.cueIndex, this.state.lineIndex, this.state.utteranceIndex);
        // Read at every cue, so a change of mind takes effect at the next one.
        const handsOff = this.handsOff();
        // Music Spotify cannot play here (a track from outside the album, not licensed in this market).
        const missing = cue.type === 'music' ? cue.tracks.some(unplayable) : cue.type === 'over' && unplayable(cue.track);
        this.update({ manual: handsOff && cue.type === 'music' && !missing });
        if (cue.type === 'music' && missing) {
          // Nothing to play and nothing to wait for: the hosts carry on.
        } else if (handsOff) {
          // The hosts only talk; the music in between is the listener's.
          if (cue.type === 'music') await this.waitForListener(signal);
          else await this.speakLines(cue, signal, how);
        } else if (cue.type === 'talk' || (cue.type === 'over' && missing)) await this.runTalk(cue, signal, how);
        else if (cue.type === 'over') await this.runOver(cue, signal, how);
        else await this.runMusic(cue, signal, how);
        if (signal.aborted) return;
        how = 'flow';
        this.update({ cueIndex: this.state.cueIndex + 1, lineIndex: 0, utteranceIndex: 0, trackIndex: 0, manual: false });
      }
    } catch (error) {
      // Paused, jumped or stopped: whoever aborted has already set the next state.
      if (isAbortError(error) || signal.aborted) return;
      this.controller = null;
      this.rampId += 1;
      this.update({ status: 'paused', notice: error instanceof Interrupted ? error.notice : 'interrupted' });
      // The listener (or a failure) has the player now: leave it where it is, at its own volume.
      if (!this.handsOff()) void this.applyGain(1);
      if (!(error instanceof Interrupted)) devWarn(`The episode stopped on an error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async finish(signal: AbortSignal): Promise<void> {
    if (!this.handsOff()) {
      if (this.audible()) await this.fadeTo(0, FADE_OUT_MS, signal);
      await this.pauseMusic();
    }
    this.controller = null;
    this.update({ status: 'ended', lineIndex: 0, utteranceIndex: 0, trackIndex: 0 });
  }

  /* ── Music the listener plays ────────────────────────────────────────── */

  /** Waits until the listener says they have heard the stretch (`proceed`), or the episode moves elsewhere. */
  private waitForListener(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const done = (act: () => void) => {
        if (this.heard === onHeard) this.heard = null;
        signal.removeEventListener('abort', onAbort);
        act();
      };
      const onHeard = () => done(resolve);
      const onAbort = () => done(() => reject(abortError()));
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      this.heard = onHeard;
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /* ── Talk ────────────────────────────────────────────────────────────── */

  /** Tells the narrator what is said from here on: the rest of this cue and the talk after it. */
  private prepare(episode: Episode, cueIndex: number, lineIndex: number, utteranceIndex: number): void {
    if (!this.narrator.prepare) return;
    const upcoming: Utterance[] = [];
    for (let c = cueIndex; c < episode.cues.length && upcoming.length < PREPARE_AHEAD; c += 1) {
      const cue = episode.cues[c]!;
      if (cue.type === 'music') continue;
      for (let line = c === cueIndex ? lineIndex : 0; line < cue.lines.length; line += 1) {
        const turn = cue.lines[line]!;
        const utterances = splitUtterances(turn.text);
        for (let i = c === cueIndex && line === lineIndex ? utteranceIndex : 0; i < utterances.length; i += 1) {
          upcoming.push(this.utterance(episode, turn.host, utterances[i]!));
        }
      }
    }
    this.narrator.prepare(upcoming.slice(0, PREPARE_AHEAD));
  }

  private utterance(episode: Episode, hostId: string, text: string): Utterance {
    const voiceSlot = Math.max(0, episode.hosts.findIndex((host) => host.id === hostId));
    return { text, voiceSlot, voice: episode.hosts[voiceSlot]?.voice, say: episode.say };
  }

  private async runTalk(cue: TalkCue | OverCue, signal: AbortSignal, entry: Entry): Promise<void> {
    if (this.audible()) {
      await this.fadeTo(0, FADE_OUT_MS, signal);
      await this.pauseMusic();
    } else if (this.gain !== 1) {
      await this.applyGain(1);
    }
    // The music is meant to stay stopped: if it starts, someone pressed play elsewhere.
    await this.guarded(
      signal,
      (inner) => this.speakLines(cue, inner, entry),
      () => (this.audible() && !this.settling() ? { interrupt: 'interrupted' } : { waitMs: 1000 }),
    );
  }

  private async speakLines(cue: TalkCue | OverCue, signal: AbortSignal, entry: Entry): Promise<void> {
    const episode = this.state.episode;
    if (!episode) return;
    // Where the cue was left, when it is being resumed.
    const firstLine = this.state.lineIndex;
    const firstUtterance = this.state.utteranceIndex;
    let resume = entry === 'resume';
    for (let line = firstLine; line < cue.lines.length; line += 1) {
      const turn = cue.lines[line]!;
      const utterances = splitUtterances(turn.text);
      for (let i = line === firstLine ? firstUtterance : 0; i < utterances.length; i += 1) {
        this.update({ lineIndex: line, utteranceIndex: i });
        const { text, ...who } = this.utterance(episode, turn.host, utterances[i]!);
        await this.narrator.speak(text, { ...who, resume, signal });
        resume = false;
        // Said: a pause in the gap that follows must not bring this utterance back.
        const more = i < utterances.length - 1;
        if (more) this.update({ utteranceIndex: i + 1 });
        else if (line < cue.lines.length - 1) this.update({ lineIndex: line + 1, utteranceIndex: 0 });
        await sleep(more ? UTTERANCE_GAP_MS : TURN_GAP_MS, signal);
      }
    }
  }

  /* ── Talk over the music ─────────────────────────────────────────────── */

  private async runOver(cue: OverCue, signal: AbortSignal, entry: Entry): Promise<void> {
    const { talkOver, duckLevel } = this.options();
    const level = Math.min(1, Math.max(0, duckLevel));
    // Started on its own, the cue puts the track where the script has it by now.
    if (entry === 'jump') this.positions.set(cue.track.key, cue.fromMs);
    // Without a volume to turn down (a phone, a speaker that refuses), the music stops for the talk instead.
    if (talkOver === 'pause' || this.engine.ducking() === 'none') {
      await this.runTalk(cue, signal, entry);
      return;
    }

    const snapshot = this.snapshot();
    if (entry === 'flow' && sameTrack(cue.track, snapshot.track) && !snapshot.paused) {
      await this.fadeTo(level, DUCK_MS, signal);
    } else {
      await this.startMusic([cue.track], this.positions.get(cue.track.key) ?? cue.fromMs, level, signal);
    }

    let ended = false;
    await this.guarded(
      signal,
      (inner) => this.speakLines(cue, inner, entry),
      (): Verdict => {
        if (ended) return { waitMs: 1000 };
        const now = this.now();
        const current = this.snapshot();
        if (!sameTrack(cue.track, current.track)) return this.settling() ? { waitMs: 250 } : { interrupt: 'interrupted' };
        const duration = current.durationMs > 0 ? current.durationMs : cue.track.durationMs;
        const position = positionAt(current, now);
        if (current.paused) {
          if (this.settling()) return { waitMs: 250 };
          if ((this.positions.get(cue.track.key) ?? 0) < duration - END_SLACK_MS) return { interrupt: 'interrupted' };
          ended = true;
          return { waitMs: 1000 };
        }
        this.positions.set(cue.track.key, position);
        if (position >= duration - END_GUARD_MS) {
          // The talk outlasted the track: stop the player there and keep talking.
          ended = true;
          void this.pauseMusic();
          return { waitMs: 1000 };
        }
        return { waitMs: duration - END_GUARD_MS - position };
      },
    );
    // What comes next decides what happens to the music: a talk fades it out, a "> play to …" brings it back up.
  }

  /* ── Music ───────────────────────────────────────────────────────────── */

  private async runMusic(cue: MusicCue, signal: AbortSignal, entry: Entry): Promise<void> {
    let index = entry === 'resume' ? Math.min(this.state.trackIndex, cue.tracks.length - 1) : 0;
    const firstTrack = cue.tracks[index]!;
    const snapshot = this.snapshot();
    const loaded = sameTrack(firstTrack, snapshot.track);

    const remembered = this.positions.get(firstTrack.key);
    let startMs: number;
    if (entry === 'resume') startMs = remembered ?? (index === 0 ? (cue.fromMs ?? cue.fallbackFromMs) : 0);
    else if (entry === 'jump') startMs = cue.fromMs ?? cue.fallbackFromMs;
    // Carrying on after a talk goes back to where the fade-out began, so nothing is lost under it.
    else startMs = cue.fromMs ?? remembered ?? cue.fallbackFromMs;

    if (entry === 'flow' && cue.fromMs === null && loaded && !snapshot.paused) {
      // Already playing (after a talk-over): only bring it back up.
      void this.fadeTo(1, UNDUCK_MS, signal).catch(() => undefined);
    } else {
      await this.startMusic(cue.tracks.slice(index), startMs, 1, signal);
    }

    const isLast = () => index === cue.tracks.length - 1;
    let lastPosition = positionAt(this.snapshot(), this.now());
    for (;;) {
      /** An earlier track of several started over instead of running on (the listener's repeat mode). */
      let repeated = false;
      await this.until(signal, (): Verdict => {
        const now = this.now();
        const current = this.snapshot();
        const track = cue.tracks[index]!;

        if (!sameTrack(track, current.track)) {
          const following = cue.tracks[index + 1];
          if (following && sameTrack(following, current.track)) {
            index += 1;
            lastPosition = 0;
            this.update({ trackIndex: index });
            return { waitMs: 0 };
          }
          if (this.settling()) return { waitMs: 250 };
          // The last track ran out and the player moved on by itself.
          if (isLast() && lastPosition >= track.durationMs - END_SLACK_MS) return { done: true };
          return { interrupt: 'interrupted' };
        }

        const duration = current.durationMs > 0 ? current.durationMs : track.durationMs;
        const position = positionAt(current, now);
        if (current.paused) {
          if (this.settling()) return { waitMs: 250 };
          if (isLast() && Math.max(lastPosition, position) >= duration - END_SLACK_MS) return { done: true };
          return { interrupt: 'interrupted' };
        }

        if (!isLast() && lastPosition >= duration - END_SLACK_MS && position < END_SLACK_MS) {
          repeated = true;
          return { done: true };
        }
        lastPosition = position;
        this.positions.set(track.key, position);
        // An earlier track of several runs into the next one by itself.
        if (!isLast()) return { waitMs: 1000 };
        const target = cue.untilMs ?? duration - END_GUARD_MS;
        if (position >= target) return { done: true };
        return { waitMs: current.buffering ? 500 : target - position };
      });
      if (!repeated) break;
      // Put the next track on ourselves.
      index += 1;
      lastPosition = 0;
      this.update({ trackIndex: index });
      await this.startMusic(cue.tracks.slice(index), 0, 1, signal);
    }

    const next = this.state.episode?.cues[this.state.cueIndex + 1];
    if (cue.untilMs === null) {
      // The end of the track: stop before Spotify plays whatever it would play next.
      this.positions.delete(cue.tracks[index]!.key);
      await this.pauseMusic();
    } else if (next && (next.type === 'over' || (next.type === 'music' && next.fromMs === null))) {
      // The same track carries on under a talk-over or into the next stretch.
    } else if (this.audible()) {
      await this.fadeTo(0, FADE_OUT_MS, signal);
      await this.pauseMusic();
    }
  }

  /**
   * Gets `tracks[0]` sounding at `startMs` and brings it to `level`. A track
   * already in the player is moved with a seek; any other needs a play
   * request. Fails with `no-playback` when nothing starts.
   */
  private async startMusic(tracks: readonly EpisodeTrack[], startMs: number, level: number, signal: AbortSignal): Promise<void> {
    const track = tracks[0]!;
    const snapshot = this.snapshot();
    // A track still shown after playback left every device (a long talk can outlast the session) cannot be seeked.
    const loaded = sameTrack(track, snapshot.track) && snapshot.source !== 'none';
    const position = loaded ? positionAt(snapshot, this.now()) : 0;
    const audible = this.audible();
    const smooth = this.engine.ducking() === 'smooth';

    // Starting inside a track comes up from silence; the top of a track starts as it was recorded.
    const fromSilence = smooth && startMs > 0;
    if (audible) await this.fadeTo(0, FADE_SWITCH_MS, signal);
    else if (fromSilence) await this.applyGain(0);
    else if (this.gain !== level) await this.applyGain(level);

    let confirmed = false;
    // More tracks than one are queued together, so that they run on without a gap.
    if (loaded && tracks.length === 1) {
      this.commanded();
      if (Math.abs(startMs - position) > SEEK_TOLERANCE_MS) await this.engine.seek(startMs);
      if (this.snapshot().paused) await this.engine.resume();
      this.commanded();
      confirmed = await this.confirm(track, startMs, GRACE_MS, signal);
    }
    if (!confirmed) {
      this.commanded();
      // Several tracks have to come in the order written: shuffle would rearrange them.
      if (tracks.length > 1 && this.snapshot().shuffle) await this.engine.setShuffle(false);
      await this.engine.play({ uris: tracks.map((item) => item.uri), positionMs: Math.max(0, Math.round(startMs)) });
      this.commanded();
      confirmed = await this.confirm(track, startMs, SETTLE_MS, signal);
    }
    if (!confirmed) {
      await this.applyGain(1);
      throw new Interrupted('no-playback');
    }
    if (this.gain === level) return;
    if (smooth) void this.fadeTo(level, FADE_IN_MS, signal).catch(() => undefined);
    else await this.applyGain(level);
  }

  /**
   * Waits until `track` is playing from about `startMs`; false when it is not
   * by `timeoutMs` after the last command. The position is checked because the
   * player may still be showing the same track where it was before the command.
   */
  private async confirm(track: EpisodeTrack, startMs: number, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
    let playing = false;
    await this.until(signal, (): Verdict => {
      const now = this.now();
      const snapshot = this.snapshot();
      const sinceCommand = now - this.lastCommandAt;
      const position = positionAt(snapshot, now);
      playing =
        sameTrack(track, snapshot.track) &&
        !snapshot.paused &&
        position >= startMs - CONFIRM_WINDOW_MS &&
        position <= startMs + sinceCommand + CONFIRM_WINDOW_MS;
      if (playing || sinceCommand >= timeoutMs) return { done: true };
      return { waitMs: 200 };
    });
    return playing;
  }

  /* ── Player helpers ──────────────────────────────────────────────────── */

  private snapshot(): PlayerSnapshot {
    return this.store.getState().snapshot;
  }

  private audible(): boolean {
    const snapshot = this.snapshot();
    return Boolean(snapshot.track) && !snapshot.paused;
  }

  private commanded(): void {
    this.lastCommandAt = this.now();
  }

  private settling(): boolean {
    return this.now() - this.lastCommandAt < GRACE_MS;
  }

  private applyGain(level: number): Promise<void> {
    this.gain = level;
    return this.engine.setGain(level);
  }

  /** Pauses the player if it is playing, then returns its volume to the listener's. */
  private async pauseMusic(): Promise<void> {
    if (this.audible()) {
      const snapshot = this.snapshot();
      this.commanded();
      await this.engine.pause();
      this.commanded();
      // Give the pause a moment to land, so the volume does not come back up on the last note.
      if (snapshot.source !== 'preview') await new Promise((resolve) => setTimeout(resolve, PAUSE_LAND_MS));
    }
    if (this.gain !== 1) await this.applyGain(1);
  }

  /** After a pause or a stop: remembers where the music was and stops it. */
  private async settleMusic(): Promise<void> {
    const epoch = this.epoch;
    const snapshot = this.snapshot();
    if (snapshot.track && !snapshot.paused) {
      const cue = this.state.episode?.cues[this.state.cueIndex];
      const track = cue?.type === 'music' ? cue.tracks[this.state.trackIndex] : cue?.type === 'over' ? cue.track : undefined;
      if (track && sameTrack(track, snapshot.track)) this.positions.set(track.key, positionAt(snapshot, this.now()));
      this.commanded();
      await this.engine.pause();
      this.commanded();
      if (snapshot.source !== 'preview') await new Promise((resolve) => setTimeout(resolve, PAUSE_LAND_MS));
    }
    // Played on in the meantime: the new run owns the volume.
    if (epoch === this.epoch && this.gain !== 1) await this.applyGain(1);
  }

  /**
   * Moves the gain to `level` over `ms`. Only this browser's player takes a
   * smooth ramp; another device gets the talk-over level in one step and no
   * fades to silence (each step is a Web API request).
   */
  private async fadeTo(level: number, ms: number, signal: AbortSignal): Promise<void> {
    const id = (this.rampId += 1);
    const from = this.gain;
    if (from === level) return;
    const ducking = this.engine.ducking();
    if (ducking === 'none') return;
    if (ducking === 'coarse') {
      if (level > 0) await this.applyGain(level);
      return;
    }
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    for (let step = 1; step <= steps; step += 1) {
      await sleep(ms / steps, signal);
      if (id !== this.rampId) return;
      const t = step / steps;
      // Ease in and out: equal steps of volume sound abrupt at both ends.
      const eased = t * t * (3 - 2 * t);
      void this.applyGain(from + (level - from) * eased);
    }
  }

  /* ── Waiting ─────────────────────────────────────────────────────────── */

  /**
   * Re-evaluates on every player change and after the wait it asks for, until
   * the verdict is done (resolves) or an interruption (rejects).
   */
  private until(signal: AbortSignal, evaluate: () => Verdict): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let finished = false;
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener('abort', onAbort);
        if (error === undefined) resolve();
        else reject(error);
      };
      const onAbort = () => finish(abortError());
      const step = () => {
        if (finished) return;
        if (timer) clearTimeout(timer);
        timer = null;
        let verdict: Verdict;
        try {
          verdict = evaluate();
        } catch (error) {
          finish(error);
          return;
        }
        if ('done' in verdict) finish();
        else if ('interrupt' in verdict) finish(new Interrupted(verdict.interrupt));
        else timer = setTimeout(step, Math.min(1000, Math.max(15, verdict.waitMs)));
      };
      const unsubscribe = this.store.subscribe(step);
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      step();
    });
  }

  /** Runs `task` while `watch` keeps an eye on the player; an interruption stops the task. */
  private async guarded(signal: AbortSignal, task: (signal: AbortSignal) => Promise<void>, watch: () => Verdict): Promise<void> {
    const inner = new AbortController();
    const forward = () => inner.abort();
    if (signal.aborted) inner.abort();
    else signal.addEventListener('abort', forward, { once: true });
    const watching = this.until(inner.signal, watch);
    // Settled below through the race or the abort; never left unhandled.
    watching.catch(() => undefined);
    try {
      await Promise.race([task(inner.signal), watching.then(() => new Promise<never>(() => undefined))]);
    } finally {
      signal.removeEventListener('abort', forward);
      inner.abort();
    }
  }
}
