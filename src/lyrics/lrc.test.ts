import { describe, expect, it } from 'vitest';
import { parseLrc } from './lrc';

describe('parseLrc', () => {
  it('parses timestamps with centisecond and millisecond precision', () => {
    const lines = parseLrc('[00:01.50]first\n[00:02.250]second\n[01:03]third');
    expect(lines.map((l) => l.startMs)).toEqual([1_500, 2_250, 63_000]);
    expect(lines.map((l) => l.text)).toEqual(['first', 'second', 'third']);
  });

  it('sets endMs to the next timed entry and treats empty lines as gaps', () => {
    const lines = parseLrc('[00:10.00]sung\n[00:14.00]\n[00:20.00]again');
    expect(lines).toEqual([
      { startMs: 10_000, endMs: 14_000, text: 'sung' },
      { startMs: 20_000, text: 'again' },
    ]);
  });

  it('expands several time tags on one line and sorts the result', () => {
    const lines = parseLrc('[00:30.00][00:05.00]chorus\n[00:10.00]verse');
    expect(lines.map((l) => [l.startMs, l.text])).toEqual([
      [5_000, 'chorus'],
      [10_000, 'verse'],
      [30_000, 'chorus'],
    ]);
  });

  it('applies [offset:] and ignores metadata tags', () => {
    const lines = parseLrc('[ar:Artist]\n[ti:Title]\n[offset:+500]\n[00:02.00]line');
    expect(lines).toEqual([{ startMs: 1_500, text: 'line' }]);
  });

  it('strips enhanced-LRC word timings', () => {
    const [line] = parseLrc('[00:01.00]<00:01.00>word <00:01.50>by <00:02.00>word');
    expect(line?.text).toBe('word by word');
  });

  it('joins distinct texts that share a timestamp', () => {
    const [line] = parseLrc('[00:04.00]original\n[00:04.00]romanised');
    expect(line?.text).toBe('original\nromanised');
  });

  it('returns an empty list for plain text', () => {
    expect(parseLrc('no timing here\nat all')).toEqual([]);
  });
});
