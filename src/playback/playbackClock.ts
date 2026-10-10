import type { PlayerSnapshot } from './types';

/** Monotonic clock used for all playback position arithmetic. */
export const monotonicNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

/**
 * The centralised playback clock: derives the current position from the last
 * observed player state. It never runs an independent timeline — while
 * playing it interpolates from the latest SDK/Web API sample, and it stops at
 * the sample when paused or buffering.
 */
export function positionAt(snapshot: PlayerSnapshot, now: number): number {
  if (!snapshot.track) return 0;
  const advancing = !snapshot.paused && !snapshot.buffering;
  const elapsed = advancing ? Math.max(0, now - snapshot.sampledAt) : 0;
  const position = snapshot.positionMs + elapsed;
  const duration = snapshot.durationMs > 0 ? snapshot.durationMs : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(0, position), duration);
}

export function remainingAt(snapshot: PlayerSnapshot, now: number): number {
  return Math.max(0, snapshot.durationMs - positionAt(snapshot, now));
}

export function progressFraction(snapshot: PlayerSnapshot, now: number): number {
  if (!snapshot.track || snapshot.durationMs <= 0) return 0;
  return positionAt(snapshot, now) / snapshot.durationMs;
}
