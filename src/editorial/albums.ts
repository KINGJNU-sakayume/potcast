import { loadAlbumNotes } from './loadNotes';
import type { AlbumNote } from './types';

/**
 * Album Editorial Notes — one Markdown file per album in `notes/albums/`.
 *
 * `albumIds` come from open.spotify.com/album/<ID>; list every edition you
 * know of. `titles` is the fallback (with the artist's names and, when both
 * are known, the release year) for editions whose ID is not listed.
 */
export const albumNotes: readonly AlbumNote[] = loadAlbumNotes(
  import.meta.glob<string>('./notes/albums/*.md', { query: '?raw', import: 'default', eager: true }),
);
