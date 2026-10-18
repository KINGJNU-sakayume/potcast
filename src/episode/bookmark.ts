import { readJson, writeJson } from '../lib/storage';
import type { Episode } from './types';
import { storageKey } from '../lib/storageNamespace';

/**
 * Where the listener left an episode, kept in this browser so that the next
 * visit can carry on from there. One place per episode and release; an
 * episode that was heard to its end has none.
 */
export interface Bookmark {
  cueIndex: number;
  lineIndex: number;
}

interface Stored extends Bookmark {
  /** The number of cues the episode had: a script that has been rewritten since no longer fits its bookmark. */
  cues: number;
  savedAt: number;
}

const KEY = storageKey('episode.bookmarks.v1');
/** Bookmarks are few; the oldest are dropped beyond this many. */
const KEPT = 30;

const idOf = (episode: Episode): string => `${episode.key}@${episode.release?.id ?? ''}`;

function readAll(): Record<string, Stored> {
  const stored = readJson<Record<string, Stored>>(KEY);
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

/** Where the episode was left, if that is somewhere past its very start and still exists in the script. */
export function readBookmark(episode: Episode): Bookmark | null {
  const stored = readAll()[idOf(episode)];
  if (!stored || stored.cues !== episode.cues.length) return null;
  const { cueIndex, lineIndex } = stored;
  if (!Number.isInteger(cueIndex) || !Number.isInteger(lineIndex) || cueIndex < 0 || cueIndex >= episode.cues.length || lineIndex < 0) return null;
  if (cueIndex === 0 && lineIndex === 0) return null;
  const cue = episode.cues[cueIndex]!;
  return { cueIndex, lineIndex: cue.type === 'music' ? 0 : Math.min(lineIndex, cue.lines.length - 1) };
}

export function saveBookmark(episode: Episode, bookmark: Bookmark, now = Date.now()): void {
  const all = readAll();
  all[idOf(episode)] = { ...bookmark, cues: episode.cues.length, savedAt: now };
  const newest = Object.entries(all)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, KEPT);
  writeJson(KEY, Object.fromEntries(newest));
}

export function clearBookmark(episode: Episode): void {
  const all = readAll();
  if (!(idOf(episode) in all)) return;
  delete all[idOf(episode)];
  writeJson(KEY, all);
}
