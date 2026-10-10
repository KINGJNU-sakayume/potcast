import { describe, expect, it } from 'vitest';
import { clearBookmark, readBookmark, saveBookmark } from './bookmark';
import { episodeFrom, track } from './testing';
import type { Episode } from './types';

const TRACKS = [track('one', 200_000)];
const BODY = ['A: 하나.', 'B: 둘.', '> play one to 0:30', 'A: 셋.'].join('\n');

function episode(body = BODY, releaseId = 'album-1'): Episode {
  return { ...episodeFrom(body, TRACKS), release: { id: releaseId, name: 'Album', artistNames: 'Artist', images: [] } };
}

describe('bookmarks', () => {
  it('remember where an episode was left', () => {
    expect(readBookmark(episode())).toBeNull();
    saveBookmark(episode(), { cueIndex: 0, lineIndex: 1 });
    expect(readBookmark(episode())).toEqual({ cueIndex: 0, lineIndex: 1 });
    saveBookmark(episode(), { cueIndex: 2, lineIndex: 0 });
    expect(readBookmark(episode())).toEqual({ cueIndex: 2, lineIndex: 0 });
  });

  it('are kept per release', () => {
    saveBookmark(episode(BODY, 'album-1'), { cueIndex: 1, lineIndex: 0 });
    expect(readBookmark(episode(BODY, 'album-2'))).toBeNull();
    saveBookmark(episode(BODY, 'album-2'), { cueIndex: 2, lineIndex: 0 });
    expect(readBookmark(episode(BODY, 'album-1'))).toEqual({ cueIndex: 1, lineIndex: 0 });
  });

  it('do not count the very start as a place', () => {
    saveBookmark(episode(), { cueIndex: 0, lineIndex: 0 });
    expect(readBookmark(episode())).toBeNull();
  });

  it('are dropped when the script has changed since', () => {
    saveBookmark(episode(), { cueIndex: 2, lineIndex: 0 });
    expect(readBookmark(episode(`${BODY}\n> play one from 1:00 to 1:10`))).toBeNull();
  });

  it('are cleared when the episode has been heard out', () => {
    saveBookmark(episode(), { cueIndex: 1, lineIndex: 0 });
    clearBookmark(episode());
    expect(readBookmark(episode())).toBeNull();
    clearBookmark(episode());
  });

  it('survive something unreadable in storage', () => {
    window.localStorage.setItem('arc.episode.bookmarks.v1', '[1, 2');
    expect(readBookmark(episode())).toBeNull();
    window.localStorage.setItem('arc.episode.bookmarks.v1', JSON.stringify({ 'test-album@album-1': { cueIndex: 9, lineIndex: 0, cues: 3, savedAt: 1 } }));
    expect(readBookmark(episode())).toBeNull();
    saveBookmark(episode(), { cueIndex: 0, lineIndex: 5 });
    // A line that no longer exists lands on the cue's last line.
    expect(readBookmark(episode())).toEqual({ cueIndex: 0, lineIndex: 1 });
  });

  it('keep only the most recent few', () => {
    for (let i = 0; i < 40; i += 1) saveBookmark(episode(BODY, `album-${i}`), { cueIndex: 1, lineIndex: 0 }, 1000 + i);
    expect(readBookmark(episode(BODY, 'album-39'))).not.toBeNull();
    expect(readBookmark(episode(BODY, 'album-0'))).toBeNull();
  });
});
