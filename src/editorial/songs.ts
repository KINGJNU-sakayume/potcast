import { devWarn } from '../lib/devWarn';
import { loadSongNotes } from './loadNotes';
import type { SongNote } from './types';

/**
 * Song Listening Notes — one Markdown file per song in `notes/songs/`.
 *
 * A listening note is a cue for what to listen for, not a review. `trackIds`
 * come from open.spotify.com/track/<ID>: list the album cut and the single,
 * since the same recording usually has several IDs. `titles` (with the
 * artist's names) is the fallback, so the note also follows the song onto
 * compilations and editions whose IDs are not listed.
 *
 * The same note carries the song's curated translation, if any: a
 * `translation:` block, a `## 번역에 대하여` section, and the paired
 * `notes/songs/<key>.translation.json` with the timed segments. A broken
 * translation is skipped with a development warning (the tests load the same
 * files strictly and fail instead).
 */
export const SONG_NOTE_FILES = import.meta.glob<string>('./notes/songs/*.md', { query: '?raw', import: 'default', eager: true });
export const SONG_TRANSLATION_FILES = import.meta.glob('./notes/songs/*.translation.json', { import: 'default', eager: true });

export const songNotes: readonly SongNote[] = loadSongNotes(SONG_NOTE_FILES, SONG_TRANSLATION_FILES, { strict: false, warn: devWarn });
