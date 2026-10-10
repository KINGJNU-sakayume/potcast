import type { TimedLyricLine } from './types';

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/y;
const META_TAG = /^\[([a-z#]+):(.*)\]$/i;
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function toMs(minutes: string, seconds: string, fraction: string | undefined): number {
  const ms = fraction ? Number(fraction.padEnd(3, '0')) : 0;
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + ms;
}

/**
 * Parses LRC synced lyrics into sorted timed lines.
 * - supports several time tags per line and `[offset:±ms]`
 * - strips enhanced-LRC word timings
 * - empty timed lines mark instrumental gaps: they end the previous line
 * - each line's `endMs` is the next timed entry's start
 */
export function parseLrc(input: string): TimedLyricLine[] {
  let offsetMs = 0;
  const entries: Array<{ startMs: number; text: string; order: number }> = [];
  let order = 0;

  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const stamps: number[] = [];
    let cursor = 0;
    TIME_TAG.lastIndex = 0;
    for (let match = TIME_TAG.exec(line); match; match = TIME_TAG.exec(line)) {
      stamps.push(toMs(match[1]!, match[2]!, match[3]));
      cursor = TIME_TAG.lastIndex;
    }

    if (stamps.length === 0) {
      const meta = META_TAG.exec(line);
      if (meta && meta[1]!.toLowerCase() === 'offset') offsetMs = Number.parseInt(meta[2]!.trim(), 10) || 0;
      continue;
    }

    const text = line.slice(cursor).replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
    for (const stamp of stamps) entries.push({ startMs: Math.max(0, stamp - offsetMs), text, order: order++ });
  }

  entries.sort((a, b) => a.startMs - b.startMs || a.order - b.order);

  const lines: TimedLyricLine[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (!entry.text) continue;
    const previous = lines[lines.length - 1];
    if (previous && previous.startMs === entry.startMs) {
      // Two texts sharing a timestamp (e.g. romanisation) are shown together.
      if (previous.text !== entry.text) previous.text = `${previous.text}\n${entry.text}`;
      continue;
    }
    let endMs: number | undefined;
    for (let j = i + 1; j < entries.length; j += 1) {
      if (entries[j]!.startMs > entry.startMs) {
        endMs = entries[j]!.startMs;
        break;
      }
    }
    lines.push(endMs === undefined ? { startMs: entry.startMs, text: entry.text } : { startMs: entry.startMs, endMs, text: entry.text });
  }
  return lines;
}
