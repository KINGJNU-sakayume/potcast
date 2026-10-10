import { loadArtistNotes } from './loadNotes';
import type { ArtistNote } from './types';

/**
 * Artist Editorial Notes — one Markdown file per artist in `notes/artists/`.
 *
 * `artistIds` come from open.spotify.com/artist/<ID>. `names` lists every name
 * Spotify may display for the artist so a note still matches when the ID
 * differs. Artists without a file render from Spotify data alone.
 */
export const artistNotes: readonly ArtistNote[] = loadArtistNotes(
  import.meta.glob<string>('./notes/artists/*.md', { query: '?raw', import: 'default', eager: true }),
);
