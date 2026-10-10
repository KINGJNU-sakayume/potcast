import type { TrackIdentity } from '../domain/types';

export interface TimedLyricLine {
  startMs: number;
  endMs?: number;
  text: string;
}

export interface TimedLyrics {
  /** BCP 47 language of the lyrics as a whole, when known. */
  language?: string;
  lines: TimedLyricLine[];
  /** Attribution shown in the lyrics header, e.g. "LRCLIB" or "Test lines". */
  source?: string;
  /** The provider reports the track as instrumental (no lines expected). */
  instrumental?: boolean;
  /**
   * Which recording's timing these lines follow: the LRCLIB record ID and its
   * duration. A curated translation's segments are times in one LRCLIB record,
   * so they are applied only when this matches (see translation/curated).
   */
  timing?: LyricsTiming;
}

export interface LyricsTiming {
  /** LRCLIB record ID; null for providers without one. */
  lrclibId: number | null;
  /** Length of the recording the timestamps belong to. */
  durationMs: number | null;
}

export interface LyricsRequestOptions {
  signal?: AbortSignal;
  /**
   * The LRCLIB record a song note's curated translation was timed on. The
   * LRCLIB provider loads exactly that record (when its length matches the
   * track) instead of searching, so lyrics and translation share one timing.
   * Other providers ignore it.
   */
  lrclibId?: number;
}

/**
 * Replaceable source of timed lyrics. Spotify's Web API does not provide
 * lyrics, so the app depends only on this interface. Return `null` when no
 * timed lyrics exist; throw only for transient failures worth retrying.
 */
export interface LyricsProvider {
  readonly id: string;
  readonly label: string;
  getTimedLyrics(track: TrackIdentity, options?: LyricsRequestOptions): Promise<TimedLyrics | null>;
}

export class LyricsProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LyricsProviderError';
  }
}
