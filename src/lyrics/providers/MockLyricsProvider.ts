import type { TrackIdentity } from '../../domain/types';
import type { LyricsProvider, TimedLyrics } from '../types';
import { TEST_LINES_EN, buildTimedLines } from './testLines';

export interface MockLyricsOptions {
  /** Fixed lyrics per Spotify track ID (preview catalogue, tests). */
  byTrackId?: Readonly<Record<string, TimedLyrics>>;
  /** When true, any other track receives generic test lines spread across its duration. */
  generic?: boolean;
  /** Artificial latency, useful to see loading states during development. */
  delayMs?: number;
}

/** Local development provider. Output is always labelled "Test lines". */
export class MockLyricsProvider implements LyricsProvider {
  readonly id = 'mock';
  readonly label = 'Test lines';

  constructor(private readonly options: MockLyricsOptions = {}) {}

  async getTimedLyrics(track: TrackIdentity): Promise<TimedLyrics | null> {
    if (this.options.delayMs) await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    // Test lines follow no LRCLIB record, so curated translations (timed on one) never land on them;
    // a fixture may still bring its own `timing`.
    const timing = { lrclibId: null, durationMs: null };
    const fixed = this.options.byTrackId?.[track.spotifyTrackId];
    if (fixed) return { source: this.label, timing, ...fixed };
    if (!this.options.generic) return null;
    return { language: 'en', source: this.label, timing, lines: buildTimedLines(TEST_LINES_EN, track.durationMs) };
  }
}
