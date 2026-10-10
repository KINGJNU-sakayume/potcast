import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatDurationForSpeech,
  formatRelativeTime,
  formatReleaseDate,
  formatRuntime,
  formatTrackNumber,
  releaseYear,
} from './format';

describe('formatDuration', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatDuration(190_000)).toBe('3:10');
    expect(formatDuration(59_999)).toBe('0:59');
    expect(formatDuration(61_000)).toBe('1:01');
  });

  it('adds hours past sixty minutes', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('guards against empty or invalid values', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });

  it('has a spoken form for assistive technology', () => {
    expect(formatDurationForSpeech(190_000)).toBe('3 minutes 10 seconds');
    expect(formatDurationForSpeech(61_000)).toBe('1 minute 1 second');
  });
});

describe('formatRuntime', () => {
  it('formats album runtimes', () => {
    expect(formatRuntime(39 * 60_000 + 40_000)).toBe('40 min');
    expect(formatRuntime(72 * 60_000)).toBe('1 hr 12 min');
    expect(formatRuntime(120 * 60_000)).toBe('2 hr');
  });
});

describe('release dates', () => {
  it('respects Spotify release_date_precision', () => {
    expect(formatReleaseDate('2019-05-17', 'day')).toBe('May 17, 2019');
    expect(formatReleaseDate('1981-12', 'month')).toBe('December 1981');
    expect(formatReleaseDate('2020', 'year')).toBe('2020');
    expect(formatReleaseDate(null, null)).toBeNull();
    expect(releaseYear('2023-11-15')).toBe('2023');
  });
});

describe('small formatters', () => {
  it('pads track numbers', () => {
    expect(formatTrackNumber(3)).toBe('03');
    expect(formatTrackNumber(12)).toBe('12');
  });

  it('describes recent plays relative to now', () => {
    const now = Date.parse('2026-09-27T12:00:00Z');
    expect(formatRelativeTime('2026-09-27T11:59:50Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-09-27T11:56:00Z', now)).toBe('4 minutes ago');
    expect(formatRelativeTime('2026-09-26T12:00:00Z', now)).toBe('yesterday');
  });
});
